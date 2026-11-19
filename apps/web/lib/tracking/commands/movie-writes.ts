import "server-only";

import type { MovieTrackingResult } from "@bestats/core/tracking/types";

import { TRACKING_EVENT } from "../log";
import { readCleared, runMovieCommand } from "./movie";
import type { TrackingDeps } from "./run";

/**
 * Marks a movie watched, or clears the mark: the command behind both the
 * `setMovieWatched` Server Action and `PUT /api/v1/me/movies/{id}/watched`
 * (spec 0033, AC-5). Its input is already parsed and its user verified.
 *
 * A new mark waits for the TMDB release date (`not_released`); clearing
 * never does, so a mark stored before release can always be removed
 * (AGENTS.md section 7, spec 0033, AC-6).
 *
 * Marking goes through `mark_movie_watched`, which also clears the plan and
 * keeps an existing date. Unmarking goes through `unmark_movie_watched`,
 * which also removes the score, since a movie score needs a watch mark, and
 * returns both as `cleared` for the Undo
 * (prompts/movie-plan-watched-exclusive.md).
 */
export function setMovieWatchedCommand(
  deps: TrackingDeps,
  input: { movieId: number; watched: boolean },
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watched;
  if (input.watched) {
    return runMovieCommand(deps, event, input.movieId, "released", (supabase) =>
      supabase.rpc("mark_movie_watched", { p_movie_id: input.movieId }),
    );
  }
  return runMovieCommand(
    deps,
    event,
    input.movieId,
    "none",
    (supabase) =>
      supabase
        .rpc("unmark_movie_watched", { p_movie_id: input.movieId })
        .single(),
    readCleared,
  );
}

/**
 * Plans or unplans a movie: the command behind `setMovieWatchlist` and
 * `PUT /api/v1/me/movies/{id}/watchlist` (spec 0033, AC-5). A movie is planned
 * or watched, never both, so planning a watched movie also removes its watch
 * mark and score and returns them as `cleared` for the Undo
 * (prompts/movie-plan-watched-exclusive.md).
 *
 * Planning goes through `plan_movie`, which locks the row, reads what it is
 * about to clear and writes, in one transaction; it checks TMDB first because
 * it can insert a row. Unplanning is an update only, so it never creates a row
 * and matching none is a success.
 */
export function setMovieWatchlistCommand(
  deps: TrackingDeps,
  input: { movieId: number; inWatchlist: boolean },
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watchlist;
  if (input.inWatchlist) {
    return runMovieCommand(
      deps,
      event,
      input.movieId,
      "exists",
      (supabase) =>
        supabase.rpc("plan_movie", { p_movie_id: input.movieId }).single(),
      readCleared,
    );
  }
  return runMovieCommand(
    deps,
    event,
    input.movieId,
    "none",
    (supabase, userId) =>
      supabase
        .from("user_movie_state")
        .update({ in_watchlist: false })
        .eq("user_id", userId)
        .eq("movie_id", input.movieId),
  );
}

/**
 * Stores a personal score from 1 to 10, or clears it: the command behind
 * `setMovieRating` and `PUT /api/v1/me/movies/{id}/rating`. Any score waits
 * for the TMDB release date; clearing never does (AGENTS.md section 7,
 * spec 0033, AC-6).
 *
 * A score goes through `rate_movie`, which writes only on a watched movie and
 * otherwise refuses with `not_watched`. Clearing touches only `rating`, so
 * the watch mark survives.
 */
export function setMovieRatingCommand(
  deps: TrackingDeps,
  input: { movieId: number; rating: number | null },
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.rate;
  const score = input.rating;
  if (score !== null) {
    return runMovieCommand(deps, event, input.movieId, "released", (supabase) =>
      supabase.rpc("rate_movie", {
        p_movie_id: input.movieId,
        p_rating: score,
      }),
    );
  }
  return runMovieCommand(
    deps,
    event,
    input.movieId,
    "none",
    (supabase, userId) =>
      supabase
        .from("user_movie_state")
        .update({ rating: null })
        .eq("user_id", userId)
        .eq("movie_id", input.movieId),
  );
}

/**
 * Undo for an unplanned movie: plans it again at its old place (spec 0008,
 * AC-6). Only the movie id travels; the old position is the stored
 * `watchlisted_at`, and `restore_movie_watchlist` decides in the same
 * statement whether the Undo is still allowed (`undo_expired` otherwise). It
 * never creates a row, so it needs no TMDB check.
 */
export function restoreMovieWatchlistCommand(
  deps: TrackingDeps,
  input: { movieId: number },
): Promise<MovieTrackingResult> {
  return runMovieCommand(
    deps,
    TRACKING_EVENT.restoreWatchlist,
    input.movieId,
    "none",
    (supabase) =>
      supabase.rpc("restore_movie_watchlist", { p_movie_id: input.movieId }),
  );
}

/**
 * Undo for a removed watch mark: marks the movie watched again at its old
 * date, with its old score (spec 0008, AC-7). `watchedAt` and `rating` are
 * the caller's own private values, which `restore_movie_watched` accepts only
 * in the past, only for the caller's unwatched row and only within 10 minutes
 * of the change.
 *
 * It waits for the release date like a new mark does: the database cannot
 * tell an Undo from a fresh mark, so without the gate a crafted call could
 * mark an unreleased movie watched (prompts/movie-release-gate.md, R6).
 */
export function restoreMovieWatchedCommand(
  deps: TrackingDeps,
  input: { movieId: number; watchedAt: string; rating: number | null },
): Promise<MovieTrackingResult> {
  return runMovieCommand(
    deps,
    TRACKING_EVENT.restoreWatched,
    input.movieId,
    "released",
    (supabase) =>
      supabase.rpc("restore_movie_watched", {
        p_movie_id: input.movieId,
        p_watched_at: input.watchedAt,
        p_rating: input.rating ?? undefined,
      }),
  );
}
