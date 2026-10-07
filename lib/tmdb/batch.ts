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
    genreIds: movie.genreIds,
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
    genreIds: show.genreIds,
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

/** What `readEachSettled` returns: every id is in exactly one of the three. */
export type SettledBatch<T> = {
  found: Map<number, T>;
  missingIds: number[];
  failedIds: number[];
};

/**
 * A failure that says nothing about one title and everything about the
 * request: a rejected credential or an exhausted rate limit (spec 0020,
 * AC-17). Any other title would fail the same way, so the whole read fails.
 */
const SYSTEMIC_KINDS: ReadonlySet<TmdbError["kind"]> = new Set([
  "unauthorized",
  "rate_limited",
]);

/**
 * Reads many titles, keeping a failure to the title it happened to (spec
 * 0020, AC-17), for the library pages that must place every title they hold.
 *
 * Unlike the batch helpers above, a single title's timeout, upstream error or
 * bad response does not fail the whole read: that title is reported in
 * `failedIds` and the page leaves it out with a note. A title TMDB no longer
 * has is in `missingIds`, as above. Only a systemic failure raises, because a
 * page full of "couldn't load" would hide the real cause. Up to
 * `TMDB_CONCURRENCY_LIMIT` reads run at a time, and the two id lists keep the
 * input order.
 *
 * @param ids The titles, in the caller's order.
 * @param read The cached single title reader from `reads.ts`.
 * @throws {TmdbError} The first systemic failure.
 */
export async function readEachSettled<T>(
  ids: readonly number[],
  read: (id: number) => Promise<T>,
): Promise<SettledBatch<T>> {
  const outcomes = await mapWithConcurrency(
    ids,
    TMDB_CONCURRENCY_LIMIT,
    async (id): Promise<{ value: T } | "missing" | "failed"> => {
      try {
        return { value: await read(id) };
      } catch (error) {
        if (!(error instanceof TmdbError)) throw error;
        if (error.kind === "not_found") return "missing";
        if (SYSTEMIC_KINDS.has(error.kind)) throw error;
        return "failed";
      }
    },
  );

  const result: SettledBatch<T> = {
    found: new Map(),
    missingIds: [],
    failedIds: [],
  };
  outcomes.forEach((outcome, index) => {
    const id = ids[index];
    if (outcome === "missing") result.missingIds.push(id);
    else if (outcome === "failed") result.failedIds.push(id);
    else result.found.set(id, outcome.value);
  });
  return result;
}
