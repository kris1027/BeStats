"use client";

import type { ImageLoaderProps } from "next/image";

import { IGDB_COVER_LADDER, IGDB_IMAGE_BASE } from "@/lib/igdb/constants";

/**
 * Appended when the fitting size is the source's own, for the reason the TMDB
 * loader gives: Next warns in development about a loader that returns `src`
 * unchanged, and a fragment never reaches the CDN.
 */
const SAME_SIZE_FRAGMENT = "#same-size";

/** The rest of a cover URL after the base: `{size}/{image_id}.jpg`. */
const COVER_PATH = /^([^/]+)\/([^/?#]+\.jpg)$/;

/**
 * Maps a `next/image` width request onto IGDB's own pre-sized covers, so the
 * browser fetches straight from IGDB's CDN and the closed optimizer never runs
 * (spec 0025, AC-11, AC-12).
 *
 * The size in the URL is the ceiling: G1 builds covers at `t_cover_big_2x`,
 * so a dense screen gets 528px and a small card steps down, but nothing is
 * ever upgraded past what the URL named. `quality` is ignored because IGDB has
 * no such parameter. Any URL that is not an IGDB cover on the ladder comes back
 * unchanged, so the loader never builds a URL it was not handed.
 *
 * Lives in `lib/images/`, not `lib/igdb/`, because it runs in the browser and
 * every file in `lib/igdb/` with behaviour is server only (spec 0023, AC-2).
 */
export function igdbImageLoader({ src, width }: ImageLoaderProps): string {
  const source = src.endsWith(SAME_SIZE_FRAGMENT)
    ? src.slice(0, -SAME_SIZE_FRAGMENT.length)
    : src;
  const prefix = `${IGDB_IMAGE_BASE}/`;
  if (!source.startsWith(prefix)) return src;
  const match = COVER_PATH.exec(source.slice(prefix.length));
  if (!match) return src;

  const [, size, file] = match;
  const ceiling = IGDB_COVER_LADDER.findIndex((rung) => rung.size === size);
  if (ceiling === -1) return src;

  const allowed = IGDB_COVER_LADDER.slice(0, ceiling + 1);
  const fit = allowed.find((rung) => rung.width >= width) ?? allowed[ceiling];
  const url = `${IGDB_IMAGE_BASE}/${fit.size}/${file}`;
  return url === source ? `${url}${SAME_SIZE_FRAGMENT}` : url;
}
