"use client";

import { TMDB_IMAGE_BASE } from "./constants";
import { splitImageUrl, TMDB_IMAGE_WIDTHS } from "./images";

/** What `original` is capped to, so a full size source never ships as is. */
const ORIGINAL_CEILING = 1280;

/**
 * Appended when the fitting size is the source's own. Next warns in
 * development that a loader "does not implement width" whenever it returns
 * `src` unchanged, which every image at its pinned size would. A fragment never
 * reaches TMDB, so the request and its CDN cache entry are the same file.
 */
const UNCHANGED_SIZE_MARK = "#tmdb";

type LoaderParams = { src: string; width: number; quality?: number };

/**
 * Maps a `next/image` width request onto TMDB's own pre-sized images, so the
 * browser fetches straight from TMDB's CDN and Vercel Image Optimization runs
 * no transformations (prompts/tmdb-image-loader.md). TMDB already negotiates
 * WebP from the `Accept` header, so nothing is lost by skipping the optimizer.
 *
 * The size `lib/tmdb/images.ts` pinned is the ceiling: a `w500` poster is never
 * upgraded on a dense screen, so no page gets heavier than its field size allows.
 * `quality` is ignored because TMDB has no such parameter. Any URL that is not
 * a TMDB size path comes back unchanged, so the loader never builds a URL for a
 * host it was not handed.
 */
export function tmdbImageLoader({ src, width }: LoaderParams): string {
  const parts = splitImageUrl(src);
  if (!parts) return src;
  const ceiling = sizeCeiling(parts.size);
  if (ceiling === null) return src;

  // `original` is left off the ladder because it can be several megabytes.
  const fit = TMDB_IMAGE_WIDTHS.find((rung) => rung >= width) ?? ceiling;
  const url = `${TMDB_IMAGE_BASE}/w${Math.min(fit, ceiling)}${parts.path}`;
  return url === src ? `${url}${UNCHANGED_SIZE_MARK}` : url;
}

/** The pixel width a source size allows, or null when it is not on the ladder. */
function sizeCeiling(size: string): number | null {
  if (size === "original") return ORIGINAL_CEILING;
  const match = /^w(\d+)$/.exec(size);
  if (!match) return null;
  const value = Number(match[1]);
  return (TMDB_IMAGE_WIDTHS as readonly number[]).includes(value)
    ? value
    : null;
}

export default tmdbImageLoader;
