"use client";

import type { ImageLoaderProps } from "next/image";

import {
  IGDB_ART_LADDER,
  IGDB_COVER_LADDER,
  IGDB_IMAGE_BASE,
} from "@/lib/igdb/constants";

/**
 * Appended when the fitting size is the source's own, for the reason the TMDB
 * loader gives: Next warns in development about a loader that returns `src`
 * unchanged, and a fragment never reaches the CDN.
 */
const SAME_SIZE_FRAGMENT = "#same-size";

/** The rest of an image URL after the base: `{size}/{image_id}.jpg`. */
const IMAGE_PATH = /^([^/]+)\/([^/?#]+\.jpg)$/;

/**
 * The two ladders, each matched only against its own sizes, so a cover never
 * steps onto an art rung or the other way round (spec 0028, AC-6).
 */
const LADDERS = [IGDB_COVER_LADDER, IGDB_ART_LADDER];

/**
 * Maps a `next/image` width request onto IGDB's own pre-sized covers and art,
 * so the browser fetches straight from IGDB's CDN and the closed optimizer
 * never runs (spec 0025, AC-11, AC-12; spec 0028, AC-6).
 *
 * The size in the URL is the ceiling: G1 builds covers at `t_cover_big_2x`
 * and G6 builds art at `t_1080p`, so a dense screen gets the full size and a
 * small card steps down its own ladder, but nothing is ever upgraded past what
 * the URL named. `quality` is ignored because IGDB has no such parameter. Any
 * URL that is not an IGDB image on a ladder comes back unchanged, so the
 * loader never builds a URL it was not handed.
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
  const match = IMAGE_PATH.exec(source.slice(prefix.length));
  if (!match) return src;

  const [, size, file] = match;
  const ladder = LADDERS.find((rungs) =>
    rungs.some((rung) => rung.size === size),
  );
  if (!ladder) return src;
  const ceiling = ladder.findIndex((rung) => rung.size === size);

  const allowed = ladder.slice(0, ceiling + 1);
  const fit = allowed.find((rung) => rung.width >= width) ?? allowed[ceiling];
  const url = `${IGDB_IMAGE_BASE}/${fit.size}/${file}`;
  return url === source ? `${url}${SAME_SIZE_FRAGMENT}` : url;
}
