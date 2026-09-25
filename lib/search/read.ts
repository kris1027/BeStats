import "server-only";

import {
  discoverMovies,
  discoverTvShows,
  type MovieSummary,
  type Paged,
  resizeImageUrl,
  searchMovies,
  searchTvShows,
  type TvShowSummary,
} from "@/lib/tmdb";

import { MIN_VOTE_COUNT, QUICK_LIMIT } from "./constants";
import type { SearchParams, SearchType } from "./params";
import { type QuickSearchResponse, titleHref } from "./quick";

/**
 * A search result from either catalog, reduced to what search needs to show
 * and filter it. Movies call it a title and a release year, shows a name and a
 * first air year; everything below reads this one shape.
 */
export type SearchResult = {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  tmdbRating: number | null;
  tmdbVoteCount: number;
  genreIds: number[];
};

export function fromMovie(movie: MovieSummary): SearchResult {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.releaseYear,
    posterUrl: movie.posterUrl,
    tmdbRating: movie.tmdbRating,
    tmdbVoteCount: movie.tmdbVoteCount,
    genreIds: movie.genreIds,
  };
}

export function fromShow(show: TvShowSummary): SearchResult {
  return {
    id: show.id,
    title: show.name,
    year: show.firstAirYear,
    posterUrl: show.posterUrl,
    tmdbRating: show.tmdbRating,
    tmdbVoteCount: show.tmdbVoteCount,
    genreIds: show.genreIds,
  };
}

/** One page of either catalog's search, in the shared shape. */
export type SearchPage = Paged<SearchResult>;

/**
 * Reads one page of TMDB search for a type through the cached module reads,
 * with the year sent upstream because search accepts it (spec 0010, AC-12).
 * Throws the module's `TmdbError` unchanged.
 */
export async function readSearchPage(
  type: SearchType,
  query: string,
  options: { year?: number; page: number },
): Promise<SearchPage> {
  if (type === "movie") {
    const page = await searchMovies(query, options);
    return { ...page, results: page.results.map(fromMovie) };
  }
  const page = await searchTvShows(query, options);
  return { ...page, results: page.results.map(fromShow) };
}

/**
 * Reads one page of TMDB discover for browse and discover mode, with every
 * filter sent upstream, where discover applies it (spec 0010, AC-11, AC-12).
 * A rating brings the 100 vote floor with it; popularity is TMDB's default
 * order. Throws the module's `TmdbError` unchanged.
 */
export async function readDiscoverPage(
  params: SearchParams,
): Promise<SearchPage> {
  const options = {
    genreIds: params.genreIds,
    year: params.year ?? undefined,
    minRating: params.rating ?? undefined,
    minVoteCount: params.rating !== null ? MIN_VOTE_COUNT : undefined,
    page: params.page,
  };
  if (params.type === "movie") {
    const page = await discoverMovies(options);
    return { ...page, results: page.results.map(fromMovie) };
  }
  const page = await discoverTvShows(options);
  return { ...page, results: page.results.map(fromShow) };
}

/**
 * The quick search body built from page 1 of a search (spec 0010, AC-20):
 * TMDB's total and the first five results in TMDB's order, with posters at the
 * smallest width.
 */
export function toQuickSearchResponse(
  type: SearchType,
  page: SearchPage,
): QuickSearchResponse {
  return {
    totalResults: page.totalResults,
    results: page.results.slice(0, QUICK_LIMIT).map((result) => ({
      id: result.id,
      title: result.title,
      year: result.year,
      posterUrl: resizeImageUrl(result.posterUrl, "w92"),
      tmdbRating: result.tmdbRating,
      href: titleHref(type, result.id),
    })),
  };
}
