"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import type { SeasonDetail } from "@/lib/tmdb";
import {
  logTrackingEvent,
  TRACKING_EVENT,
  type TrackingEvent,
  type TrackingOutcome,
} from "@/lib/tracking/log";
import {
  episodeMarkUndoInputSchema,
  episodeRatingInputSchema,
  episodeWatchedInputSchema,
  restoreShowTrackingInputSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
  showHoldInputSchema,
  trackShowInputSchema,
  untrackShowInputSchema,
} from "@/lib/tracking/schemas";
import { classifyTrackingError } from "@/lib/tracking/supabase-error";
import type {
  EpisodeTrackingError,
  EpisodeTrackingResult,
  MarkEpisodeWatchedResult,
  MovieTrackingError,
  SeasonUndo,
  SeasonWatchedResult,
  ShowHold,
  ShowTrackingError,
  ShowTrackingFlags,
  ShowTrackingResult,
  ShowTrackingUndo,
  UntrackShowResult,
} from "@/lib/tracking/types";
import { airStatus, todayUtc } from "@/lib/tv/air-status";
import { airedEpisodesForMarking } from "@/lib/tv/season-watch";

import { loadShow } from "./[id]/load-show";
import { loadSeason } from "./[id]/season/[number]/load-season";

/**
 * The episode and season tracking mutations, as Server Actions (spec 0011,
 * API surface), and the show tracking writes (spec 0020, API surface).
 *
 * The same order as `app/movies/actions.ts`: Zod parse, then the verified
 * session, then (for a write that can create a row) the TMDB season read and
 * the air status check, then the write through Row Level Security, then
 * `refresh()` on success only. Each takes target values, never toggles, so a
 * queued repeat lands on the same rows (AC-16).
 *
 * None throws or redirects: every failure is a returned result, so the client
 * rolls back with a toast rather than an error boundary (AC-13). `user_id` is
 * always the session's, and the season and episode numbers stored on a new row
 * are always TMDB's, never the client's (AC-7, AC-19).
 *
 * No write here decides a library page: the page a show sits on is worked out
 * on every request from its episodes and TMDB (spec 0020, AC-7), so a mark
 * only has to land, and `refresh()` brings the card's new place.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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
  | { ok: false; error: E | MovieTrackingError };

/**
 * The shared shape of every tracking write after its input is parsed, an
 * episode mark or a show's tracking alike: the session, the body, the error
 * mapping and the log line.
 *
 * @param event The log event for a refusal.
 * @param body The TMDB check and the Supabase call, given the request client
 * and the verified user id.
 */
async function runTrackingWrite<
  T,
  E extends TrackingOutcome = EpisodeTrackingError,
