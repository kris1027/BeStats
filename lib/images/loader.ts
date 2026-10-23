"use client";

import { IGDB_IMAGE_BASE } from "@/lib/igdb/constants";
import { TMDB_IMAGE_BASE } from "@/lib/tmdb/constants";
import { tmdbImageLoader } from "@/lib/tmdb/image-loader";

import { igdbImageLoader } from "./igdb-loader";

type LoaderParams = { src: string; width: number; quality?: number };

/**
 * The one `loaderFile` every `next/image` goes through, sending each URL to
 * the loader for its host (spec 0025, AC-11).
 *
 * One file, because Next takes a single global loader and a Server Component
 * cannot pass a loader function as a prop; dispatching here means a new
 * `next/image` of either catalog is sized correctly with no wrapper to
 * remember. Anything else, a local path such as `/tmdb-logo.svg` included,
 * comes back unchanged, so the closed optimizer stays closed
 * (prompts/close-image-optimizer.md).
 */
export default function imageLoader(params: LoaderParams): string {
  if (params.src.startsWith(`${TMDB_IMAGE_BASE}/`)) {
    return tmdbImageLoader(params);
  }
  if (params.src.startsWith(`${IGDB_IMAGE_BASE}/`)) {
    return igdbImageLoader(params);
  }
  return params.src;
}
