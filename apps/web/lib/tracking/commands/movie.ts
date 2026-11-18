import "server-only";

import { isMovieReleased } from "@bestats/core/catalog/movie-page";
import type {
  MovieClearedState,
  MovieTrackingError,
  MovieTrackingResult,
} from "@bestats/core/tracking/types";
import { todayUtc } from "@bestats/core/tv/air-status";

import { loadMovie } from "@/lib/tmdb/load-movie";

import type { TrackingEvent } from "../log";
import { classifyMovieTrackingError } from "../supabase-error";
import { runTrackingCommand, type TrackingDeps, type WriteStep } from "./run";

/**
 * Reads what `plan_movie` or `unmark_movie_watched` cleared. Both return the
 * old watch mark and score, null when nothing was watched; only a removed
 * watch mark is worth an Undo, since planning a watched movie or removing its
 * mark drops mark and score with Undo (AGENTS.md section 7;
 * prompts/movie-plan-watched-exclusive.md).
 *
 * The parameter is wider than the generated row on purpose: the generator
 * marks a `returns table` column not null, but both columns are null when
 * the row had no watch mark to clear.
 */
export function readCleared(
  row: {
    cleared_watched_at: string | null;
    cleared_rating: number | null;
  } | null,
): MovieClearedState | undefined {
  if (!row?.cleared_watched_at) return undefined;
  return { watchedAt: row.cleared_watched_at, rating: row.cleared_rating };
}

/**
 * What a write checks with TMDB first. `none` for a removal or the watchlist
 * restore, which must keep working for a movie TMDB later drops, or during an
 * outage (spec 0007, AC-14). `exists` for a write that can insert a row.
 * `released` for a watched mark or score, new or restored, which also waits
 * for the release date (prompts/movie-release-gate.md, AGENTS.md section 7).
 */
export type TmdbCheck = "none" | "exists" | "released";

/**
 * Confirms the movie with TMDB, and for `released` its release date against
 * today in UTC. The date is always read on the server, never taken from the
 * caller, so a phone cannot skip the gate (spec 0033, AC-6).
 */
export async function checkTmdb(
  movieId: number,
  check: Exclude<TmdbCheck, "none">,
): Promise<MovieTrackingError | null> {
  const movie = await loadMovie(movieId);
  if (movie.kind !== "found") {
    return movie.kind === "failed" ? "tmdb_unavailable" : "not_found";
  }
  if (
    check === "released" &&
    !isMovieReleased(movie.movie.releaseDate, todayUtc(new Date()))
  ) {
    return "not_released";
  }
  return null;
}

/**
 * The movie side of `runTrackingCommand`: the TMDB check and release gate,
 * and the cleared watch mark that comes back for an Undo. Shared by every
 * movie command, so each one returns the action's `MovieTrackingResult` and
 * the release gate (AGENTS.md section 7) cannot be skipped by any of them.
 */
export async function runMovieCommand<D>(
  deps: TrackingDeps,
  event: TrackingEvent,
  movieId: number,
  check: TmdbCheck,
  write: WriteStep<D>,
  readResult?: (data: D | null) => MovieClearedState | undefined,
): Promise<MovieTrackingResult> {
  const outcome = await runTrackingCommand(deps, {
    event,
    check: check === "none" ? undefined : () => checkTmdb(movieId, check),
    write,
    classify: classifyMovieTrackingError,
    read: readResult,
  });
  if (!outcome.ok) return outcome;
  return outcome.value ? { ok: true, cleared: outcome.value } : { ok: true };
}
