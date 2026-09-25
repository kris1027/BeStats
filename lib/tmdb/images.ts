import { TMDB_IMAGE_BASE } from "./constants";

/**
 * The TMDB image widths this app is allowed to request.
 *
 * A closed union rather than a free string: a typo in a size produces a URL
 * TMDB answers with a 404 image, which is invisible until someone looks at the
 * page. `original` is included for the rare full size case.
 */
export type TmdbImageSize =
  | "w92"
  | "w154"
  | "w185"
  | "w300"
  | "w500"
  | "w780"
  | "w1280"
  | "original";

/**
 * The size each normalized field is built with (spec 0002, AC-27).
 *
 * Pinned by the module rather than chosen per call site, so every poster in the
 * app is the same width and a page cannot quietly request `original` for a
 * thumbnail grid. `imageUrl` stays exported for the deliberate exception.
 * These are sensible defaults and should be checked against `design/` when
 * scope feature 5 builds the UI foundation.
 */
export const POSTER_SIZE: TmdbImageSize = "w500";
export const BACKDROP_SIZE: TmdbImageSize = "w1280";
export const PROFILE_SIZE: TmdbImageSize = "w185";
export const STILL_SIZE: TmdbImageSize = "w300";

/**
 * Builds an absolute TMDB image URL, or null when there is no image.
 *
 * Null in, null out is the whole point: AGENTS.md section 3 and spec 0002's
 * AC-13 both forbid inventing missing metadata, so a title with no poster gets
 * a null the UI can render an explicit placeholder for, never a broken URL.
 *
 * @param path TMDB's image path, for example `/abc123.jpg`. Null or empty when
 * TMDB has no image.
 * @param size One of the allowed widths.
 * @returns The absolute URL, or null when `path` is null or empty.
 */
export function imageUrl(
  path: string | null | undefined,
  size: TmdbImageSize,
): string | null {
  if (!path) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${TMDB_IMAGE_BASE}/${size}${normalizedPath}`;
}

/**
 * The same TMDB image at another width, or null when there is no image.
 *
 * A normalized summary carries only the absolute URL at `POSTER_SIZE`, and
 * quick search draws its posters a few dozen pixels wide, so it asks for the
 * smallest width instead of fetching five `w500` posters per keystroke
 * (spec 0010, value sourcing). A URL this module did not build is returned
 * unchanged rather than guessed at.
 *
 * @param url An absolute URL from `imageUrl`, or null.
 * @param size The width to swap in.
 */
export function resizeImageUrl(
  url: string | null,
  size: TmdbImageSize,
): string | null {
  if (!url) return null;
  const prefix = `${TMDB_IMAGE_BASE}/`;
  if (!url.startsWith(prefix)) return url;
  const rest = url.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return url;
  return `${prefix}${size}${rest.slice(slash)}`;
}
