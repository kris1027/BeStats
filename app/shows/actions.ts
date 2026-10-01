"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import type { SeasonDetail } from "@/lib/tmdb";
import { applyAutoCompletion } from "@/lib/tracking/auto-completion";
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
  restoreShowStatusInputSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
  showStatusInputSchema,
} from "@/lib/tracking/schemas";
import { classifyTrackingError } from "@/lib/tracking/supabase-error";
import type {
  EpisodeTrackingError,
  EpisodeTrackingResult,
  MarkEpisodeWatchedResult,
  MovieTrackingError,
  SeasonUndo,
  SeasonWatchedResult,
  ShowStatusError,
  ShowStatusFlags,
  ShowStatusResult,
  ShowStatusUndo,
  TvStatus,
} from "@/lib/tracking/types";
import { airStatus, todayUtc } from "@/lib/tv/air-status";
import { airedEpisodesForMarking } from "@/lib/tv/season-watch";

import { loadShow } from "./[id]/load-show";
import { loadSeason } from "./[id]/season/[number]/load-season";

/**
 * The episode and season tracking mutations, as Server Actions (spec 0011,
 * API surface), and the TV status writes (spec 0013, API surface).
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
 * Every write that can watch an episode then runs the automatic completion
 * check before `refresh()` (spec 0015, AC-4), so the page that comes back
 * already shows the new status. The check never turns a successful write into
 * an error: it can only add `showCompleted: true` (AC-6).
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * What one write's body settles on. `E` is the refusals the body can return
 * itself: the episode classes, or the status ones for a status write.
 */
type Step<T, E extends TrackingOutcome = EpisodeTrackingError> =
  | { kind: "done"; value: T }
  | { kind: "refused"; error: E }
  | { kind: "db_error"; error: { code?: string | null } };

type Outcome<T, E extends TrackingOutcome = EpisodeTrackingError> =
  | { ok: true; value: T }
  | { ok: false; error: E | MovieTrackingError };

/**
 * The shared shape of every episode action after its input is parsed: the
 * session, the body, the error mapping and the log line.
 *
 * @param event The log event for a refusal.
 * @param body The TMDB check and the Supabase call, given the request client
 * and the verified user id.
 */
async function runEpisodeWrite<
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

/**
 * An episode write's result: whether it moved the show to Watching on its
 * own (spec 0013, AC-8), and whether the check after it moved the show to
 * Completed (spec 0015, AC-4).
 */
function withShowFlags(
  outcome: Outcome<ShowStatusFlags>,
): EpisodeTrackingResult {
  return outcome.ok ? { ok: true, ...outcome.value } : outcome;
}

/** A write that changed no status: every removal, and a failed write. */
const NO_STATUS_CHANGE: ShowStatusFlags = {
  showStarted: false,
  showCompleted: false,
};

/**
 * Runs the automatic completion check after a successful episode write
 * (spec 0015, AC-4) and reports whether it completed the show.
 *
 * @param newlyWatchedRegular Whether the write moved a regular (season 1 or
 * later) episode from unwatched to watched, which alone lets a Watching you
 * chose yourself complete. Always false for an Undo and for a special.
 */
async function completedAfterWrite(
  showId: number,
  newlyWatchedRegular: boolean,
): Promise<boolean> {
  const { changed } = await applyAutoCompletion(showId, {
    kind: "write",
    newlyWatchedRegular,
  });
  return changed === "completed";
}

/**
 * The `show_started` column the three episode functions return beside their
 * own result (spec 0013, AC-8). A missing row reads as false: only a `true`
 * the database reported may raise the toast.
 */
function showStartedFrom(
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
    ? await runEpisodeWrite(event, async (supabase) => {
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
        if (error) return { kind: "db_error", error };
        // As with `show_started`, only a `true` the database reported
        // counts: a missing row offers no Undo.
        const row = data?.[0];
        const newlyMarked = row?.newly_marked === true;
        return settled(null, {
          showStarted: showStartedFrom(data),
          showCompleted: await completedAfterWrite(
            input.showId,
            newlyMarked && episode.seasonNumber >= 1,
          ),
          newlyMarked,
          markedAt: newlyMarked ? (row?.watched_at ?? null) : null,
        });
      })
    : await runEpisodeWrite(event, async (supabase, userId) => {
        const { error } = await supabase
          .from("user_episode_state")
          .update({ watched_at: null })
          .eq("user_id", userId)
          .eq("episode_id", input.episodeId);
        return settled(error, {
          ...NO_STATUS_CHANGE,
          newlyMarked: false,
          markedAt: null,
        });
      });

  return outcome.ok ? { ok: true, ...outcome.value } : outcome;
}

