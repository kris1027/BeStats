import "server-only";

import type {
  episodeMarkUndoInputSchema,
  episodeRatingInputSchema,
  episodeWatchedInputSchema,
  restoreShowTrackingInputSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
  trackShowInputSchema,
  untrackShowInputSchema,
} from "@bestats/core/tracking/schemas";
import type {
  EpisodeTrackingError,
  EpisodeTrackingResult,
  MarkEpisodeWatchedResult,
  SeasonUndo,
  SeasonWatchedResult,
  ShowTrackingError,
  ShowTrackingFlags,
  ShowTrackingResult,
  ShowTrackingUndo,
  TrackingError,
  UntrackShowResult,
} from "@bestats/core/tracking/types";
import { airStatus, todayUtc } from "@bestats/core/tv/air-status";
import { airedEpisodesForMarking } from "@bestats/core/tv/season-watch";
import type { z } from "zod";
import type { SeasonDetail } from "@/lib/tmdb";
import { loadSeason } from "@/lib/tmdb/load-season";
import { loadShow } from "@/lib/tmdb/load-show";

import {
  logTrackingEvent,
  TRACKING_EVENT,
  type TrackingEvent,
  type TrackingOutcome,
} from "../log";
import { classifyTrackingError } from "../supabase-error";
import type { TrackingClient, TrackingDeps } from "./run";

/**
 * The episode, season and show tracking commands (spec 0011 and spec 0020,
 * API surface), shared by the Server Actions in `app/shows/actions.ts` and the
 * `/api/v1/me` show routes (spec 0033, AC-5).
 *
 * Each runs after its input is parsed and its user verified: for a write that
 * can create a row, the TMDB season read and the air status check, then the
 * write through Row Level Security. Each takes target values, never toggles,
 * so a queued repeat lands on the same rows. None throws: every failure is a
 * returned result. `user_id` is always the verified user's, and the season
 * and episode numbers stored on a new row are always TMDB's, never the
 * client's. No command decides a library page; placement is worked out per
 * request (spec 0020, AC-7).
 */

/**
 * What one write's body settles on. `E` is the refusals the body can return
 * itself: the episode classes, or the tracking ones for a tracking write.
 */
type Step<T, E extends TrackingOutcome = EpisodeTrackingError> =
  | { kind: "done"; value: T }
  | { kind: "refused"; error: E }
  | { kind: "db_error"; error: { code?: string | null } };

type Outcome<T, E extends TrackingOutcome = EpisodeTrackingError> =
  | { ok: true; value: T }
  | { ok: false; error: E | TrackingError };

/**
 * The shared shape of every show tracking command after its input is parsed:
 * the body (catalog check and write), the error mapping and the log line. The
 * caller's session is already verified, by the Server Action's cookie wrapper
 * or the v1 route's bearer check, and nothing here calls `refresh()` (spec
 * 0035, shared command layer).
 *
 * @param deps The verified user and how to open their RLS bound client.
 * @param event The log event for a refusal.
 * @param body The TMDB check and the Supabase call, given the client and the
 * verified user id.
 */
async function runShowCommand<
  T,
  E extends TrackingOutcome = EpisodeTrackingError,
