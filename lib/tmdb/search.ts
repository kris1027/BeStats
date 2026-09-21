import "server-only";
import { tmdbRequest } from "./client";
import { normalizeMovieSummary, normalizeTvSummary } from "./normalize";
import { movieSummarySchema, pagedSchema, tvSummarySchema } from "./schemas";
import type {
  DiscoverOptions,
  MovieSummary,
  Paged,
  SearchOptions,
  TvShowSummary,
} from "./types";
import { assertPage, assertQuery } from "./validation";

/**
 * Search and discover are two different endpoints with two different parameter
 * sets, and this module keeps them apart on purpose (spec 0002, AC-16).
 *
 * TMDB's search endpoints take a free text query and almost nothing else; the
 * genre and minimum rating filters live only on discover, which takes no query.
 * Passing `genreIds` to a search function is therefore a compile error rather
 * than a filter that silently does nothing, which is the trap AGENTS.md section
 * 10 warns about. What to do when a user asks for a query *and* filters belongs
 * to scope feature 11; this module does not paper over the gap.
 *
 * `include_adult=false` goes on every one of these calls (AC-17), and TMDB's
 * `page`, `total_pages` and `total_results` are returned unchanged (AC-18).
 */

const pagedMovieSchema = pagedSchema(movieSummarySchema);
const pagedTvSchema = pagedSchema(tvSummarySchema);

/** TMDB's `with_genres` takes a comma separated list, meaning "any of these". */
function genreParam(genreIds: number[] | undefined): string | undefined {
  return genreIds && genreIds.length > 0 ? genreIds.join(",") : undefined;
}

export async function fetchSearchMovies(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<MovieSummary>> {
  const endpoint = "/search/movie";
  const page = assertPage(options.page ?? 1, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      query: assertQuery(query, endpoint),
      page,
      include_adult: false,
      primary_release_year: options.year,
    },
    pagedMovieSchema,
  );
  return {
    page: raw.page,
    results: raw.results.map(normalizeMovieSummary),
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}

export async function fetchSearchTvShows(
  query: string,
  options: SearchOptions = {},
): Promise<Paged<TvShowSummary>> {
  const endpoint = "/search/tv";
  const page = assertPage(options.page ?? 1, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      query: assertQuery(query, endpoint),
      page,
      include_adult: false,
      first_air_date_year: options.year,
    },
    pagedTvSchema,
  );
  return {
    page: raw.page,
    results: raw.results.map(normalizeTvSummary),
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}

export async function fetchDiscoverMovies(
  options: DiscoverOptions = {},
): Promise<Paged<MovieSummary>> {
  const endpoint = "/discover/movie";
  const page = assertPage(options.page ?? 1, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      page,
      include_adult: false,
      with_genres: genreParam(options.genreIds),
      primary_release_year: options.year,
      "vote_average.gte": options.minRating,
    },
    pagedMovieSchema,
  );
  return {
    page: raw.page,
    results: raw.results.map(normalizeMovieSummary),
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}

export async function fetchDiscoverTvShows(
  options: DiscoverOptions = {},
): Promise<Paged<TvShowSummary>> {
  const endpoint = "/discover/tv";
  const page = assertPage(options.page ?? 1, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      page,
      include_adult: false,
      with_genres: genreParam(options.genreIds),
      // For TV the year means the first air year, confirmed against TMDB's
      // /discover/tv reference during this build.
      first_air_date_year: options.year,
      "vote_average.gte": options.minRating,
    },
    pagedTvSchema,
  );
  return {
    page: raw.page,
    results: raw.results.map(normalizeTvSummary),
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}
