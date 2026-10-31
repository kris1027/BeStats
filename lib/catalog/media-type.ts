import { z } from "zod";

import { IGDB_MIN_YEAR } from "@/lib/igdb/constants";

import {
  defaultLibraryTypeAt,
  LIBRARY_PATHS,
  type LibraryPageKey,
  type LibraryPath,
  libraryPath,
  shownLibraryPage,
} from "./library-list";

/** The two catalogs: TV shows and movies. */
export type MediaType = "tv" | "movie";

/**
 * What a library page or `/search` can list: the two catalogs, and games
 * (spec 0027, AC-2; spec 0029, AC-1). `MediaType` stays narrow, so the
 * compiler keeps `game` away from the TMDB reads, the title pages and the
 * proxy.
 */
export type LibraryType = MediaType | "game";

/**
 * Each catalog's browse page, which also types every title page below it
 * (feature 22). The one place these paths are written together. `/games`
 * joined in spec 0028; the record is keyed by `LibraryType`, while
 * `MediaType` stays `tv | movie`.
 */
export const CATALOG_PATHS = {
  tv: "/shows",
  movie: "/movies",
  game: "/games",
} as const satisfies Record<LibraryType, string>;

/**
 * The catalog each media type's titles come from, named in every error and
 * empty copy that blames it (spec 0028, AC-11). The one place a type is
 * paired with its source, so a games state never says TMDB.
 */
export const CATALOG_SOURCES = {
  tv: "TMDB",
  movie: "TMDB",
  game: "IGDB",
} as const satisfies Record<LibraryType, string>;

/** A catalog name as `CATALOG_SOURCES` spells it, for props that blame one. */
export type CatalogSource = (typeof CATALOG_SOURCES)[LibraryType];

export type { LibraryPath };

/**
 * The pages whose media type is their `type` parameter rather than their
 * path (feature 22): the eight library routes (`LIBRARY_PATHS`,
 * prompts/library-page-urls.md) and `/search`. On each, the navbar tabs
 * switch the tab in place instead of leaving for `/shows` or `/movies`.
 */
export const TYPED_PATHS: readonly TypedPath[] = [...LIBRARY_PATHS, "/search"];

export type TypedPath = LibraryPath | "/search";

/**
 * The `/search` parameters a tab switch keeps; genres, platforms and page are
 * dropped (spec 0029, AC-14).
 */
const SEARCH_KEPT = ["q", "year", "rating"] as const;

const typeSchema = z.enum(["tv", "movie"]);

/** True for a page whose media type comes from its `type` parameter. */
export function isTypedPath(pathname: string | null): pathname is TypedPath {
  return (TYPED_PATHS as readonly (string | null)[]).includes(pathname);
}

/**
 * True for a library route, one of the eight in `LIBRARY_PATHS`
 * (spec 0027, AC-2; prompts/library-page-urls.md).
 */
export function isLibraryPath(
  pathname: string | null,
): pathname is LibraryPath {
  return (LIBRARY_PATHS as readonly (string | null)[]).includes(pathname);
}

/**
 * True for exactly `tv` or `movie`. Unlike `parseMediaTypeParam`, an absent
 * value is not `tv`: for a stored value, absence must stay absence.
 */
export function isMediaType(value: unknown): value is MediaType {
  return typeSchema.safeParse(value).success;
}

/**
 * The media type a `type` parameter asks for: `tv` when it is absent, so a
 * bare URL shows shows like `/` does, and null when it names neither
 * catalog. A null is shown as the page's "doesn't exist" panel, never
 * silently corrected (feature 22). An empty `?type=` is a value, not an
 * absence, so it is null too: only a URL with no `type` at all means `tv`.
 *
 * The one parser of `type`, `/search` included (spec 0010, AC-7), so the
 * typed pages cannot drift apart on what they accept.
 */