>(
  event: TrackingEvent,
  body: (supabase: SupabaseClient, userId: string) => Promise<Step<T, E>>,
): Promise<Outcome<T, E>> {
  let value: T;
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }

    const step = await body(await createClient(), user.id);
    if (step.kind === "refused") {
      logTrackingEvent(event, step.error);
      return { ok: false, error: step.error };
    }
    if (step.kind === "db_error") {
      const classified = classifyTrackingError(step.error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    value = step.value;
  } catch {
    // A network failure inside supabase-js, or a bug surfaced by
    // `loadSeason`. The error is dropped on purpose: its message can carry
    // request details that must not reach a log line (AC-22).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  refresh();
  return { ok: true, value };
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

/** Parses an action's arguments, or reports `invalid_input` (AC-15). */
function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  event: TrackingEvent,
): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  logTrackingEvent(event, "invalid_input");
  return null;
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
 * The `show_started` column the three episode functions return beside their
 * own result, which since spec 0020 means "this write tracked the show"
 * (AC-5). A missing row reads as false: only a `true` the database reported
 * may raise the toast.
 */
function showTrackedFrom(
  data: readonly { show_started: boolean | null }[] | null,
): boolean {
  return data?.[0]?.show_started === true;
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
export async function setEpisodeWatched(
  showId: number,
  seasonNumber: number,
  episodeId: number,
  watched: boolean,
): Promise<MarkEpisodeWatchedResult> {
  const event = TRACKING_EVENT.episodeWatched;
  const input = parse(
    episodeWatchedInputSchema,
    { showId, seasonNumber, episodeId, watched },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  const outcome = input.watched
    ? await runTrackingWrite(event, async (supabase) => {
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
        // As with `show_started`, only a `true` the database reported
        // counts: a missing row offers no Undo.
        const row = data?.[0];
        const newlyMarked = row?.newly_marked === true;
        return settled(error, {
          showTracked: showTrackedFrom(data),
          newlyMarked,
          markedAt: newlyMarked ? (row?.watched_at ?? null) : null,
        });
      })
    : await runTrackingWrite(event, async (supabase, userId) => {
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
export async function undoEpisodeMark(
  showId: number,
  episodeId: number,
  markedAt: string,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeUndoMark;
  const input = parse(
    episodeMarkUndoInputSchema,
    { showId, episodeId, markedAt },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return withShowFlags(
    await runTrackingWrite(event, async (supabase, userId) => {
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
export async function setEpisodeRating(
  showId: number,
  seasonNumber: number,
  episodeId: number,
  rating: number | null,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeRate;
  const input = parse(
    episodeRatingInputSchema,
    { showId, seasonNumber, episodeId, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  const score = input.rating;
  if (score !== null) {
    return withShowFlags(
      await runTrackingWrite(event, async (supabase) => {
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
    await runTrackingWrite(event, async (supabase, userId) => {
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
export async function setSeasonWatched(
  showId: number,
  seasonNumber: number,
  watched: boolean,
  episodeIds?: number[],
): Promise<SeasonWatchedResult> {
  const event = TRACKING_EVENT.seasonWatched;
  const input = parse(
    seasonWatchedInputSchema,
    watched
      ? { showId, seasonNumber, watched }
      : { showId, seasonNumber, watched, episodeIds },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  type SeasonWrite = { undo: SeasonUndo | null } & ShowTrackingFlags;
  const outcome = input.watched
    ? await runTrackingWrite<SeasonWrite>(event, async (supabase) => {
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
    : await runTrackingWrite<SeasonWrite>(event, async (supabase) => {
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
export async function undoSeasonWatched(
  showId: number,
  undo: SeasonUndo,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.seasonUndo;
  const input = parse(seasonUndoInputSchema, { showId, undo }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const request = input.undo;
  return withShowFlags(
    await runTrackingWrite(event, async (supabase) => {
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

/** A tracking write's body: its own refusals are tracking classes. */
type TrackingStep<T> = Step<T, ShowTrackingError>;

/**
 * `BS409` is what `set_show_hold` and `untrack_show` raise when the row no
 * longer holds the hold the caller saw, and `BS404` when there is no row, so
 * a stale pill or card never overwrites or deletes a newer state (spec 0020,
 * AC-4). Read here rather than in `classifyTrackingError`, since only these
 * raise them.
 */
function settledTracking<T>(
  error: { code?: string | null } | null,
  value: T,
): TrackingStep<T> {
  if (error?.code === "BS409") {
    return { kind: "refused", error: "hold_changed" };
  }
  if (error?.code === "BS404") {
    return { kind: "refused", error: "not_tracked" };
  }
  return settled(error, value);
}

/**
 * A changed elsewhere refusal refreshes the page as a success does: nothing
 * was written, and the pill or card should now show what is really stored
 * (AC-4).
 */
function refreshOnStale<T>(
  outcome: Outcome<T, ShowTrackingError>,
): Outcome<T, ShowTrackingError> {
  if (
    !outcome.ok &&
    (outcome.error === "hold_changed" || outcome.error === "not_tracked")
  ) {
    refresh();
  }
  return outcome;
}

/**
 * Tracks a show with no hold: Plan to watch, and the empty card bookmark
 * (spec 0020, AC-2, AC-6). It creates a row, so it first confirms the show
 * with TMDB (an unknown or adult show is `not_found`, an outage
 * `tmdb_unavailable`), and no row is ever stored for a show the app cannot
 * render. Tracking a tracked show changes nothing, its hold included.
 */
export async function trackShow(showId: number): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.trackShow;
  const input = parse(trackShowInputSchema, { showId }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const outcome = await runTrackingWrite<null, ShowTrackingError>(
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
 * Pauses, drops or resumes a tracked show (spec 0020, AC-2, AC-4, AC-10).
 *
 * `expected` is the hold the caller last saw. The database writes only while
 * the row still holds it, and otherwise refuses with `hold_changed` and the
 * page refreshes. It only ever updates an existing row, so it skips TMDB:
 * Resume works during an outage and for a show TMDB later drops. It never
 * touches an episode row.
 */
export async function setShowHold(
  showId: number,
  hold: ShowHold | null,
  expected: ShowHold | null,
): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.showHold;
  const input = parse(showHoldInputSchema, { showId, hold, expected }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const outcome = refreshOnStale(
    await runTrackingWrite<null, ShowTrackingError>(event, async (supabase) => {
      const { error } = await supabase.rpc("set_show_hold", {
        p_show_id: input.showId,
        // Sent as null for "no hold": the arguments have no default, on
        // purpose, so a call can never leave one out by accident.
        p_hold: input.hold,
        p_expected: input.expected,
      });
      return settledTracking(error, null);
    }),
  );
  return withoutValue(outcome);
}

/**
 * Stops tracking a show (spec 0020, AC-3, AC-4, AC-6): the row goes, and
 * every episode mark and rating stays. Over the hold the caller last saw, as
 * `setShowHold` is. Like every removal it skips TMDB. The result carries the
 * Undo: the times and hold the database reported deleting.
 */
export async function untrackShow(
  showId: number,
  expected: ShowHold | null,
): Promise<UntrackShowResult> {
  const event = TRACKING_EVENT.untrackShow;
  const input = parse(untrackShowInputSchema, { showId, expected }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const outcome = refreshOnStale(
    await runTrackingWrite<ShowTrackingUndo | null, ShowTrackingError>(
      event,
      async (supabase) => {
        const { data, error } = await supabase.rpc("untrack_show", {
          p_show_id: input.showId,
          p_expected: input.expected,
        });
        const row = data?.[0];
        return settledTracking(
          error,
          row
            ? {
                trackedAt: row.tracked_at,
                hold: row.hold_state ?? null,
                holdChangedAt: row.hold_changed_at ?? null,
              }
            : null,
        );
      },
    ),
  );
  if (!outcome.ok) return outcome;
  // The function raises rather than returning no row; this guards a bug.
  if (outcome.value === null) return { ok: false, error: "write_failed" };
  return { ok: true, undo: outcome.value };
}

/**
 * The Undo of Stop tracking (spec 0020, AC-3): puts the row back with the
 * values `untrackShow` returned, so the show returns to its old place. It
 * recreates the row only with values the database itself reported a moment
 * ago, so it needs no TMDB check. `restore_show_tracking` bounds them again,
 * and a show that is tracked again already, or a value out of bounds, comes
 * back as `undo_expired`.
 */
export async function restoreShowTracking(
  showId: number,
  undo: ShowTrackingUndo,
): Promise<ShowTrackingResult> {
  const event = TRACKING_EVENT.restoreShowTracking;
  const input = parse(restoreShowTrackingInputSchema, { showId, undo }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const request = input.undo;
  const outcome = await runTrackingWrite<null, ShowTrackingError>(
    event,
    async (supabase) => {
      const { error } = await supabase.rpc("restore_show_tracking", {
        p_show_id: input.showId,
        p_tracked_at: request.trackedAt,
        // Left out rather than sent as null: both carry null defaults.
        ...(request.hold !== null && { p_hold: request.hold }),
        ...(request.holdChangedAt !== null && {
          p_hold_changed_at: request.holdChangedAt,
        }),
      });
      return settled(error, null);
    },
  );
  return withoutValue(outcome);
}
