import { CATALOG_PATHS, type LibraryType, type MediaType } from "./media-type";

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

/**
 * The games twin, under `app/games/` (spec 0028, AC-2, AC-9). Its lists come
 * from IGDB, not TMDB, through `readGameListPage`.
 */
export const GAME_LIST_SLUGS = [
  "trending",
  "popular",
  "recently-released",
  "coming-soon",
  "top-rated",
] as const;

export type TvListSlug = (typeof TV_LIST_SLUGS)[number];
export type MovieListSlug = (typeof MOVIE_LIST_SLUGS)[number];
export type GameListSlug = (typeof GAME_LIST_SLUGS)[number];

/** The words every list shows, wherever it is rendered (spec 0021, AC-1, AC-9). */
type ListText = {
  /** The row's h2 on a landing. */
  rowTitle: string;
  /** The list page's h1, and its title. */
  heading: string;
  /** The one line under the h1, and the page's description. */
  note: string;
  /** Completes "There are no {pageNoun} at this page number." */
  pageNoun: string;
};

export type TvCatalogList = ListText & { mediaType: "tv"; slug: TvListSlug };
export type MovieCatalogList = ListText & {
  mediaType: "movie";
  slug: MovieListSlug;
};
export type GameCatalogList = ListText & {
  mediaType: "game";
  slug: GameListSlug;
  /** The cards print each game's release day: Coming soon (spec 0028, AC-8). */
  datedCards?: true;
};
/** A TMDB list: the shows and movies the sitemap and TMDB reads take. */
export type TmdbCatalogList = TvCatalogList | MovieCatalogList;
export type CatalogList = TmdbCatalogList | GameCatalogList;

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
  },
  {
    mediaType: "tv",
    slug: "popular",
    rowTitle: "Popular",
    heading: "Popular shows",
    note: "Ordered by current popularity on TMDB.",
    pageNoun: "popular shows",
  },
  {
    mediaType: "tv",
    slug: "airing-today",
    rowTitle: "Airing today",
    heading: "Shows airing today",
    note: "Shows with an episode airing today, Polish time, per TMDB.",
    pageNoun: "shows airing today",
  },
  {
    mediaType: "tv",
    slug: "on-the-air",
    rowTitle: "On the air",
    heading: "Shows on the air",
    note: "Shows with an episode airing in the next 7 days, per TMDB.",
    pageNoun: "shows on the air",
  },
  {
    mediaType: "tv",
    slug: "top-rated",
    rowTitle: "Top rated",
    heading: "Top rated shows",
    note: "Ordered by TMDB community rating.",
    pageNoun: "top rated shows",
  },
  {
    mediaType: "movie",
    slug: "trending",
    rowTitle: "Trending this week",
    heading: "Trending movies this week",
    note: "TMDB's most watched movies over the past week.",
    pageNoun: "trending movies",
  },
  {
    mediaType: "movie",
    slug: "popular",
    rowTitle: "Popular",
    heading: "Popular movies",
    note: "Ordered by current popularity on TMDB.",
    pageNoun: "popular movies",
  },
  {
    mediaType: "movie",
    slug: "now-playing",
    rowTitle: "Now playing",
    heading: "Movies now playing",
    note: "In Polish cinemas now, per TMDB.",
    pageNoun: "movies now playing",
  },
  {
    mediaType: "movie",
    slug: "upcoming",
    rowTitle: "Upcoming",
    heading: "Upcoming movies",
    note: "Coming soon to Polish cinemas, per TMDB.",
    pageNoun: "upcoming movies",
  },
  {
    mediaType: "movie",
    slug: "top-rated",
    rowTitle: "Top rated",
    heading: "Top rated movies",
    note: "Ordered by TMDB community rating.",
    pageNoun: "top rated movies",
  },
  {
    mediaType: "game",
    slug: "trending",
    rowTitle: "Trending now",
    heading: "Trending games",
    note: "The games people are looking at most on IGDB right now.",
    pageNoun: "trending games",
  },
  {
    mediaType: "game",
    slug: "popular",
    rowTitle: "Popular",
    heading: "Popular games",
    note: "The games the most IGDB members are playing right now.",
    pageNoun: "popular games",
  },
  {
    mediaType: "game",
    slug: "recently-released",
    rowTitle: "Recently released",
    heading: "Recently released games",
    note: "Released in the last 60 days, most anticipated first, per IGDB.",
    pageNoun: "recently released games",
  },
  {
    mediaType: "game",
    slug: "coming-soon",
    rowTitle: "Coming soon",
    heading: "Games coming soon",
    note: "Releasing in the next 120 days, most anticipated first, per IGDB.",
    pageNoun: "upcoming games",
    datedCards: true,
  },
  {
    mediaType: "game",
    slug: "top-rated",
    rowTitle: "Top rated",
    heading: "Top rated games",
    note: "Ordered by IGDB community rating, among games with at least 100 ratings.",
    pageNoun: "top rated games",
  },
];

/**
 * One media type's lists, in row order (spec 0021, AC-1). The `MediaType`
 * overload never returns a game list, which is what keeps the sitemap, which
 * asks for `tv` and `movie`, free of `/games` URLs until G10 (spec 0028,
 * AC-13).
 */
export function catalogListsFor(mediaType: "tv"): TvCatalogList[];
export function catalogListsFor(mediaType: "movie"): MovieCatalogList[];
export function catalogListsFor(mediaType: "game"): GameCatalogList[];
export function catalogListsFor(mediaType: MediaType): TmdbCatalogList[];
export function catalogListsFor(mediaType: LibraryType): CatalogList[] {
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
export function catalogList(
  mediaType: "game",
  slug: GameListSlug,
): GameCatalogList;
export function catalogList(mediaType: LibraryType, slug: string): CatalogList {
  const list = CATALOG_LISTS.find(
    (entry) => entry.mediaType === mediaType && entry.slug === slug,
  );
  if (!list) throw new Error(`No ${mediaType} list named ${slug}`);
  return list;
}

/**
 * A list's page: `/shows/{slug}`, `/movies/{slug}` or `/games/{slug}` (spec
 * 0021, AC-9; spec 0028, AC-9). Takes
 * the registry entry, not a media type and slug, so a caller cannot pair a
 * slug with the wrong catalog.
 */
export function listPath(list: CatalogList): string {
  return `${CATALOG_PATHS[list.mediaType]}/${list.slug}`;
}

/**
 * One URL per page of a list: page 1 is the bare path, page N is `?page=N`,
 * as the old landing grid was (spec 0021, AC-9, AC-15). The pagination links,
 * the canonical, the Retry link and each card's `returnPath` all use it.
 */
export function listPageHref(list: CatalogList, page: number): string {
  const path = listPath(list);
  return page === 1 ? path : `${path}?page=${page}`;
}

/**
 * True for a path segment that names one of this media type's lists, matched
 * exactly and case sensitively, so `/shows/Popular` and `/shows/upcoming`
 * stay 404s (spec 0021, AC-13; spec 0028, AC-12). The proxy checks it before
 * the numeric id parser.
 */
export function isCatalogListSlug(
  mediaType: LibraryType,
  segment: string,
): boolean {
  return CATALOG_LISTS.some(
    (list) => list.mediaType === mediaType && list.slug === segment,
  );
}
