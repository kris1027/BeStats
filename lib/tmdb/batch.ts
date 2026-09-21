import "server-only";
import { mapWithConcurrency } from "./concurrency";
import { TMDB_CONCURRENCY_LIMIT } from "./constants";
import { TmdbError } from "./errors";
import { fetchMovie } from "./movies";
import { fetchTvShow } from "./tv";
import type {
  BatchResult,
  Movie,
  MovieSummary,
  TvShow,
  TvShowSummary,
} from "./types";

/**
 * Reading many titles by id, which is what a watchlist screen needs.
 *
 * Two rules make this honest rather than convenient (spec 0002, AC-19):
 *
 * - A title TMDB no longer has is reported in `missingIds`, not dropped in
 *   silence. A user whose watchlist row points at a deleted TMDB id deserves to
 *   be told, and only the caller knows how to say it.
 * - A systemic failure (a rejected credential, an exhausted rate limit) raises.
 *   Returning a short list there would look like "those titles are gone" and
 *   would invite the UI to offer removing rows that are perfectly fine.
 *
 * The readers are injected so tests can drive them without a network, and so
 * the cached wrappers in `reads.ts` can pass their cached versions.
 */

const MISSING = Symbol("tmdb-missing");

async function readOrMissing<T>(
  id: number,
  read: (id: number) => Promise<T>,
): Promise<T | typeof MISSING> {
  try {
    return await read(id);
  } catch (error) {
    if (error instanceof TmdbError && error.kind === "not_found") {
      return MISSING;
    }
    throw error;
  }
}

function collect<T, S>(
  ids: readonly number[],
  outcomes: (T | typeof MISSING)[],
  project: (value: T) => S,
): BatchResult<S> {
  const found: S[] = [];
  const missingIds: number[] = [];
  outcomes.forEach((outcome, index) => {
    if (outcome === MISSING) {
      missingIds.push(ids[index]);
    } else {
      found.push(project(outcome as T));
    }
  });
  return { found, missingIds };
}

function toMovieSummary(movie: Movie): MovieSummary {
  return {
    id: movie.id,
    title: movie.title,
    posterUrl: movie.posterUrl,
    releaseDate: movie.releaseDate,
    releaseYear: movie.releaseYear,
    overview: movie.overview,
    tmdbRating: movie.tmdbRating,
    tmdbVoteCount: movie.tmdbVoteCount,
  };
}

function toTvSummary(show: TvShow): TvShowSummary {
  return {
    id: show.id,
    name: show.name,
    posterUrl: show.posterUrl,
    firstAirDate: show.firstAirDate,
    firstAirYear: show.firstAirYear,
    overview: show.overview,
    tmdbRating: show.tmdbRating,
    tmdbVoteCount: show.tmdbVoteCount,
  };
}

export async function fetchMoviesByIds(
  ids: readonly number[],
  readMovie: (id: number) => Promise<Movie> = fetchMovie,
): Promise<BatchResult<MovieSummary>> {
  const outcomes = await mapWithConcurrency(ids, TMDB_CONCURRENCY_LIMIT, (id) =>
    readOrMissing(id, readMovie),
  );
  return collect(ids, outcomes, toMovieSummary);
}

export async function fetchTvShowsByIds(
  ids: readonly number[],
  readTvShow: (id: number) => Promise<TvShow> = fetchTvShow,
): Promise<BatchResult<TvShowSummary>> {
  const outcomes = await mapWithConcurrency(ids, TMDB_CONCURRENCY_LIMIT, (id) =>
    readOrMissing(id, readTvShow),
  );
  return collect(ids, outcomes, toTvSummary);
}