>(
  deps: TrackingDeps,
  event: TrackingEvent,
  body: (supabase: TrackingClient, userId: string) => Promise<Step<T, E>>,
): Promise<Outcome<T, E>> {
  try {
    const step = await body(await deps.getClient(), deps.userId);
    if (step.kind === "refused") {
      logTrackingEvent(event, step.error);
      return { ok: false, error: step.error };
    }
    if (step.kind === "db_error") {
      const classified = classifyTrackingError(step.error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    return { ok: true, value: step.value };
  } catch {
    // A network failure inside supabase-js, or a bug surfaced by
    // `loadSeason`. The error is dropped on purpose: its message can carry
    // request details that must not reach a log line (spec 0011, AC-22).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }
}

/**
 * A write whose caller needs only whether it landed: the show tracking
 * actions answer `{ ok: true }`, never the body's placeholder value.
 */
function withoutValue<E>(
  outcome: { ok: true } | { ok: false; error: E },
): { ok: true } | { ok: false; error: E } {
  return outcome.ok ? { ok: true } : outcome;
}

/** A PostgREST response reduced to a `Step`; it never refuses on its own. */
function settled<T>(
  error: { code?: string | null } | null,
  value: T,
): Step<T, never> {
  return error ? { kind: "db_error", error } : { kind: "done", value };
}

/**
 * The season as TMDB lists it right now, or the refusal a creating write
 * returns: `not_found` for an unknown or adult show or an unlisted season,
 * `tmdb_unavailable` for an outage (AC-7).
 */
async function confirmSeason(
  showId: number,
  seasonNumber: number,
): Promise<
  | { kind: "ok"; season: SeasonDetail }
  | { kind: "refused"; error: EpisodeTrackingError }
> {
  const result = await loadSeason(showId, seasonNumber);
  if (result.kind === "found") return { kind: "ok", season: result.season };
  return {
    kind: "refused",
    error: result.kind === "failed" ? "tmdb_unavailable" : "not_found",
  };
}

/**
 * The episode's TMDB numbers, once the season lists it and it is not still to
 * air (AC-3, AC-7). `unknown` is allowed: an episode with no date can be
 * tracked one at a time.
 */
async function confirmEpisode(
  showId: number,
  seasonNumber: number,
  episodeId: number,
): Promise<
  | { kind: "ok"; seasonNumber: number; episodeNumber: number }
  | { kind: "refused"; error: EpisodeTrackingError }
> {
  const confirmed = await confirmSeason(showId, seasonNumber);
  if (confirmed.kind === "refused") return confirmed;

  const episode = confirmed.season.episodes.find(
    (item) => item.id === episodeId,
  );
  if (!episode) return { kind: "refused", error: "not_found" };
  if (airStatus(episode.airDate, todayUtc(new Date())) === "upcoming") {
    return { kind: "refused", error: "not_aired" };
  }
  return {
    kind: "ok",
    seasonNumber: confirmed.season.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };
}

/** An episode write's result, with whether it tracked the show (AC-5). */
function withShowFlags(
  outcome: Outcome<ShowTrackingFlags>,
): EpisodeTrackingResult {
  return outcome.ok ? { ok: true, ...outcome.value } : outcome;
}

/** A write that tracked nothing: every removal, and a failed write. */
const NOT_TRACKED: ShowTrackingFlags = { showTracked: false };

/**
 * The `show_tracked` column the three episode functions return beside their
 * own result: "this write tracked the show" (spec 0020, AC-5). A missing row
 * reads as false: only a `true` the database reported may raise the toast.
 */
function showTrackedFrom(
  data: readonly { show_tracked: boolean | null }[] | null,
): boolean {
  return data?.[0]?.show_tracked === true;
}

/**
 * Marks one episode watched, or clears the mark.
 *
 * Marking goes through `mark_episode_watched`, which keeps the first watched
 * date on a repeat (AC-5) and reports `newly_marked`, true only for the call
 * that set the mark (spec 0014, AC-9), so Up Next never offers an Undo that
 * would clear a mark made elsewhere. Unmarking is an update only: it never
 * creates a row, skips TMDB so it works during an outage and for an episode
 * TMDB later dropped, and leaves the rating alone (AC-5, AC-7).
 */
export async function setEpisodeWatchedCommand(
  deps: TrackingDeps,
  input: z.infer<typeof episodeWatchedInputSchema>,
): Promise<MarkEpisodeWatchedResult> {
  const event = TRACKING_EVENT.episodeWatched;

  const outcome = input.watched
    ? await runShowCommand(deps, event, async (supabase) => {
        const episode = await confirmEpisode(
          input.showId,
          input.seasonNumber,
          input.episodeId,
        );
        if (episode.kind === "refused") return episode;
        const { data, error } = await supabase.rpc("mark_episode_watched", {
          p_show_id: input.showId,
          p_season_number: episode.seasonNumber,
          p_episode_number: episode.episodeNumber,
          p_episode_id: input.episodeId,
        });
        // As with `show_tracked`, only a `true` the database reported
        // counts: a missing row offers no Undo.
        const row = data?.[0];
        const newlyMarked = row?.newly_marked === true;
        return settled(error, {
          showTracked: showTrackedFrom(data),
          newlyMarked,
          markedAt: newlyMarked ? (row?.watched_at ?? null) : null,
        });
      })
    : await runShowCommand(deps, event, async (supabase, userId) => {
        const { error } = await supabase
          .from("user_episode_state")
          .update({ watched_at: null })
          .eq("user_id", userId)
          .eq("episode_id", input.episodeId);
        return settled(error, {
          ...NOT_TRACKED,
          newlyMarked: false,
          markedAt: null,
        });
      });

  return outcome.ok ? { ok: true, ...outcome.value } : outcome;
}

/**
 * Undo for a mark made on a Watchlist show card (spec 0014, AC-9; spec 0020,
 * AC-9): clears the watched mark only while it is still the one that tap
 * stored.
 *
 * `newly_marked` decides whether Undo is offered; this is what keeps it
 * honest afterwards. The update matches `watched_at = markedAt` as well as
 * the owner and the episode, so if another tab unmarked and marked the
 * episode again, nothing matches and the Undo is refused as `undo_expired`
 * rather than clearing the newer mark (spec 0014, key invariants). Like every
 * removal it skips TMDB, and it never touches the rating or the tracking.
 */
export async function undoEpisodeMarkCommand(
  deps: TrackingDeps,
  input: z.infer<typeof episodeMarkUndoInputSchema>,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeUndoMark;

  return withShowFlags(
    await runShowCommand(deps, event, async (supabase, userId) => {
      const { data, error } = await supabase
        .from("user_episode_state")
        .update({ watched_at: null })
        .eq("user_id", userId)
        .eq("show_id", input.showId)
        .eq("episode_id", input.episodeId)
        .eq("watched_at", input.markedAt)
        .select("episode_id");
      if (!error && data.length === 0) {
        return { kind: "refused", error: "undo_expired" };
      }
      return settled(error, NOT_TRACKED);
    }),
  );
}

/**
 * Stores a personal score from 1 to 10, or clears it.
 *
 * A score goes through `rate_episode`, which also marks an unwatched episode
 * watched in the same statement (AC-6). Clearing touches only `rating`, so the
 * watched mark survives, and like every removal it skips TMDB (AC-7).
 */
export async function setEpisodeRatingCommand(
  deps: TrackingDeps,
  input: z.infer<typeof episodeRatingInputSchema>,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeRate;

  const score = input.rating;
  if (score !== null) {
    return withShowFlags(
      await runShowCommand(deps, event, async (supabase) => {
        const episode = await confirmEpisode(
          input.showId,
          input.seasonNumber,
          input.episodeId,
        );
        if (episode.kind === "refused") return episode;
        const { data, error } = await supabase.rpc("rate_episode", {
          p_show_id: input.showId,
          p_season_number: episode.seasonNumber,
          p_episode_number: episode.episodeNumber,
          p_episode_id: input.episodeId,
          p_rating: score,
        });
        return settled(error, { showTracked: showTrackedFrom(data) });
      }),
    );
  }

  return withShowFlags(
    await runShowCommand(deps, event, async (supabase, userId) => {
      const { error } = await supabase
        .from("user_episode_state")
        .update({ rating: null })
        .eq("user_id", userId)
        .eq("episode_id", input.episodeId);
      return settled(error, NOT_TRACKED);
    }),
  );
}

/**
 * Marks every aired episode of a season watched, or unmarks the season.
 *
 * Marking takes its episodes from the TMDB season read at this moment, never
 * from the client, and only those whose air status is `aired` (AC-9). The ids
 * `mark_season_watched` reports as newly marked become the Undo (AC-10).
 *
 * Unmarking takes the ids the page rendered, which may include `unknown` and
 * `upcoming` episodes marked one at a time (AC-11). It skips TMDB: the
 * function only ever clears the caller's own watched rows, which the caller
 * may always do. The dates it cleared become the Undo.
 */
export async function setSeasonWatchedCommand(
  deps: TrackingDeps,
  input: z.infer<typeof seasonWatchedInputSchema>,
): Promise<SeasonWatchedResult> {
  const event = TRACKING_EVENT.seasonWatched;

  type SeasonWrite = { undo: SeasonUndo | null } & ShowTrackingFlags;
  const outcome = input.watched
    ? await runShowCommand<SeasonWrite>(deps, event, async (supabase) => {
        const confirmed = await confirmSeason(input.showId, input.seasonNumber);
        if (confirmed.kind === "refused") return confirmed;

        const aired = airedEpisodesForMarking(
          confirmed.season.episodes,
          todayUtc(new Date()),
        );
        if (aired.ids.length === 0) {
          return { kind: "done", value: { undo: null, ...NOT_TRACKED } };
        }

        const { data, error } = await supabase.rpc("mark_season_watched", {
          p_show_id: input.showId,
          p_season_number: confirmed.season.seasonNumber,
          p_episode_ids: aired.ids,
          p_episode_numbers: aired.numbers,
        });
        const marked = data?.[0]?.marked_ids ?? [];
        return settled(error, {
          undo:
            marked.length > 0
              ? { kind: "unmark" as const, episodeIds: marked }
              : null,
          showTracked: showTrackedFrom(data),
        });
      })
    : await runShowCommand<SeasonWrite>(deps, event, async (supabase) => {
        const { data, error } = await supabase.rpc("unmark_episodes_watched", {
          p_show_id: input.showId,
          p_episode_ids: input.episodeIds,
        });
        return settled(error, {
          undo:
            data && data.length > 0
              ? {
                  kind: "restore" as const,
                  entries: data.map((row) => ({
                    episodeId: row.episode_id,
                    watchedAt: row.watched_at,
                  })),
                }
              : null,
          ...NOT_TRACKED,
        });
      });

  return outcome.ok ? { ok: true, ...outcome.value } : outcome;
}

/**
 * The Undo on a season toast (AC-10, AC-11).
 *
 * `unmark` clears exactly the ids a mark reported as newly marked, so episodes
 * watched earlier keep their dates. `restore` puts back the dates an unmark
 * cleared, bounded in `restore_episodes_watched` (still unwatched, changed in
 * the last 10 minutes, never in the future); nothing qualifying comes back as
 * `undo_expired`. Neither inserts a row, so neither needs TMDB.
 */
export async function undoSeasonWatchedCommand(
  deps: TrackingDeps,
  input: z.infer<typeof seasonUndoInputSchema>,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.seasonUndo;

  const request = input.undo;
  return withShowFlags(
    await runShowCommand(deps, event, async (supabase) => {
      if (request.kind === "unmark") {
        const { error } = await supabase.rpc("unmark_episodes_watched", {
          p_show_id: input.showId,
          p_episode_ids: request.episodeIds,
        });
        return settled(error, NOT_TRACKED);
      }
      const { error } = await supabase.rpc("restore_episodes_watched", {
        p_show_id: input.showId,
        p_entries: request.entries.map((entry) => ({
          episode_id: entry.episodeId,
          watched_at: entry.watchedAt,
        })),
      });
      return settled(error, NOT_TRACKED);
    }),
  );
}

/**
 * Tracks a show: Plan to watch, and the empty card bookmark (spec 0020,
 * AC-2, AC-6). It creates a row, so it first confirms the show with TMDB (an
 * unknown or adult show is `not_found`, an outage `tmdb_unavailable`), and no
 * row is ever stored for a show the app cannot render. Tracking a tracked
 * show changes nothing.
 */
export async function trackShowCommand(
  deps: TrackingDeps,
  input: z.infer<typeof trackShowInputSchema>,
): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.trackShow;

  const outcome = await runShowCommand<null, ShowTrackingError>(
    deps,
    event,
    async (supabase) => {
      const show = await loadShow(input.showId);
      if (show.kind !== "found") {
        return {
          kind: "refused",
          error: show.kind === "failed" ? "tmdb_unavailable" : "not_found",
        };
      }
      const { error } = await supabase.rpc("track_show", {
        p_show_id: input.showId,
      });
      return settled(error, null);
    },
  );
  return withoutValue(outcome);
}

/**
 * Stops tracking a show (spec 0020, AC-3, AC-4, AC-6): the row goes, and
 * every episode mark and rating stays. Idempotent: a show another tab
 * already stopped deletes nothing and comes back with no Undo. Like every
 * removal it skips TMDB. Otherwise the result carries the Undo: the
 * `tracked_at` the database reported deleting.
 */
export async function untrackShowCommand(
  deps: TrackingDeps,
  input: z.infer<typeof untrackShowInputSchema>,
): Promise<UntrackShowResult> {
  const event = TRACKING_EVENT.untrackShow;

  const outcome = await runShowCommand<
    ShowTrackingUndo | null,
    ShowTrackingError
  >(deps, event, async (supabase) => {
    const { data, error } = await supabase.rpc("untrack_show", {
      p_show_id: input.showId,
    });
    const row = data?.[0];
    return settled(error, row ? { trackedAt: row.tracked_at } : null);
  });
  if (!outcome.ok) return outcome;
  return { ok: true, undo: outcome.value };
}

/**
 * The Undo of Stop tracking (spec 0020, AC-3): puts the row back with the
 * `tracked_at` `untrackShow` returned, so the show returns to its old place.
 * It recreates the row only with a value the database itself reported a
 * moment ago, so it needs no TMDB check. `restore_show_tracking` bounds it
 * again, and a show that is tracked again already, or a time out of bounds,
 * comes back as `undo_expired`.
 */
export async function restoreShowTrackingCommand(
  deps: TrackingDeps,
  input: z.infer<typeof restoreShowTrackingInputSchema>,
): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.restoreShowTracking;

  const outcome = await runShowCommand<null, ShowTrackingError>(
    deps,
    event,
    async (supabase) => {
      const { error } = await supabase.rpc("restore_show_tracking", {
        p_show_id: input.showId,
        p_tracked_at: input.undo.trackedAt,
      });
      return settled(error, null);
    },
  );
  return withoutValue(outcome);
}
