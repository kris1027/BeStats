"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { isMovieReleased } from "@/lib/catalog/movie-page";
import { createClient } from "@/lib/supabase/server";
import {
  logTrackingEvent,
  TRACKING_EVENT,
  type TrackingEvent,
} from "@/lib/tracking/log";
import {
  ratingInputSchema,
  restoreWatchedInputSchema,
  restoreWatchlistInputSchema,
  watchedInputSchema,
  watchlistInputSchema,
} from "@/lib/tracking/schemas";
import { classifyTrackingError } from "@/lib/tracking/supabase-error";
import type {
  MovieClearedState,
  MovieTrackingResult,
} from "@/lib/tracking/types";
import { todayUtc } from "@/lib/tv/air-status";

import { loadMovie } from "./[id]/load-movie";

/**
 * The movie tracking mutations, as Server Actions: the three from spec 0007,
 * plus the two Undo restores the list pages add (spec 0008, API surface).
 *
 * Each takes a target value, never a toggle, so the same call twice gives the
 * same row and queued rapid clicks settle on the last one (AC-15). Each runs
 * the same order: Zod parse, then the verified session, then (for a write that
 * can create a row) the TMDB check, and for a watched mark or score the
 * release gate, then the write through Row Level Security, then `refresh()` on
 * success only.
 *
 * None of them throws or redirects. A thrown error reaches the browser as an
 * opaque digest and would land in an error boundary instead of a toast, so
 * every failure is returned as a `MovieTrackingResult` (AC-11). `user_id` is
 * always the verified session's, never an argument (`AGENTS.md` section 5,
 * AC-18).
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * What a write step returns: PostgREST's error, or null on success, and for
 * the two clearing functions the row they return.
 */
type WriteStep = (
  supabase: SupabaseClient,
  userId: string,
) => PromiseLike<{ data?: unknown; error: { code?: string | null } | null }>;

/**
 * The SQLSTATE `rate_movie` raises for a score on a movie that is not watched
 * (`supabase/schemas/05-functions.sql`). Movie only, so it is mapped here
 * rather than in the shared `classifyTrackingError`.
 */
const NOT_WATCHED_SQLSTATE = "BS001";

/**
 * Reads what `plan_movie` or `unmark_movie_watched` cleared. Both return the
 * old watch mark and score, null when nothing was watched; only a removed
 * watch mark is worth an Undo (prompts/movie-plan-watched-exclusive.md).
 */
function readCleared(data: unknown): MovieClearedState | undefined {
  const row = data as {
    cleared_watched_at: string | null;
    cleared_rating: number | null;
  } | null;
  if (!row?.cleared_watched_at) return undefined;
  return { watchedAt: row.cleared_watched_at, rating: row.cleared_rating };
}

/**
 * What a write checks with TMDB first. `none` for a removal or the watchlist
 * restore, which must keep working for a movie TMDB later drops, or during an
 * outage (AC-14). `exists` for a write that can insert a row. `released` for a
 * watched mark or score, new or restored, which also waits for the release
 * date (prompts/movie-release-gate.md).
 */
type TmdbCheck = "none" | "exists" | "released";

/**
 * The shared shape of every tracking action.
 *
 * @param event The log event for a refusal.
 * @param movieId The already parsed movie id.
 * @param check What to confirm with TMDB before writing.
 * @param write The Supabase call, given the request client and the user id.
 * @param clears True for a write whose row says what it cleared.
 */
