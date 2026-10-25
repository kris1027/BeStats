import "server-only";
import { isCatalogVisible } from "./catalog-filter";
import {
  IGDB_ART_SIZE,
  IGDB_COVER_SIZE,
  IGDB_IMAGE_BASE,
  IGDB_VISIBLE_GAME_TYPES,
} from "./constants";
import {
  type GameDetailRecord,
  type GameSummaryRecord,
  refSchema,
} from "./schemas";
import type { Game, GameRef, GameSummary, GameType } from "./types";

/**
 * IGDB's shape to the app's shape (spec 0023, AC-15, AC-16).
 *
 * Missing stays missing: an absent cover, date, summary or rating becomes
 * `null`, and so does a rating or rating count of 0, which IGDB uses for "no
 * votes". Nothing here invents a value or reads the clock.
 */

/**
 * `{base}/t_cover_big_2x/{image_id}.jpg`, or null with no image id. The size is
 * the loader's ceiling (spec 0025, AC-12), never what every image loads.
 */
export function coverUrl(imageId: string | null | undefined): string | null {
  const id = imageId?.trim();
  return id ? `${IGDB_IMAGE_BASE}/${IGDB_COVER_SIZE}/${id}.jpg` : null;
}

/** Artworks or screenshots as `schemas.ts` leaves them. */
type ImageList =
  | readonly ({ image_id?: string | null } | null | undefined)[]
  | null
  | undefined;

/**
 * The wide art of a game (spec 0028, AC-6): the artwork with the lowest
 * `image_id`, else the screenshot with the lowest, built at `t_1080p`, the
 * ceiling the loader steps down from. IGDB promises no array order, so the
 * lowest id in string order is what keeps the pick the same on every read.
 */
export function artUrl(record: {
  artworks?: ImageList;
  screenshots?: ImageList;
}): string | null {
  const id =
    lowestImageId(record.artworks) ?? lowestImageId(record.screenshots);
  return id === null ? null : `${IGDB_IMAGE_BASE}/${IGDB_ART_SIZE}/${id}.jpg`;
}

function lowestImageId(images: ImageList): string | null {
  let lowest: string | null = null;
  for (const image of images ?? []) {
    const id = image?.image_id?.trim();
    if (id && (lowest === null || id < lowest)) lowest = id;
  }
  return lowest;
}

/**
 * The UTC calendar day and year of a unix seconds timestamp. IGDB's earliest
 * date can be a placeholder (a year or a quarter); that inaccuracy is accepted
 * rather than modelled (AC-15).
 */
export function releaseDay(unixSeconds: number | null | undefined): {
  releaseDate: string | null;
  releaseYear: number | null;
} {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return { releaseDate: null, releaseYear: null };
  }
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return { releaseDate: null, releaseYear: null };
  }
  return {
    releaseDate: date.toISOString().slice(0, 10),
    releaseYear: date.getUTCFullYear(),
  };
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** `rating / 10` at full precision; rounding is the page's job. */
function communityRating(rating: number | null | undefined): number | null {
  const value = positiveOrNull(rating);
  return value === null ? null : value / 10;
}

function gameTypeOf(id: number | null | undefined): GameType | null {
  if (id === null || id === undefined) return null;
  return (IGDB_VISIBLE_GAME_TYPES as Record<number, GameType>)[id] ?? "other";
}

/** Expanded `{ id, name }` entries with a name; the rest are dropped. */
function refs(values: readonly unknown[] | null | undefined): GameRef[] {
  const found: GameRef[] = [];
  for (const value of values ?? []) {
    const parsed = refSchema.safeParse(value);
    if (parsed.success) found.push(parsed.data);
  }
  return found;
}

/** Positive integer ids, from either bare ids or expanded objects. */
function ids(values: readonly unknown[] | null | undefined): number[] {
  const found: number[] = [];
  for (const value of values ?? []) {
    const id =
      typeof value === "object" && value !== null && "id" in value
        ? (value as { id: unknown }).id
        : value;
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) {
      found.push(id);
    }
  }
  return found;
}

/** The catalog filter's verdict on a record read by id (AC-10). */
function isHidden(record: GameDetailRecord | GameSummaryRecord): boolean {
  return !isCatalogVisible({
    gameType: record.game_type ?? null,
    versionParent: record.version_parent ?? null,
    themeIds: ids(record.themes),
  });
}

/**
 * A `getGame` record as a `Game`. Platform, genre and theme names come from
 * IGDB's expansion here, and `hidden` from the catalog rule rather than a
 * refusal, so a reclassified game in a user's list stays visible (root
 * `AGENTS.md`, "Games": catalog filter).
 */
export function normalizeGame(record: GameDetailRecord): Game {
  return {
    id: record.id,
    name: record.name,
    slug: textOrNull(record.slug),
    coverUrl: coverUrl(record.cover?.image_id),
    ...releaseDay(record.first_release_date),
    platforms: refs(record.platforms),
    genres: refs(record.genres),
    themes: refs(record.themes),
    summary: textOrNull(record.summary),
    gameType: gameTypeOf(record.game_type),
    communityRating: communityRating(record.rating),
    communityRatingCount: positiveOrNull(record.rating_count),
    hidden: isHidden(record),
  };
}

/**
 * A batch, search or discover record as a `GameSummary`. Genres and platforms
 * stay ids, because a card names them from the cached reference lists instead
 * of making every list read expand them.
 */
export function normalizeSummary(record: GameSummaryRecord): GameSummary {
  return {
    id: record.id,
    name: record.name,
    coverUrl: coverUrl(record.cover?.image_id),
    artUrl: artUrl(record),
    ...releaseDay(record.first_release_date),
    communityRating: communityRating(record.rating),
    communityRatingCount: positiveOrNull(record.rating_count),
    genreIds: ids(record.genres),
    platformIds: ids(record.platforms),
    hidden: isHidden(record),
  };
}