export function parseMediaTypeParam(
  value: string | string[] | null | undefined,
): MediaType | null {
  if (value === undefined || value === null) return "tv";
  if (Array.isArray(value)) return null;
  const parsed = typeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The library pages' and `/search`'s `type` parameter (spec 0027, AC-2):
 * `parseMediaTypeParam` plus `game`, always accepted since games launched
 * (spec 0032, AC-12).
 */
export function parseLibraryTypeParam(
  value: string | string[] | null | undefined,
): LibraryType | null {
  if (value === "game") return "game";
  return parseMediaTypeParam(value);
}

/**
 * The tab a library route shows for its `type` parameter: the parameter when
 * it names a tab, and otherwise, absent or invalid, the route's default tab,
 * so a bare `/playing` is games (prompts/library-page-urls.md). Unlike
 * `parseLibraryPageType` it never returns null, for the chrome around a page
 * (the tabs, the title) that must name some tab while the page itself shows
 * the panel. A tab without a page at the route is still that tab.
 */
export function shownLibraryType(
  path: LibraryPath,
  typeParam: string | string[] | null | undefined,
): LibraryType {
  return parseLibraryPageType(path, typeParam) ?? defaultLibraryTypeAt(path);
}

/**
 * A library route's `type` parameter: `parseLibraryTypeParam`, except that an
 * absent value is the route's default tab rather than shows, so a bare
 * `/playing` lists games and a bare `/watchlist` movies
 * (prompts/library-page-urls.md). Null still means the value names no tab.
 */
export function parseLibraryPageType(
  path: LibraryPath,
  value: string | string[] | null | undefined,
): LibraryType | null {
  if (value === undefined || value === null) return defaultLibraryTypeAt(path);
  return parseLibraryTypeParam(value);
}

/**
 * A title's own page: `/shows/{id}` or `/movies/{id}`, under its catalog's
 * browse path (feature 22). The one builder of a title page URL, shared by
 * search results and the title pages' Retry and return links.
 */
export function titleHref(type: MediaType, id: number): string {
  return `${CATALOG_PATHS[type]}/${id}`;
}

/**
 * A game's own page, `/games/{id}`, beside `titleHref` (spec 0027). The one
 * builder of a game page URL: the library cards, the game page's Retry link
 * and its tracking slot's return path all use it.
 */
export function gameHref(id: number): string {
  return `/games/${id}`;
}

/**
 * The media type of the page being viewed, which the tabs light and the
 * Library links and navbar search carry on (feature 22). The catalog and
 * title pages are typed by their path, the typed pages by their parameter
 * (an invalid one falls back to `tv` here: the page itself shows the error).
 * Any other page has no type, so the navbar shows no tabs, search or Library
 * links there, and the logo falls back to the catalog last viewed
 * (prompts/hide-tabs-without-type.md).
 *
 * @returns The type, or null on a page that has none.
 */
export function mediaTypeForLocation(
  pathname: string | null,
  typeParam: string | null,
): MediaType | null {
  if (pathname === null) return null;
  for (const type of ["tv", "movie"] as const) {
    const path = CATALOG_PATHS[type];
    if (pathname === path || pathname.startsWith(`${path}/`)) return type;
  }
  if (isTypedPath(pathname)) {
    const type = typedPathType(pathname, typeParam);
    return type === "game" ? "tv" : type;
  }
  return null;
}

/**
 * The tab a typed page shows, games included: a library route's own
 * (`shownLibraryType`), or `/search`'s parameter, `tv` when it names none.
 * The one reading both location helpers share.
 */
function typedPathType(path: TypedPath, typeParam: string | null) {
  if (isLibraryPath(path)) return shownLibraryType(path, typeParam);
  return parseLibraryTypeParam(typeParam) ?? "tv";
}

/** True on `/games` and every path under it (spec 0028, AC-14). */
export function isGamesPath(pathname: string | null): boolean {
  if (pathname === null) return false;
  return (
    pathname === CATALOG_PATHS.game ||
    pathname.startsWith(`${CATALOG_PATHS.game}/`)
  );
}

/**
 * `mediaTypeForLocation` for the controls that may list games: the navbar
 * tabs, the Library links, the search and the logo (spec 0027, AC-3, AC-4;
 * spec 0028, AC-14, AC-16; spec 0029, AC-14, AC-15, AC-18). It is `game` on
 * `/games` and its list and game pages, and on a library page or `/search`
 * asking for it, and otherwise exactly `mediaTypeForLocation`.
 */
export function libraryTypeForLocation(
  pathname: string | null,
  typeParam: string | null,
): LibraryType | null {
  if (isGamesPath(pathname)) return "game";
  if (isTypedPath(pathname)) return typedPathType(pathname, typeParam);
  return mediaTypeForLocation(pathname, typeParam);
}

type TypedHrefOptions = { current?: URLSearchParams; page?: number };

/**
 * `/search`'s URL for one tab. `type` is always written, so a copied link
 * says which tab it opens. A library page's links come from `libraryHref`
 * and `libraryTabSwitchHref` instead (prompts/library-page-urls.md).
 *
 * @param options.current The current query. It keeps the query, year and
 * rating: genre and platform ids differ between catalogs, and the page
 * starts again from 1. A year before 1950 is dropped on a switch to games,
 * which has none, so a switch never lands on an invalid filter (spec 0029,
 * AC-14).
 * @param options.page The page to open, written only from page 2, so page 1
 * has one URL, as on `/movies`.
 */
export function typedHref(
  path: "/search",
  type: LibraryType,
  options: TypedHrefOptions = {},
): string {
  const query = new URLSearchParams({ type });
  if (options.current) {
    for (const name of SEARCH_KEPT) {
      const value = options.current.get(name);
      if (!value) continue;
      if (name === "year" && type === "game" && Number(value) < IGDB_MIN_YEAR) {
        continue;
      }
      query.set(name, value);
    }
  }
  return withPage(path, query, options.page);
}

/**
 * Where a navbar tab leads from a library route: the matching page of that
 * tab, so Playing on games becomes Upcoming on shows, and games' Coming
 * soon, which no other tab has, becomes their first page (decision 5 of
 * prompts/library-page-urls.md). Page 1, since the other tab's list is
 * another length.
 *
 * @param current The current query, whose `type` says which page the route
 * is now. A tab without a page there (`/playing?type=tv`) reads as the
 * route's default tab, so its panel's tabs still lead to Playing's matches.
 */
export function libraryTabSwitchHref(
  path: LibraryPath,
  type: LibraryType,
  current?: URLSearchParams,
): string {
  const from = shownLibraryType(path, current?.get("type") ?? null);
  return libraryHref(shownLibraryPage(path, from).page, type);
}

/**
 * A library page's URL on one tab (prompts/library-page-urls.md): its route
 * on that tab, from `libraryPath`, with `type` always written and `page` from
 * page 2. The one builder of a library link: the navbar, the pager, the
 * panels and every return and retry path use it.
 */
export function libraryHref(
  page: LibraryPageKey,
  type: LibraryType,
  options: { page?: number } = {},
): string {
  return withPage(
    libraryPath(page, type),
    new URLSearchParams({ type }),
    options.page,
  );
}

function withPage(path: string, query: URLSearchParams, page?: number) {
  if (page !== undefined && page > 1) query.set("page", String(page));
  return `${path}?${query.toString()}`;
}
