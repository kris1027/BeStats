"use client";

import { TMDB_IMAGE_BASE } from "./constants";

/**
 * The TMDB widths the loader may pick, smallest first. Each answers 200 for
 * posters, backdrops, profiles and stills alike (checked live on 2026-10-16);
 * `original` is left out because it can be several megabytes.
 */
const WIDTH_LADDER = [92, 154, 185, 300, 342, 500, 780, 1280] as const;

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
  const prefix = `${TMDB_IMAGE_BASE}/`;
  if (!src.startsWith(prefix)) return src;
  const rest = src.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return src;

  const size = rest.slice(0, slash);
  const ceiling = sizeCeiling(size);
  if (ceiling === null) return src;

  const fit = WIDTH_LADDER.find((rung) => rung >= width) ?? ceiling;
  const url = `${prefix}w${Math.min(fit, ceiling)}${rest.slice(slash)}`;
  return url === src ? `${url}${UNCHANGED_SIZE_MARK}` : url;
}

/** The pixel width a source size allows, or null when it is not on the ladder. */
function sizeCeiling(size: string): number | null {
  if (size === "original") return ORIGINAL_CEILING;
  const match = /^w(\d+)$/.exec(size);
  if (!match) return null;
  const value = Number(match[1]);
  return (WIDTH_LADDER as readonly number[]).includes(value) ? value : null;
}

export default tmdbImageLoader;
