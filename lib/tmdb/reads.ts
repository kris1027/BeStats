import "server-only";
import { cacheLife } from "next/cache";
import { fetchMoviesByIds, fetchTvShowsByIds } from "./batch";
import { fetchMovieGenres, fetchTvGenres } from "./genres";
import { fetchMovie } from "./movies";
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
 * Two things live in this one file on purpose.
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
 * No cached scope here reads a cookie, a header or a search param, so nothing
 * user specific can land in a shared cache (AGENTS.md section 11).
 */

export async function getMovie(id: number): Promise<Movie> {
  "use cache";
  cacheLife("days");
  return fetchMovie(id);
}

export async function getTvShow(id: number): Promise<TvShow> {
  "use cache";
  cacheLife("days");
  return fetchTvShow(id);
}

export async function getSeason(
  showId: number,
  seasonNumber: number,
): Promise<SeasonDetail> {
  "use cache";
  cacheLife("hours");
  return fetchSeason(showId, seasonNumber);
}

/**
 * Reuses the cached show and season wrappers, so a season already fetched for a
 * page is not fetched a second time for the progress calculation.
 */
export async function getShowEpisodes(showId: number): Promise<ShowEpisodes> {
  "use cache";
  cacheLife("hours");
  return fetchShowEpisodes(showId, {
    readTvShow: getTvShow,
    readSeason: getSeason,
  });
}

export async function searchMovies(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<MovieSummary>> {
  "use cache";
  cacheLife("minutes");
  return fetchSearchMovies(query, options);
}

export async function searchTvShows(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<TvShowSummary>> {
  "use cache";
  cacheLife("minutes");
  return fetchSearchTvShows(query, options);
}

export async function discoverMovies(
  options: DiscoverOptions = {},
): Promise<Paged<MovieSummary>> {
  "use cache";
  cacheLife("minutes");
  return fetchDiscoverMovies(options);
}

export async function discoverTvShows(
  options: DiscoverOptions = {},
): Promise<Paged<TvShowSummary>> {
  "use cache";
  cacheLife("minutes");
  return fetchDiscoverTvShows(options);
}

export async function getMovieGenres(): Promise<Genre[]> {
  "use cache";
  cacheLife("max");
  return fetchMovieGenres();
}

export async function getTvGenres(): Promise<Genre[]> {
  "use cache";
  cacheLife("max");
  return fetchTvGenres();
}

/**
 * Batched reads share the detail profile, and pass the cached single title
 * readers down so a title already on a page costs nothing here.
 */
export async function getMoviesByIds(
  ids: readonly number[],
): Promise<BatchResult<MovieSummary>> {
  "use cache";
  cacheLife("days");
  return fetchMoviesByIds(ids, getMovie);
}

export async function getTvShowsByIds(
  ids: readonly number[],
): Promise<BatchResult<TvShowSummary>> {
  "use cache";
  cacheLife("days");
  return fetchTvShowsByIds(ids, getTvShow);
}
