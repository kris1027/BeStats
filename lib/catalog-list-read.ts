import { readGridPage } from "@/lib/catalog/grid-page";
import type {
  CatalogList,
  MovieCatalogList,
  MovieListSlug,
  TvCatalogList,
  TvListSlug,
} from "@/lib/catalog/lists";
import {
  discoverMovies,
  discoverTvShows,
  getMovieList,
  getTvList,
  type MovieListKind,
  type MovieSummary,
  type Paged,
  type TvListKind,
  type TvShowSummary,
} from "@/lib/tmdb";

const TV_KINDS: Record<Exclude<TvListSlug, "popular">, TvListKind> = {
  trending: "trending",
  "airing-today": "airing_today",
  "on-the-air": "on_the_air",
  "top-rated": "top_rated",
};

const MOVIE_KINDS: Record<Exclude<MovieListSlug, "popular">, MovieListKind> = {
  trending: "trending",
  "now-playing": "now_playing",
  upcoming: "upcoming",
  "top-rated": "top_rated",
};

/**
 * One page of a list, the one place an app slug becomes a TMDB call
 * (spec 0021, the dispatcher).
 *
 * Popular reads `discoverTvShows({ page })` or `discoverMovies({ page })` with
 * no other option, the exact calls the sitemap makes, so the three share
 * cache entries. Every other slug maps to its TMDB list kind. A landing row
 * and page 1 of its list page both call this with page 1, so they share one
 * cache entry and See all costs no extra request (AC-3).
 *
 * It lives beside `lib/landing-metadata.ts`, outside `lib/catalog/`, because
 * it touches TMDB at runtime and `lib/catalog/` stays pure for the proxy.
 *
 * @throws {TmdbError} When TMDB fails; callers catch it into their own state.
 */
export function readCatalogList(
  list: TvCatalogList,
  page: number,
): Promise<Paged<TvShowSummary>>;
export function readCatalogList(
  list: MovieCatalogList,
  page: number,
): Promise<Paged<MovieSummary>>;
export function readCatalogList(
  list: CatalogList,
  page: number,
): Promise<Paged<TvShowSummary> | Paged<MovieSummary>>;
export function readCatalogList(
  list: CatalogList,
  page: number,
): Promise<Paged<TvShowSummary> | Paged<MovieSummary>> {
  if (list.mediaType === "tv") {
    return list.slug === "popular"
      ? discoverTvShows({ page })
      : getTvList(TV_KINDS[list.slug], { page });
  }
  return list.slug === "popular"
    ? discoverMovies({ page })
    : getMovieList(MOVIE_KINDS[list.slug], { page });
}

/** One page of a list, tagged with its media type so a renderer can narrow it. */
export type TaggedCatalogPage =
  | { mediaType: "tv"; paged: Paged<TvShowSummary> }
  | { mediaType: "movie"; paged: Paged<MovieSummary> };

/**
 * `readCatalogList` with its result tagged, so a component rendering any list
 * picks the show or movie card by narrowing on `mediaType` rather than by a
 * cast. The very same call underneath, so it shares the cache entry. The
 * landing rows read TMDB page 1 through this.
 *
 * @throws {TmdbError} When TMDB fails.
 */
export async function readTaggedCatalogList(
  list: CatalogList,
  page: number,
): Promise<TaggedCatalogPage> {
  return list.mediaType === "tv"
    ? { mediaType: "tv", paged: await readCatalogList(list, page) }
    : { mediaType: "movie", paged: await readCatalogList(list, page) };
}

/**
 * One 24 title page of a list's See all grid, tagged like
 * `readTaggedCatalogList` (spec 0022, AC-21): the two `readCatalogList` pages
 * that hold it, so the grid's pages share cache entries with each other and
 * page 1 shares TMDB page 1 with the landing row. `totalPages` is the grid's
 * own count. The landing rows keep reading TMDB page 1 alone.
 *
 * The two branches make the same call: each narrows `list`, which picks the
 * `readCatalogList` overload and so the result type `readGridPage` infers.
 *
 * @throws {TmdbError} When either TMDB read fails.
 */
export async function readTaggedCatalogGridPage(
  list: CatalogList,
  page: number,
): Promise<TaggedCatalogPage> {
  return list.mediaType === "tv"
    ? {
        mediaType: "tv",
        paged: await readGridPage(page, (tmdbPage) =>
          readCatalogList(list, tmdbPage),
        ),
      }
    : {
        mediaType: "movie",
        paged: await readGridPage(page, (tmdbPage) =>
          readCatalogList(list, tmdbPage),
        ),
      };
}
