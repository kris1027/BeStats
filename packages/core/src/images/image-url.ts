import {
  IGDB_ART_LADDER,
  IGDB_COVER_LADDER,
  IGDB_HERO_COVER_SIZE,
  IGDB_IMAGE_BASE,
} from "../igdb/constants";
import {
  splitImageUrl,
  TMDB_IMAGE_BASE,
  TMDB_IMAGE_WIDTHS,
} from "../tmdb/images";

const TMDB_LADDER_TOP = TMDB_IMAGE_WIDTHS[TMDB_IMAGE_WIDTHS.length - 1];

/** The rest of an IGDB image URL after the base: `{size}/{image_id}.jpg`. */
const IGDB_IMAGE_PATH = /^([^/]+)\/([^/?#]+\.jpg)$/;

/**
 * A game's uploaded cover (`fullCoverUrl`): the cover ladder with the uploaded
 * file as an unbounded top rung, so it steps down like any cover and is served
 * whole past `t_cover_big_2x`, the rule TMDB's `original` follows.
 */
const IGDB_HERO_COVER_LADDER = [
  ...IGDB_COVER_LADDER,
  { size: IGDB_HERO_COVER_SIZE, width: Number.POSITIVE_INFINITY },
];

/**
 * Each ladder is matched only against its own sizes, so a cover never steps
 * onto an art rung or the other way round (spec 0028, AC-6). A cover size
 * matches the plain cover ladder first, so `t_original` stays the ceiling only
 * of a URL that named it.
 */
const IGDB_LADDERS = [
  IGDB_COVER_LADDER,
  IGDB_ART_LADDER,
  IGDB_HERO_COVER_LADDER,
];

/**
 * The same TMDB or IGDB image at the smallest size that is at least `width`
 * pixels wide, never above the size the URL already names; or null when the
 * URL is not a sized TMDB or IGDB image.
 *
 * The catalog normalizers build every image at a ceiling size, and both apps
 * step it down here to what a screen draws (spec 0035, Images, settled
 * 2026-11-19), so the web's `next/image` loaders and the phone pick the same
 * rung for the same width and no image is ever upgraded past what the server
 * chose. Null rather than the input lets the web loader tell "not ours" from
 * "already the right size", which `next/image` needs.
 *
 * @param url An absolute image URL from a v1 response or a normalized type.
 * @param width The pixel width the image is drawn at (points times density
 * on a phone).
 */
export function sizeImageUrl(url: string, width: number): string | null {
  if (url.startsWith(`${TMDB_IMAGE_BASE}/`)) return sizeTmdbUrl(url, width);
  if (url.startsWith(`${IGDB_IMAGE_BASE}/`)) return sizeIgdbUrl(url, width);
  return null;
}

/**
 * `sizeImageUrl` for callers that only want a URL to load: an unknown URL
 * comes back unchanged rather than guessed at (spec 0035, Images). The mobile
 * app calls this before handing a URL to `expo-image`.
 */
export function imageUrlForWidth(url: string, width: number): string {
  return sizeImageUrl(url, width) ?? url;
}

function sizeTmdbUrl(url: string, width: number): string | null {
  const parts = splitImageUrl(url);
  if (!parts) return null;
  if (parts.size === "original" && width > TMDB_LADDER_TOP) return url;
  const ceiling = tmdbCeiling(parts.size);
  if (ceiling === null) return null;
  const fit = TMDB_IMAGE_WIDTHS.find((rung) => rung >= width) ?? ceiling;
  return `${TMDB_IMAGE_BASE}/w${Math.min(fit, ceiling)}${parts.path}`;
}

/** A size's width on the ladder, or null for a size the apps never request. */
function tmdbCeiling(size: string): number | null {
  if (size === "original") return TMDB_LADDER_TOP;
  const match = /^w(\d+)$/.exec(size);
  if (!match) return null;
  const value = Number(match[1]);
  return (TMDB_IMAGE_WIDTHS as readonly number[]).includes(value)
    ? value
    : null;
}

function sizeIgdbUrl(url: string, width: number): string | null {
  const match = IGDB_IMAGE_PATH.exec(url.slice(IGDB_IMAGE_BASE.length + 1));
  if (!match) return null;
  const [, size, file] = match;
  const ladder = IGDB_LADDERS.find((rungs) =>
    rungs.some((rung) => rung.size === size),
  );
  if (!ladder) return null;
  const ceiling = ladder.findIndex((rung) => rung.size === size);
  const allowed = ladder.slice(0, ceiling + 1);
  const fit = allowed.find((rung) => rung.width >= width) ?? allowed[ceiling];
  return `${IGDB_IMAGE_BASE}/${fit.size}/${file}`;
}
