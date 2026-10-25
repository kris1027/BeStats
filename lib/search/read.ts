import "server-only";

import { readGridPage } from "@/lib/catalog/grid-page";
import { type MediaType, titleHref } from "@/lib/catalog/media-type";
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
import type { SearchMode } from "./mode";
import type { TmdbSearchParams } from "./params";
import type { QuickSearchResponse } from "./quick";

/**
 * A search result from either catalog, reduced to what search needs to show
 * and filter it. Movies call it a title and a release year, shows a name and a
 * first air year; everything below reads this one shape.
 */
export type SearchResult = {
  id: number;
  title: string;
  year: number | null;
  /**
   * A movie's TMDB release date, which places a planned movie on Watchlist
   * or Upcoming on its card (prompts/catalog-card-status.md). Null for a
   * show: its card reads its own air dates.
   */
  releaseDate: string | null;
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
    releaseDate: movie.releaseDate,
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
    releaseDate: null,
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
  type: MediaType,
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
  params: TmdbSearchParams,
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
 * One 24 title page of browse, discover or plain search (spec 0022, AC-21):
 * the two TMDB pages that hold it, read through `readSearchPage` or
 * `readDiscoverPage`, so neighbouring grid pages share cache entries.
 * `totalPages` is the grid's own count, already capped, which is what the
 * results page checks `?page=` against. Filtered search is left out because
 * it pages by its own cursor (AC-13). Throws the module's `TmdbError`
 * unchanged.
 */
export function readSearchGridPage(
  mode: Exclude<SearchMode, "filtered_search">,
  params: TmdbSearchParams,
): Promise<SearchPage> {
  return readGridPage(params.page, (tmdbPage) =>
    mode === "search"
      ? readSearchPage(params.type, params.q ?? "", {
          year: params.year ?? undefined,
          page: tmdbPage,
        })
      : readDiscoverPage({ ...params, page: tmdbPage }),
  );
}

/**
 * The quick search body built from page 1 of a search (spec 0010, AC-20):
 * TMDB's total and the first five results in TMDB's order, with posters at the
 * smallest width.
 */
export function toQuickSearchResponse(
  type: MediaType,
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