/**
 * Undo for a mark made on an Up Next card (spec 0014, AC-9): clears the
 * watched mark only while it is still the one that tap stored.
 *
 * `newly_marked` decides whether Undo is offered; this is what keeps it
 * honest afterwards. The update matches `watched_at = markedAt` as well as
 * the owner and the episode, so if another tab unmarked and marked the
 * episode again, nothing matches and the Undo is refused as `undo_expired`
 * rather than clearing the newer mark (spec 0014, key invariants). Like every
 * removal it skips TMDB, and it never touches the rating or the status.
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
    await runEpisodeWrite(event, async (supabase, userId) => {
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
      return settled(error, NO_STATUS_CHANGE);
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
      await runEpisodeWrite(event, async (supabase) => {
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
        if (error) return { kind: "db_error", error };
        return settled(null, {
          showStarted: showStartedFrom(data),
          showCompleted: await completedAfterWrite(
            input.showId,
            data?.[0]?.newly_marked === true && episode.seasonNumber >= 1,
          ),
        });
      }),
    );
  }

  return withShowFlags(
    await runEpisodeWrite(event, async (supabase, userId) => {
      const { error } = await supabase
        .from("user_episode_state")
        .update({ rating: null })
        .eq("user_id", userId)
        .eq("episode_id", input.episodeId);
      return settled(error, NO_STATUS_CHANGE);
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

  type SeasonWrite = { undo: SeasonUndo | null } & ShowStatusFlags;
  const outcome = input.watched
    ? await runEpisodeWrite<SeasonWrite>(event, async (supabase) => {
        const confirmed = await confirmSeason(input.showId, input.seasonNumber);
        if (confirmed.kind === "refused") return confirmed;

        const aired = airedEpisodesForMarking(
          confirmed.season.episodes,
          todayUtc(new Date()),
        );
        if (aired.ids.length === 0) {
          return { kind: "done", value: { undo: null, ...NO_STATUS_CHANGE } };
        }

        const { data, error } = await supabase.rpc("mark_season_watched", {
          p_show_id: input.showId,
          p_season_number: confirmed.season.seasonNumber,
          p_episode_ids: aired.ids,
          p_episode_numbers: aired.numbers,
        });
        if (error) return { kind: "db_error", error };
        const marked = data?.[0]?.marked_ids ?? [];
        return settled(null, {
          undo:
            marked.length > 0
              ? { kind: "unmark" as const, episodeIds: marked }
              : null,
          showStarted: showStartedFrom(data),
          showCompleted: await completedAfterWrite(
            input.showId,
            marked.length > 0 && confirmed.season.seasonNumber >= 1,
          ),
        });
      })
    : await runEpisodeWrite<SeasonWrite>(event, async (supabase) => {
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
          ...NO_STATUS_CHANGE,
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
    await runEpisodeWrite(event, async (supabase) => {
      if (request.kind === "unmark") {
        const { error } = await supabase.rpc("unmark_episodes_watched", {
          p_show_id: input.showId,
          p_episode_ids: request.episodeIds,
        });
        return settled(error, NO_STATUS_CHANGE);
      }
      const { error } = await supabase.rpc("restore_episodes_watched", {
        p_show_id: input.showId,
        p_entries: request.entries.map((entry) => ({
          episode_id: entry.episodeId,
          watched_at: entry.watchedAt,
        })),
      });
      if (error) return { kind: "db_error", error };
      // Putting back dates an unmark cleared is not a new watch, so only a
      // row the system set can complete here (spec 0015, AC-4).
      return settled(null, {
        showStarted: false,
        showCompleted: await completedAfterWrite(input.showId, false),
      });
    }),
  );
}

/** A status write's body: its own refusals are status classes. */
type StatusStep = Step<ShowStatusUndo | null, ShowStatusError>;

/**
 * `BS409` is what `set_show_status` and `remove_show_status` raise when the
 * row no longer holds the status the caller saw, so a stale card never
 * overwrites or deletes a newer status. It is read here rather than in
 * `classifyTrackingError`, since only these two raise it.
 */
function settledStatus(
  error: { code?: string | null } | null,
  value: ShowStatusUndo | null,
): StatusStep {
  if (error?.code === "BS409") {
    return { kind: "refused", error: "status_changed" };
  }
  return settled(error, value);
}

/**
 * A status result, from the shared episode write shape.
 *
 * `status_changed` refreshes the page as a success does: nothing was written,
 * and the card or pill should now show the status that is really stored.
 */
