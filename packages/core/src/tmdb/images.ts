/** TMDB's image CDN base. Sizes are appended by the web's `imageUrl`. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * The TMDB widths either app may request, smallest first. Each answers 200 for
 * posters, backdrops, profiles and stills alike (checked live on 2026-10-16).
 *
 * One list for the web's pinned sizes and the sizing ladder in
 * `images/image-url.ts`, so a width the sizer can pick is always one the web's
 * `TmdbImageSize` type allows, and adding a size is one edit. It lives in core
 * because the mobile app sizes the same URLs (spec 0035, Images).
 */
export const TMDB_IMAGE_WIDTHS = [
  92, 154, 185, 300, 342, 500, 780, 1280,
] as const;

/** A TMDB image URL split at its size segment. */
export type TmdbImageParts = { size: string; path: string };

/**
 * Splits an absolute TMDB image URL into its size segment and file path, or
 * returns null for a URL that is not a TMDB image. The one parser the web's
 * `resizeImageUrl` and the shared sizer use, so they agree on what a TMDB size
 * path is. The size comes back as a plain string because a URL from TMDB
 * itself can carry sizes the apps never request, such as `h632`.
 */
export function splitImageUrl(url: string): TmdbImageParts | null {
  const prefix = `${TMDB_IMAGE_BASE}/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  return { size: rest.slice(0, slash), path: rest.slice(slash) };
}
