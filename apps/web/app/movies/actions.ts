"use server";

import {
  ratingInputSchema,
  restoreWatchedInputSchema,
  restoreWatchlistInputSchema,
  watchedInputSchema,
  watchlistInputSchema,
} from "@bestats/core/tracking/schemas";
import type {
  MovieClearedState,
  MovieTrackingResult,
} from "@bestats/core/tracking/types";
import {
  readCleared,
  runMovieCommand,
  type TmdbCheck,
} from "@/lib/tracking/commands/movie";
import { setMovieWatchedCommand } from "@/lib/tracking/commands/set-movie-watched";
import { TRACKING_EVENT, type TrackingEvent } from "@/lib/tracking/log";
import {
  parseTrackingInput,
  type WriteStep,
  withCookieSession,
} from "@/lib/tracking/write";

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

/**
 * The cookie session side of `runMovieCommand` (spec 0033, child 0035): the
 * Server Action finds the user from its cookies, the command does the rest,
 * and `refresh()` follows a success.
 *
 * @param event The log event for a refusal.
 * @param movieId The already parsed movie id.
 * @param check What to confirm with TMDB before writing.
 * @param write The Supabase call, given the request client and the user id.
 * @param readResult For a write whose row says what it cleared, reads it.
 */
function runMovieWrite<D>(
  event: TrackingEvent,
  movieId: number,
  check: TmdbCheck,
  write: WriteStep<D>,
  readResult?: (data: D | null) => MovieClearedState | undefined,
): Promise<MovieTrackingResult> {
  return withCookieSession(event, (deps) =>
    runMovieCommand(deps, event, movieId, check, write, readResult),
  );
}

/**
 * Plans or unplans a movie. A movie is planned or watched, never both, so
 * planning a watched movie also removes its watch mark and score, and returns
 * them as `cleared` for the Undo (prompts/movie-plan-watched-exclusive.md).
 *
 * Planning goes through `plan_movie`, which locks the row, reads what it is
 * about to clear and writes, all in one function call and one transaction.
 * Unplanning is an update only, so it never creates a row; matching no row is
 * a success, because the state was already empty.
 */
export async function setMovieWatchlist(
  movieId: number,
  inWatchlist: boolean,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watchlist;
  const input = parseTrackingInput(
    watchlistInputSchema,
    { movieId, inWatchlist },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.inWatchlist) {
    return runMovieWrite(
      event,
      input.movieId,
      "exists",
      (supabase) =>
        supabase.rpc("plan_movie", { p_movie_id: input.movieId }).single(),
      readCleared,
    );
  }

  return runMovieWrite(event, input.movieId, "none", (supabase, userId) =>
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
  const input = parseTrackingInput(
    watchedInputSchema,
    { movieId, watched },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return withCookieSession(event, (deps) =>
    setMovieWatchedCommand(deps, input),
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
  const input = parseTrackingInput(
    ratingInputSchema,
    { movieId, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  const score = input.rating;
  if (score !== null) {
    return runMovieWrite(event, input.movieId, "released", (supabase) =>
      supabase.rpc("rate_movie", {
        p_movie_id: input.movieId,
        p_rating: score,
      }),
    );
  }

  return runMovieWrite(event, input.movieId, "none", (supabase, userId) =>
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
  const input = parseTrackingInput(
    restoreWatchlistInputSchema,
    { movieId },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runMovieWrite(event, input.movieId, "none", (supabase) =>
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
  const input = parseTrackingInput(
    restoreWatchedInputSchema,
    { movieId, watchedAt, rating },
    event,
  );
  if (!input) return { ok: false, error: "invalid_input" };

  return runMovieWrite(event, input.movieId, "released", (supabase) =>
    supabase.rpc("restore_movie_watched", {
      p_movie_id: input.movieId,
      p_watched_at: input.watchedAt,
      p_rating: input.rating ?? undefined,
    }),
  );
}
