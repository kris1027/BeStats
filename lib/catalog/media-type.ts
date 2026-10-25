import { z } from "zod";

import type { LibraryList } from "./library-list";

/** The two catalogs: TV shows and movies. */
export type MediaType = "tv" | "movie";

/**
 * What a library page can list: the two catalogs, and games (spec 0027,
 * AC-2). Games reach only `/watchlist`, `/upcoming` and `/watched` until a
 * games browse page or game search exists, so `MediaType` stays narrow and
 * the compiler keeps `game` away from `/search`, the catalog pages, the title
 * pages and the proxy.
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
 * The three library pages, one per `LibraryList`, and the only typed pages a
 * game tab exists on (spec 0027, AC-2).
 */
const LIBRARY_PATHS = [
  "/watchlist",
  "/upcoming",
  "/watched",
] as const satisfies readonly `/${LibraryList}`[];

export type LibraryPath = (typeof LIBRARY_PATHS)[number];

/**
 * The pages whose media type is their `type` parameter rather than their
 * path (feature 22): the library pages and `/search`. On each, the navbar
 * tabs switch `type` in place instead of leaving for `/shows` or `/movies`.
 */
export const TYPED_PATHS = [...LIBRARY_PATHS, "/search"] as const;

export type TypedPath = (typeof TYPED_PATHS)[number];

/** The `/search` parameters a tab switch keeps; genres and page are dropped. */
const SEARCH_KEPT = ["q", "year", "rating"] as const;

const typeSchema = z.enum(["tv", "movie"]);

/** True for a page whose media type comes from its `type` parameter. */
export function isTypedPath(pathname: string | null): pathname is TypedPath {
  return (TYPED_PATHS as readonly (string | null)[]).includes(pathname);
}

/** True for `/watchlist`, `/upcoming` and `/watched` (spec 0027, AC-2). */
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
 * The library pages' `type` parameter (spec 0027, AC-2): `parseMediaTypeParam`
 * plus `game`, which only counts while the games library is switched on. With
 * it off, `?type=game` is null like any unknown value, so the page shows its
 * "doesn't exist" panel.
 *
 * @param gamesEnabled `getGamesLibrary() === "on"` on the server,
 * `gamesLibraryEnabled()` in the navbar.
 */
export function parseLibraryTypeParam(
  value: string | string[] | null | undefined,
  gamesEnabled: boolean,
): LibraryType | null {
  if (value === "game") return gamesEnabled ? "game" : null;
  return parseMediaTypeParam(value);
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
  if (isTypedPath(pathname)) return parseMediaTypeParam(typeParam) ?? "tv";
  return null;
}

/**
 * `mediaTypeForLocation` for the controls that may list games: the navbar
 * tabs and the Library links (spec 0027, AC-3, AC-4). It is `game` only on a
 * library page asking for it while the games library is on, and otherwise
 * exactly `mediaTypeForLocation`.
 */
export function libraryTypeForLocation(
  pathname: string | null,
  typeParam: string | null,
  gamesEnabled: boolean,
): LibraryType | null {
  if (
    isLibraryPath(pathname) &&
    parseLibraryTypeParam(typeParam, gamesEnabled) === "game"
  ) {
    return "game";
  }
  return mediaTypeForLocation(pathname, typeParam);
}

type TypedHrefOptions = { current?: URLSearchParams; page?: number };

/**
 * A typed page's URL for one type. `type` is always written, so a copied link
 * says which tab it opens, as `/search` already does. A library page also
 * takes `game`; any other typed page only a catalog, so
 * `typedHref("/search", "game")` does not compile (spec 0027, AC-2).
 *
 * @param options.current The current query, from which `/search` keeps its
 * query, year and rating: genre ids differ between the two catalogs, and the
 * page starts again from 1.
 * @param options.page The page to open, written only from page 2, so page 1
 * has one URL, as on `/movies`.
 */
export function typedHref(
  path: LibraryPath,
  type: LibraryType,
  options?: TypedHrefOptions,
): string;
export function typedHref(
  path: TypedPath,
  type: MediaType,
  options?: TypedHrefOptions,
): string;
export function typedHref(
  path: TypedPath,
  type: LibraryType,
  options: TypedHrefOptions = {},
): string {
  const query = new URLSearchParams({ type });
  if (path === "/search" && options.current) {
    for (const name of SEARCH_KEPT) {
      const value = options.current.get(name);
      if (value) query.set(name, value);
    }
  }
  if (options.page !== undefined && options.page > 1) {
    query.set("page", String(options.page));
  }
  return `${path}?${query.toString()}`;
}
