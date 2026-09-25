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
} from "@/lib/tracking/log";
import {
  episodeRatingInputSchema,
  episodeWatchedInputSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
} from "@/lib/tracking/schemas";
import { classifyTrackingError } from "@/lib/tracking/supabase-error";
import type {
  EpisodeTrackingError,
  EpisodeTrackingResult,
  SeasonUndo,
  SeasonWatchedResult,
} from "@/lib/tracking/types";
import { airStatus, todayUtc } from "@/lib/tv/air-status";
import { airedEpisodesForMarking } from "@/lib/tv/season-watch";

import { loadSeason } from "./[id]/season/[number]/load-season";

/**
 * The episode and season tracking mutations, as Server Actions (spec 0011,
 * API surface).
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
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** What one write's body settles on. */
type Step<T> =
  | { kind: "done"; value: T }
  | { kind: "refused"; error: EpisodeTrackingError }
  | { kind: "db_error"; error: { code?: string | null } };

type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: EpisodeTrackingError };

/**
 * The shared shape of every episode action after its input is parsed: the
 * session, the body, the error mapping and the log line.
 *
 * @param event The log event for a refusal.
 * @param body The TMDB check and the Supabase call, given the request client
 * and the verified user id.
 */
async function runEpisodeWrite<T>(
  event: TrackingEvent,
  body: (supabase: SupabaseClient, userId: string) => Promise<Step<T>>,
): Promise<Outcome<T>> {
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

/** A PostgREST response reduced to a `Step`. */
function settled<T>(error: { code?: string | null } | null, value: T): Step<T> {
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

/** Drops an `Outcome`'s value for the actions that return none. */
function withoutValue(outcome: Outcome<unknown>): EpisodeTrackingResult {
  return outcome.ok ? { ok: true } : outcome;
}

/**
 * Marks one episode watched, or clears the mark.
 *
 * Marking goes through `mark_episode_watched`, which keeps the first watched
 * date on a repeat (AC-5). Unmarking is an update only: it never creates a
 * row, skips TMDB so it works during an outage and for an episode TMDB later
 * dropped, and leaves the rating alone (AC-5, AC-7).
 */
export async function setEpisodeWatched(
  showId: number,
  seasonNumber: number,
  episodeId: number,
  watched: boolean,
): Promise<EpisodeTrackingResult> {
  const event = TRACKING_EVENT.episodeWatched;
  const input = parse(
    episodeWatchedInputSchema,
    { showId, seasonNumber, episodeId, watched },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.watched) {
    return withoutValue(
      await runEpisodeWrite(event, async (supabase) => {
        const episode = await confirmEpisode(
          input.showId,
          input.seasonNumber,
          input.episodeId,
        );
        if (episode.kind === "refused") return episode;
        const { error } = await supabase.rpc("mark_episode_watched", {
          p_show_id: input.showId,
          p_season_number: episode.seasonNumber,
          p_episode_number: episode.episodeNumber,
          p_episode_id: input.episodeId,
        });
        return settled(error, null);
      }),
    );
  }

  return withoutValue(
    await runEpisodeWrite(event, async (supabase, userId) => {
      const { error } = await supabase
        .from("user_episode_state")
        .update({ watched_at: null })
        .eq("user_id", userId)
        .eq("episode_id", input.episodeId);
      return settled(error, null);
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
    return withoutValue(
      await runEpisodeWrite(event, async (supabase) => {
        const episode = await confirmEpisode(
          input.showId,
          input.seasonNumber,
          input.episodeId,
        );
        if (episode.kind === "refused") return episode;
        const { error } = await supabase.rpc("rate_episode", {
          p_show_id: input.showId,
          p_season_number: episode.seasonNumber,
          p_episode_number: episode.episodeNumber,
          p_episode_id: input.episodeId,
          p_rating: score,
        });
        return settled(error, null);
      }),
    );
  }

  return withoutValue(
    await runEpisodeWrite(event, async (supabase, userId) => {
      const { error } = await supabase
        .from("user_episode_state")
        .update({ rating: null })
        .eq("user_id", userId)
        .eq("episode_id", input.episodeId);
      return settled(error, null);
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

  const outcome = input.watched
    ? await runEpisodeWrite<SeasonUndo | null>(event, async (supabase) => {
        const confirmed = await confirmSeason(input.showId, input.seasonNumber);
        if (confirmed.kind === "refused") return confirmed;

        const aired = airedEpisodesForMarking(
          confirmed.season.episodes,
          todayUtc(new Date()),
        );
        if (aired.ids.length === 0) return { kind: "done", value: null };

        const { data, error } = await supabase.rpc("mark_season_watched", {
          p_show_id: input.showId,
          p_season_number: confirmed.season.seasonNumber,
          p_episode_ids: aired.ids,
          p_episode_numbers: aired.numbers,
        });
        return settled(
          error,
          data && data.length > 0
            ? { kind: "unmark" as const, episodeIds: data }
            : null,
        );
      })
    : await runEpisodeWrite<SeasonUndo | null>(event, async (supabase) => {
        const { data, error } = await supabase.rpc("unmark_episodes_watched", {
          p_show_id: input.showId,
          p_episode_ids: input.episodeIds,
        });
        return settled(
          error,
          data && data.length > 0
            ? {
                kind: "restore" as const,
                entries: data.map((row) => ({
                  episodeId: row.episode_id,
                  watchedAt: row.watched_at,
                })),
              }
            : null,
        );
      });

  return outcome.ok ? { ok: true, undo: outcome.value } : outcome;
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
  return withoutValue(
    await runEpisodeWrite(event, async (supabase) => {
      if (request.kind === "unmark") {
        const { error } = await supabase.rpc("unmark_episodes_watched", {
          p_show_id: input.showId,
          p_episode_ids: request.episodeIds,
        });
        return settled(error, null);
      }
      const { error } = await supabase.rpc("restore_episodes_watched", {
        p_show_id: input.showId,
        p_entries: request.entries.map((entry) => ({
          episode_id: entry.episodeId,
          watched_at: entry.watchedAt,
        })),
      });
      return settled(error, null);
    }),
  );
}
