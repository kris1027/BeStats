"use client";

import { sizeImageUrl } from "@bestats/core/images/image-url";
import type { ImageLoaderProps } from "next/image";

/**
 * Appended when the fitting size is the source's own. Next warns in
 * development that a loader "does not implement width" whenever it returns
 * `src` unchanged, which every image at its pinned size would. A fragment never
 * reaches the CDN, so the request and its cache entry are the same file.
 */
const SAME_SIZE_FRAGMENT = "#same-size";

/**
 * The one `loaderFile` every `next/image` goes through: it maps a width
 * request onto TMDB's and IGDB's own pre-sized images, so the browser fetches
 * straight from their CDNs and the closed optimizer never runs
 * (prompts/tmdb-image-loader.md, prompts/close-image-optimizer.md; spec 0025,
 * AC-11, AC-12).
 *
 * The rung is picked by `sizeImageUrl` in core, the same rule the mobile app
 * uses (spec 0035, Images), so the size in the URL is the ceiling and nothing
 * is upgraded past it. `quality` is ignored because neither CDN has such a
 * parameter. Anything else, a local path such as `/tmdb-logo.svg` or a TMDB
 * size off the ladder included, comes back unchanged, so the loader never
 * builds a URL it was not handed and Next's development warning names it.
 */
export default function imageLoader({ src, width }: ImageLoaderProps): string {
  const source = src.endsWith(SAME_SIZE_FRAGMENT)
    ? src.slice(0, -SAME_SIZE_FRAGMENT.length)
    : src;
  const sized = sizeImageUrl(source, width);
  if (sized === null) return src;
  return sized === source ? `${sized}${SAME_SIZE_FRAGMENT}` : sized;
}
