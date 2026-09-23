import "server-only";
import { cacheLife } from "next/cache";
import { fetchMoviesByIds, fetchTvShowsByIds } from "./batch";
import { fetchMovieGenres, fetchTvGenres } from "./genres";
import { fetchMovie } from "./movies";
import {
  failureProfile,
  type TmdbFailure,
  type TmdbResult,
  toFailure,
  unwrap,
} from "./result";
import {
  fetchDiscoverMovies,
  fetchDiscoverTvShows,
  fetchSearchMovies,
  fetchSearchTvShows,
} from "./search";
import { fetchShowEpisodes } from "./show-episodes";
import { fetchSeason, fetchTvShow } from "./tv";
import type {
  BatchResult,
  DiscoverOptions,
  Genre,
  Movie,
  MovieSummary,
  Paged,
  SearchOptions,
  SeasonDetail,
  ShowEpisodes,
  TvShow,
  TvShowSummary,
} from "./types";

/**
 * The cached half of every TMDB read: thin `use cache` wrappers over the inner
 * functions that do the work.
 *
 * Three things live in this one file on purpose.
 *
 * **The split** (spec 0002, AC-23). The request, validation and normalization
 * logic sits in the inner modules, so the test suite calls it directly and does
 * not depend on Next's compiler transform for `use cache` being active in a
 * plain test runner. This file is the only one that imports `next/cache`.
 *
 * **The explicit lifetime** (AC-4, AC-5). Every wrapper calls `cacheLife` in
 * its own scope, so no read falls back to the implicit `default` profile. The
 * profiles follow how fast each resource actually changes: `days` for detail,
 * `hours` for a season (the one read where a user is waiting on last night's
 * episode, which is what satisfies the AGENTS.md section 12 rule against an
 * indefinitely cached catalog), `minutes` for query shaped reads with little
 * reuse, and `max` for genre lists that are effectively static.
 *
 * **The failure envelope** (AC-10, AC-19, AC-26). Each read is a pair: a cached
 * function that returns a `TmdbResult` and never throws a `TmdbError`, and an
 * exported wrapper that unwraps it. A rejection crossing a cache boundary is
 * serialized into a plain `Error`, which strips the `TmdbError` prototype and
 * its `kind`, so returning the failure and rebuilding it outside the scope is
 * what keeps `isTmdbNotFound` and the `not_found` branch in `batch.ts` working.
 * See `result.ts`. A failed read never takes the success profile: see
 * `failureProfile` for which lifetime each kind of failure gets.
 *
 * No cached scope here reads a cookie, a header or a search param, so nothing
 * user specific can land in a shared cache (AGENTS.md section 11).
 */

/**
 * Sets the lifetime of a failed read, from `failureProfile` (spec 0006,
 * AC-10). Called inside each cached scope, so the profile still lands on that
 * scope's entry. The branch exists because `cacheLife` is typed per profile
 * name and will not take a union.
 */
function cacheFailure(failure: TmdbFailure): void {
  if (failureProfile(failure.kind) === "seconds") {
    cacheLife("seconds");
  } else {
    cacheLife("minutes");
  }
}

