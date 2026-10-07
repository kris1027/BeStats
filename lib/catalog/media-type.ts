import { z } from "zod";

/** The two catalogs: TV shows and movies. */
export type MediaType = "tv" | "movie";

/**
 * The pages whose media type is their `type` parameter rather than their
 * path (feature 22). On each, the navbar tabs switch `type` in place instead
 * of leaving for `/shows` or `/movies`.
 */
export const TYPED_PATHS = [
  "/watchlist",
  "/upcoming",
  "/watched",
  "/search",
] as const;

export type TypedPath = (typeof TYPED_PATHS)[number];

/** The `/search` parameters a tab switch keeps; genres and page are dropped. */
const SEARCH_KEPT = ["q", "year", "rating"] as const;

const typeSchema = z.enum(["tv", "movie"]);

/** True for a page whose media type comes from its `type` parameter. */
export function isTypedPath(pathname: string | null): pathname is TypedPath {
  return (TYPED_PATHS as readonly (string | null)[]).includes(pathname);
}

/**
 * The media type a `type` parameter asks for: `tv` when it is absent, so a
 * bare URL shows shows like `/` does, and null when it names neither
 * catalog. A null is shown as the page's "doesn't exist" panel, never
 * silently corrected (feature 22).
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
 * The media type of the page being viewed, which the tabs light and the
 * Library links and navbar search carry on (feature 22). The catalog and
 * title pages are typed by their path, the typed pages by their parameter
 * (an invalid one falls back to `tv` here: the page itself shows the error).
 * Any other page has no type, so nothing is lit and links use the default.
 *
 * @returns The type, or null on a page that has none.
 */
export function mediaTypeForLocation(
  pathname: string | null,
  typeParam: string | null,
): MediaType | null {
  if (pathname === null) return null;
  if (pathname === "/movies" || pathname.startsWith("/movies/")) {
    return "movie";
  }
  if (pathname === "/shows" || pathname.startsWith("/shows/")) return "tv";
  if (isTypedPath(pathname)) return parseMediaTypeParam(typeParam) ?? "tv";
  return null;
}

/**
 * A typed page's URL for one type. `type` is always written, so a copied link
 * says which tab it opens, as `/search` already does.
 *
 * @param current The current query, from which `/search` keeps its query,
 * year and rating: genre ids differ between the two catalogs, and the page
 * starts again from 1.
 */
export function typedHref(
  path: TypedPath,
  type: MediaType,
  current?: URLSearchParams,
): string {
  const query = new URLSearchParams({ type });
  if (path === "/search" && current) {
    for (const name of SEARCH_KEPT) {
      const value = current.get(name);
      if (value) query.set(name, value);
    }
  }
  return `${path}?${query.toString()}`;
}