async function runTrackingWrite(
  event: TrackingEvent,
  movieId: number,
  check: TmdbCheck,
  write: WriteStep,
  clears = false,
): Promise<MovieTrackingResult> {
  let cleared: MovieClearedState | undefined;
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }

    if (check !== "none") {
      const movie = await loadMovie(movieId);
      if (movie.kind !== "found") {
        const error =
          movie.kind === "failed" ? "tmdb_unavailable" : "not_found";
        logTrackingEvent(event, error);
        return { ok: false, error };
      }
      if (
        check === "released" &&
        !isMovieReleased(movie.movie.releaseDate, todayUtc(new Date()))
      ) {
        logTrackingEvent(event, "not_released");
        return { ok: false, error: "not_released" };
      }
    }

    const supabase = await createClient();
    const { data, error } = await write(supabase, user.id);
    if (error?.code === NOT_WATCHED_SQLSTATE) {
      logTrackingEvent(event, "not_watched");
      return { ok: false, error: "not_watched" };
    }
    if (error) {
      const classified = classifyTrackingError(error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
    if (clears) cleared = readCleared(data);
  } catch {
    // A network failure inside supabase-js or a bug surfaced by `loadMovie`.
    // The error object is dropped on purpose: its message can carry request
    // details that must not reach a log line (AC-21).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  refresh();
  return cleared ? { ok: true, cleared } : { ok: true };
}

/** Parses an action's arguments, or reports `invalid_input` (AC-13). */
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
 * Plans or unplans a movie. A movie is planned or watched, never both, so
 * planning a watched movie also removes its watch mark and score, and returns
 * them as `cleared` for the Undo (prompts/movie-plan-watched-exclusive.md).
 *
 * Planning goes through `plan_movie`, which reads and clears in one statement.
 * Unplanning is an update only, so it never creates a row; matching no row is
 * a success, because the state was already empty.
 */
export async function setMovieWatchlist(
  movieId: number,
  inWatchlist: boolean,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watchlist;
  const input = parse(watchlistInputSchema, { movieId, inWatchlist }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.inWatchlist) {
    return runTrackingWrite(
      event,
      input.movieId,
      "exists",
      (supabase) =>
        supabase.rpc("plan_movie", { p_movie_id: input.movieId }).single(),
      true,
    );
  }

  return runTrackingWrite(event, input.movieId, "none", (supabase, userId) =>
    supabase
      .from("user_movie_state")
      .update({ in_watchlist: false })
      .eq("user_id", userId)
      .eq("movie_id", input.movieId),
  );
}

/**
 * Marks a movie watched, or clears the mark. A new mark waits for the TMDB
 * release date (`not_released`); clearing never does, so a mark stored before
 * release can always be removed (`AGENTS.md` section 7).
 *
 * Marking goes through `mark_movie_watched`, which also clears the plan and
 * keeps an existing date. Unmarking goes through `unmark_movie_watched`, which
 * also removes the score, since a movie score needs a watch mark, and returns
 * both as `cleared` for the Undo (`AGENTS.md` section 7,
 * prompts/movie-plan-watched-exclusive.md).
 */
export async function setMovieWatched(
  movieId: number,
  watched: boolean,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watched;
  const input = parse(watchedInputSchema, { movieId, watched }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.watched) {
    return runTrackingWrite(event, input.movieId, "released", (supabase) =>
      supabase.rpc("mark_movie_watched", { p_movie_id: input.movieId }),
    );
  }

  return runTrackingWrite(
    event,
    input.movieId,
    "none",
    (supabase) =>
      supabase
        .rpc("unmark_movie_watched", { p_movie_id: input.movieId })
        .single(),
    true,
  );
}

/**
 * Stores a personal score from 1 to 10, or clears it. Any score, a first one
 * or a change, waits for the TMDB release date, as an episode's does for its
 * air date; clearing never does (`AGENTS.md` section 7).
 *
 * A score goes through `rate_movie`, which writes only on a watched movie and
 * otherwise refuses with `not_watched`: a movie score needs a watch mark
 * (prompts/movie-plan-watched-exclusive.md). Clearing touches only `rating`,
 * so the watch mark survives (AC-9).
 */
export async function setMovieRating(
  movieId: number,
  rating: number | null,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.rate;
  const input = parse(ratingInputSchema, { movieId, rating }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const score = input.rating;
  if (score !== null) {
    return runTrackingWrite(event, input.movieId, "released", (supabase) =>
      supabase.rpc("rate_movie", {
        p_movie_id: input.movieId,
        p_rating: score,
      }),
    );
  }

  return runTrackingWrite(event, input.movieId, "none", (supabase, userId) =>
    supabase
      .from("user_movie_state")
      .update({ rating: null })
      .eq("user_id", userId)
      .eq("movie_id", input.movieId),
  );
}

/**
 * Undo for a removal on the watchlist page: plans the movie again at its old
 * place (spec 0008, AC-6).
 *
 * Only the movie id travels from the client. The old position is the stored
 * `watchlisted_at`, which the database kept on unplan, and whether the Undo is
 * still allowed is decided by `restore_movie_watchlist` in the same statement.
 * A refusal comes back as `undo_expired`. It never creates a row, so it needs
 * no TMDB check.
 */
export async function restoreMovieWatchlist(
  movieId: number,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.restoreWatchlist;
  const input = parse(restoreWatchlistInputSchema, { movieId }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  return runTrackingWrite(event, input.movieId, "none", (supabase) =>
    supabase.rpc("restore_movie_watchlist", { p_movie_id: input.movieId }),
  );
}

/**
 * Undo for a removed watch mark, from the watched page (spec 0008, AC-7) or a
 * plan or unmark that cleared it (prompts/movie-plan-watched-exclusive.md):
 * marks the movie watched again at its old date, with its old score, and
 * turns the plan off.
 *
 * `watchedAt` and `rating` are client supplied: the user's own private values,
 * which the clearing write returned or the page rendered. `restore_movie_watched`
 * accepts the date only in the past, only for the caller's own unwatched row,
 * and only within 10 minutes of the change; the table bounds the score.
 *
 * It waits for the release date like a new mark does. The database cannot tell
 * an Undo from a fresh mark, since any write to the row (planning, say) opens
 * its 10 minute window, so without the gate a crafted call could mark an
 * unreleased movie watched (prompts/movie-release-gate.md, R6).
 */
export async function restoreMovieWatched(
  movieId: number,
  watchedAt: string,
  rating: number | null,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.restoreWatched;
  const input = parse(
    restoreWatchedInputSchema,
    { movieId, watchedAt, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runTrackingWrite(event, input.movieId, "released", (supabase) =>
    supabase.rpc("restore_movie_watched", {
      p_movie_id: input.movieId,
      p_watched_at: input.watchedAt,
      p_rating: input.rating ?? undefined,
    }),
  );
}