async function getMovieCached(id: number): Promise<TmdbResult<Movie>> {
  "use cache";
  try {
    const value = await fetchMovie(id);
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getMovie(id: number): Promise<Movie> {
  return unwrap(await getMovieCached(id));
}

async function getTvShowCached(id: number): Promise<TmdbResult<TvShow>> {
  "use cache";
  try {
    const value = await fetchTvShow(id);
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getTvShow(id: number): Promise<TvShow> {
  return unwrap(await getTvShowCached(id));
}

async function getSeasonCached(
  showId: number,
  seasonNumber: number,
): Promise<TmdbResult<SeasonDetail>> {
  "use cache";
  try {
    const value = await fetchSeason(showId, seasonNumber);
    cacheLife("hours");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getSeason(
  showId: number,
  seasonNumber: number,
): Promise<SeasonDetail> {
  return unwrap(await getSeasonCached(showId, seasonNumber));
}

/**
 * Reuses the cached show and season wrappers, so a season already fetched for a
 * page is not fetched a second time for the progress calculation.
 */
async function getShowEpisodesCached(
  showId: number,
): Promise<TmdbResult<ShowEpisodes>> {
  "use cache";
  try {
    const value = await fetchShowEpisodes(showId, {
      readTvShow: getTvShow,
      readSeason: getSeason,
    });
    cacheLife("hours");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getShowEpisodes(showId: number): Promise<ShowEpisodes> {
  return unwrap(await getShowEpisodesCached(showId));
}

async function searchMoviesCached(
  query: string,
  options: SearchOptions,
): Promise<TmdbResult<Paged<MovieSummary>>> {
  "use cache";
  try {
    const value = await fetchSearchMovies(query, options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function searchMovies(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<MovieSummary>> {
  return unwrap(await searchMoviesCached(query, options));
}

async function searchTvShowsCached(
  query: string,
  options: SearchOptions,
): Promise<TmdbResult<Paged<TvShowSummary>>> {
  "use cache";
  try {
    const value = await fetchSearchTvShows(query, options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function searchTvShows(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<TvShowSummary>> {
  return unwrap(await searchTvShowsCached(query, options));
}

async function discoverMoviesCached(
  options: DiscoverOptions,
): Promise<TmdbResult<Paged<MovieSummary>>> {
  "use cache";
  try {
    const value = await fetchDiscoverMovies(options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function discoverMovies(
  options: DiscoverOptions = {},
): Promise<Paged<MovieSummary>> {
  return unwrap(await discoverMoviesCached(options));
}

async function discoverTvShowsCached(
  options: DiscoverOptions,
): Promise<TmdbResult<Paged<TvShowSummary>>> {
  "use cache";
  try {
    const value = await fetchDiscoverTvShows(options);
    cacheLife("minutes");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function discoverTvShows(
  options: DiscoverOptions = {},
): Promise<Paged<TvShowSummary>> {
  return unwrap(await discoverTvShowsCached(options));
}

async function getMovieGenresCached(): Promise<TmdbResult<Genre[]>> {
  "use cache";
  try {
    const value = await fetchMovieGenres();
    cacheLife("max");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getMovieGenres(): Promise<Genre[]> {
  return unwrap(await getMovieGenresCached());
}

async function getTvGenresCached(): Promise<TmdbResult<Genre[]>> {
  "use cache";
  try {
    const value = await fetchTvGenres();
    cacheLife("max");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getTvGenres(): Promise<Genre[]> {
  return unwrap(await getTvGenresCached());
}

/**
 * Batched reads share the detail profile, and pass the cached single title
 * readers down so a title already on a page costs nothing here.
 *
 * The readers passed down are the exported wrappers, not the cached functions,
 * because `batch.ts` sorts a missing title from a systemic failure by testing
 * `error.kind`. That test only works on an error rebuilt on this side of the
 * boundary (AC-19).
 */
async function getMoviesByIdsCached(
  ids: readonly number[],
): Promise<TmdbResult<BatchResult<MovieSummary>>> {
  "use cache";
  try {
    const value = await fetchMoviesByIds(ids, getMovie);
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getMoviesByIds(
  ids: readonly number[],
): Promise<BatchResult<MovieSummary>> {
  return unwrap(await getMoviesByIdsCached(ids));
}

/**
 * The same batch with no cache entry of its own, only the per title entries
 * underneath (spec 0008, AC-11, AC-17).
 *
 * A private list page asks for a different id set every time its owner plans,
 * removes or undoes a movie, so a batch level entry keyed on that set would be
 * written once and never read again, and would put a trace of one person's
 * list into the shared cache as its key. Reading each title through the cached
 * `getMovie` gives the same reuse with neither. Up to `TMDB_CONCURRENCY_LIMIT`
 * titles are read at a time, and the `missingIds` and systemic failure rules
 * are `fetchMoviesByIds`'s own.
 */
export async function getMovieSummaries(
  ids: readonly number[],
): Promise<BatchResult<MovieSummary>> {
  return fetchMoviesByIds(ids, getMovie);
}

async function getTvShowsByIdsCached(
  ids: readonly number[],
): Promise<TmdbResult<BatchResult<TvShowSummary>>> {
  "use cache";
  try {
    const value = await fetchTvShowsByIds(ids, getTvShow);
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    const failure = toFailure(error);
    cacheFailure(failure);
    return { ok: false, failure };
  }
}

export async function getTvShowsByIds(
  ids: readonly number[],
): Promise<BatchResult<TvShowSummary>> {
  return unwrap(await getTvShowsByIdsCached(ids));
}
