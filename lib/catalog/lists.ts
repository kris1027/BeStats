import { CATALOG_PATHS, type MediaType } from "./media-type";

/**
 * The TV lists a landing row and its list page show, in row order (spec 0021,
 * AC-1). Each is a static route folder under `app/shows/`; a test fails if a
 * folder and this list disagree.
 */
export const TV_LIST_SLUGS = [
  "trending",
  "popular",
  "airing-today",
  "on-the-air",
  "top-rated",
] as const;

/** The movie twin of `TV_LIST_SLUGS`, under `app/movies/`. */
export const MOVIE_LIST_SLUGS = [
  "trending",
  "popular",
  "now-playing",
  "upcoming",
  "top-rated",
] as const;

export type TvListSlug = (typeof TV_LIST_SLUGS)[number];
export type MovieListSlug = (typeof MOVIE_LIST_SLUGS)[number];

/** The words every list shows, wherever it is rendered (spec 0021, AC-1, AC-9, AC-12). */
type ListText = {
  /** The row's h2 on a landing. */
  rowTitle: string;
  /** The list page's h1, and its title. */
  heading: string;
  /** The one line under the h1, and the page's description. */
  note: string;
  /** Completes "There are no {pageNoun} at this page number." */
  pageNoun: string;
  /** What a row that loaded with no titles says. */
  emptyRowText: string;
};

export type TvCatalogList = ListText & { mediaType: "tv"; slug: TvListSlug };
export type MovieCatalogList = ListText & {
  mediaType: "movie";
  slug: MovieListSlug;
};
export type CatalogList = TvCatalogList | MovieCatalogList;

const EMPTY_ROW_TEXT = "Nothing here right now.";

/**
 * Every list, once (spec 0021, the registry). The routes, the proxy, the
 * sitemap and the landings all read slugs and words from here, so a slug is
 * written in exactly one place. Pure and free of `server-only`, so the proxy
 * and the sitemap can import it.
 */
export const CATALOG_LISTS: readonly CatalogList[] = [
  {
    mediaType: "tv",
    slug: "trending",
    rowTitle: "Trending this week",
    heading: "Trending shows this week",
    note: "TMDB's most watched shows over the past week.",
    pageNoun: "trending shows",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "tv",
    slug: "popular",
    rowTitle: "Popular",
    heading: "Popular shows",
    note: "Ordered by current popularity on TMDB.",
    pageNoun: "popular shows",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "tv",
    slug: "airing-today",
    rowTitle: "Airing today",
    heading: "Shows airing today",
    note: "Shows with an episode airing today, Polish time, per TMDB.",
    pageNoun: "shows airing today",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "tv",
    slug: "on-the-air",
    rowTitle: "On the air",
    heading: "Shows on the air",
    note: "Shows with an episode airing in the next 7 days, per TMDB.",
    pageNoun: "shows on the air",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "tv",
    slug: "top-rated",
    rowTitle: "Top rated",
    heading: "Top rated shows",
    note: "Ordered by TMDB community rating.",
    pageNoun: "top rated shows",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "movie",
    slug: "trending",
    rowTitle: "Trending this week",
    heading: "Trending movies this week",
    note: "TMDB's most watched movies over the past week.",
    pageNoun: "trending movies",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "movie",
    slug: "popular",
    rowTitle: "Popular",
    heading: "Popular movies",
    note: "Ordered by current popularity on TMDB.",
    pageNoun: "popular movies",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "movie",
    slug: "now-playing",
    rowTitle: "Now playing",
    heading: "Movies now playing",
    note: "In Polish cinemas now, per TMDB.",
    pageNoun: "movies now playing",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "movie",
    slug: "upcoming",
    rowTitle: "Upcoming",
    heading: "Upcoming movies",
    note: "Coming soon to Polish cinemas, per TMDB.",
    pageNoun: "upcoming movies",
    emptyRowText: EMPTY_ROW_TEXT,
  },
  {
    mediaType: "movie",
    slug: "top-rated",
    rowTitle: "Top rated",
    heading: "Top rated movies",
    note: "Ordered by TMDB community rating.",
    pageNoun: "top rated movies",
    emptyRowText: EMPTY_ROW_TEXT,
  },
];

/** One media type's lists, in row order (spec 0021, AC-1). */
export function catalogListsFor(mediaType: "tv"): TvCatalogList[];
export function catalogListsFor(mediaType: "movie"): MovieCatalogList[];
export function catalogListsFor(mediaType: MediaType): CatalogList[];
export function catalogListsFor(mediaType: MediaType): CatalogList[] {
  return CATALOG_LISTS.filter((list) => list.mediaType === mediaType);
}

/**
 * The registry entry a route renders. Typed so a route can only name a slug
 * its media type has; the throw is unreachable from typed code.
 */
export function catalogList(mediaType: "tv", slug: TvListSlug): TvCatalogList;
export function catalogList(
  mediaType: "movie",
  slug: MovieListSlug,
): MovieCatalogList;
export function catalogList(mediaType: MediaType, slug: string): CatalogList {
  const list = CATALOG_LISTS.find(
    (entry) => entry.mediaType === mediaType && entry.slug === slug,
  );
  if (!list) throw new Error(`No ${mediaType} list named ${slug}`);
  return list;
}

/** A list's page: `/shows/{slug}` or `/movies/{slug}` (spec 0021, AC-9). */
export function listPath(mediaType: MediaType, slug: string): string {
  return `${CATALOG_PATHS[mediaType]}/${slug}`;
}

/**
 * One URL per page of a list: page 1 is the bare path, page N is `?page=N`,
 * as the old landing grid was (spec 0021, AC-9, AC-15). The pagination links,
 * the canonical, the Retry link and each card's `returnPath` all use it.
 */
export function listPageHref(
  mediaType: MediaType,
  slug: string,
  page: number,
): string {
  const path = listPath(mediaType, slug);
  return page === 1 ? path : `${path}?page=${page}`;
}

/**
 * True for a path segment that names one of this media type's lists, matched
 * exactly and case sensitively, so `/shows/Popular` and `/shows/upcoming`
 * stay 404s (spec 0021, AC-13). The proxy checks it before the numeric id
 * parser.
 */
export function isCatalogListSlug(
  mediaType: MediaType,
  segment: string,
): boolean {
  return CATALOG_LISTS.some(
    (list) => list.mediaType === mediaType && list.slug === segment,
  );
}