function asShowStatusResult(
  outcome: Outcome<ShowStatusUndo | null, ShowStatusError>,
): ShowStatusResult {
  if (outcome.ok) return { ok: true, undo: outcome.value };
  if (outcome.error === "status_changed") refresh();
  return { ok: false, error: outcome.error };
}

/**
 * Sets a show's status by hand, or removes it with `null` (spec 0013, AC-2,
 * AC-4, AC-16, AC-18).
 *
 * `expected` is the status the caller last saw, or null for no row. The
 * database writes only while the row still holds it, and otherwise refuses
 * with `status_changed`, so a card rendered before a change made elsewhere
 * can never delete or overwrite the newer status.
 *
 * Setting goes through `set_show_status`, which always writes
 * `status_source = 'user'`; the source is never an input. Only a write that
 * creates the row (`expected` null) first confirms the show with TMDB (an
 * unknown or adult show is `not_found`, an outage `tmdb_unavailable`), so no
 * row is ever stored for a show the app cannot render. With `expected` set,
 * the function only updates an existing row, so it skips TMDB: Stop watching
 * works during an outage and for a show TMDB later drops, as removing through
 * `remove_show_status` does. Neither touches an episode row (AC-3).
 *
 * The result carries the Undo: the values the database reported replacing,
 * and what the row must still hold for the Undo to apply. It is null when
 * there was nothing to put back.
 */
export async function setShowStatus(
  showId: number,
  status: TvStatus | null,
  expected: TvStatus | null,
): Promise<ShowStatusResult> {
  const event = TRACKING_EVENT.showStatus;
  const input = parse(
    showStatusInputSchema,
    { showId, status, expected },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  const target = input.status;
  if (target === null) {
    return asShowStatusResult(
      await runEpisodeWrite(event, async (supabase): Promise<StatusStep> => {
        const { data, error } = await supabase.rpc("remove_show_status", {
          p_show_id: input.showId,
          // Non null: the schema refuses a removal that names no status.
          p_expected: input.expected as TvStatus,
        });
        const removed = data?.[0];
        return settledStatus(
          error,
          removed
            ? {
                expected: null,
                status: removed.status,
                source: removed.status_source,
                listedAt: removed.listed_at ?? null,
                removedAt: removed.removed_at,
              }
            : null,
        );
      }),
    );
  }

  return asShowStatusResult(
    await runEpisodeWrite(event, async (supabase): Promise<StatusStep> => {
      if (input.expected === null) {
        const show = await loadShow(input.showId);
        if (show.kind !== "found") {
          return {
            kind: "refused",
            error: show.kind === "failed" ? "tmdb_unavailable" : "not_found",
          };
        }
      }

      const { data, error } = await supabase.rpc("set_show_status", {
        p_show_id: input.showId,
        p_status: target,
        // Sent as null for "no row": the argument has no default, on purpose.
        p_expected: input.expected as TvStatus,
      });
      // The generated types call the previous columns non null; they are
      // null when there was no row, so each is read defensively.
      const row = data?.[0];
      const previousStatus = row?.previous_status ?? null;
      const previousSource = row?.previous_source ?? null;
      return settledStatus(
        error,
        previousStatus !== null && previousSource !== null
          ? {
              expected: target,
              status: previousStatus,
              source: previousSource,
              listedAt: row?.previous_listed_at ?? null,
              removedAt: null,
            }
          : null,
      );
    }),
  );
}

/**
 * The Undo on a status toast: a removal, or Stop watching on the watchlist
 * (spec 0013, AC-4, AC-16, AC-19).
 *
 * The payload is what `setShowStatus` returned. `restore_show_status` applies
 * it only while the row is still what the undone action left, within 10
 * minutes, and never with a time in the future; anything else comes back as
 * `undo_expired`. A removal's Undo recreates the row, but only with values
 * the database itself reported a moment ago, so it needs no TMDB check.
 */
export async function restoreShowStatus(
  showId: number,
  undo: ShowStatusUndo,
): Promise<ShowStatusResult> {
  const event = TRACKING_EVENT.restoreShowStatus;
  const input = parse(restoreShowStatusInputSchema, { showId, undo }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const request = input.undo;
  return asShowStatusResult(
    await runEpisodeWrite(event, async (supabase): Promise<StatusStep> => {
      const { error } = await supabase.rpc("restore_show_status", {
        p_show_id: input.showId,
        p_status: request.status,
        p_source: request.source,
        // Left out rather than sent as null: the three carry null defaults.
        ...(request.expected !== null && { p_expected: request.expected }),
        ...(request.listedAt !== null && { p_listed_at: request.listedAt }),
        ...(request.removedAt !== null && { p_removed_at: request.removedAt }),
      });
      return settled(error, null);
    }),
  );
}
