import "server-only";
import { isCatalogVisible } from "./catalog-filter";
import {
  IGDB_ART_SIZE,
  IGDB_COVER_SIZE,
  IGDB_DATE_FORMAT,
  IGDB_IMAGE_BASE,
  IGDB_MAX_SCREENSHOTS,
  IGDB_VISIBLE_GAME_TYPES,
} from "./constants";
import {
  type GameDetailRecord,
  type GameSummaryRecord,
  involvedCompanySchema,
  refSchema,
  releaseDateSchema,
  videoSchema,
} from "./schemas";
import type {
  Game,
  GameRef,
  GameReleaseDate,
  GameSummary,
  GameType,
  GameVideo,
  PlatformRelease,
} from "./types";

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
  return id === null ? null : artImageUrl(id);
}

/**
 * A game page's screenshots (spec 0031, AC-6): deduplicated by `image_id`,
 * ordered by it ascending, then capped at 12, each built at `t_1080p`. The
 * order is stable rather than hand picked, the rule `artUrl` follows.
 */
export function screenshotUrls(images: ImageList): string[] {
  const unique = new Set<string>();
  for (const image of images ?? []) {
    const id = image?.image_id?.trim();
    if (id) unique.add(id);
  }
  return [...unique]
    .sort(compareStrings)
    .slice(0, IGDB_MAX_SCREENSHOTS)
    .map(artImageUrl);
}

/**
 * One wide image at `t_1080p`, the ceiling the loader steps down from, so the
 * backdrop and the screenshots can never drift to different sizes.
 */
function artImageUrl(imageId: string): string {
  return `${IGDB_IMAGE_BASE}/${IGDB_ART_SIZE}/${imageId}.jpg`;
}

/**
 * Plain code unit order, not `localeCompare`: the screenshot ids and the
 * release date tie break must sort the same on every server, whatever its ICU.
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

/** A YouTube id the embed URL can carry safely (spec 0031, AC-4). */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * The one trailer a game page offers (spec 0031, AC-4): among the videos
 * whose name says `trailer` and not `gameplay` (in any case) and whose id is
 * a safe YouTube id, the one with the lowest IGDB id, since IGDB promises no
 * array order. A gameplay trailer is left out on purpose: it shows play, not
 * the game's pitch. With none left there is no trailer.
 */
export function pickGameTrailer(
  values: readonly unknown[] | null | undefined,
): GameVideo | null {
  let chosen: { id: number; key: string; name: string } | null = null;
  for (const value of values ?? []) {
    const parsed = videoSchema.safeParse(value);
    if (!parsed.success) continue;
    const name = parsed.data.name?.trim() ?? "";
    const lower = name.toLowerCase();
    if (!lower.includes("trailer") || lower.includes("gameplay")) continue;
    const key = parsed.data.video_id.trim();
    if (!YOUTUBE_ID.test(key)) continue;
    if (chosen === null || parsed.data.id < chosen.id) {
      chosen = { id: parsed.data.id, key, name };
    }
  }
  return chosen === null ? null : { key: chosen.key, name: chosen.name };
}

/**
 * The companies in one role, in IGDB's `involved_companies` order (spec
 * 0031, AC-5), deduplicated by company id, else by name ignoring case. A
 * company with no name is dropped; one flagged both ways is in both lists.
 */
export function companyNames(
  values: readonly unknown[] | null | undefined,
  role: "developer" | "publisher",
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values ?? []) {
    const parsed = involvedCompanySchema.safeParse(value);
    if (!parsed.success || parsed.data[role] !== true) continue;
    const name = parsed.data.company.name?.trim();
    if (!name) continue;
    const id = parsed.data.company.id;
    const key =
      typeof id === "number" ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** `GameRef`s deduplicated by id, the first entry winning (AC-9). */
function uniqueRefs(values: GameRef[]): GameRef[] {
  const seen = new Set<number>();
  return values.filter((ref) => {
    if (seen.has(ref.id)) return false;
    seen.add(ref.id);
    return true;
  });
}

/** `similar_games` in IGDB's order, deduplicated, without the game itself. */
function similarIds(
  values: readonly unknown[] | null | undefined,
  gameId: number,
): number[] {
  return [...new Set(ids(values))].filter((id) => id !== gameId);
}

type DatedRelease = { timestamp: number; release: GameReleaseDate };

type DateFormat = (typeof IGDB_DATE_FORMAT)[keyof typeof IGDB_DATE_FORMAT];

/** IGDB's quarter formats as the quarter they name (AC-10). */
const QUARTER = { q1: 1, q2: 2, q3: 3, q4: 4 } as const;

/** The format an id names, or undefined for an id IGDB may add later. */
function dateFormat(formatId: number): DateFormat | undefined {
  return Object.hasOwn(IGDB_DATE_FORMAT, formatId)
    ? IGDB_DATE_FORMAT[formatId as keyof typeof IGDB_DATE_FORMAT]
    : undefined;
}

/**
 * One release date entry at IGDB's stated precision, or null when it cannot
 * be read (spec 0031, AC-10). An unknown or missing `date_format` drops the
 * entry rather than reading it as a full day; TBD is undated even with a
 * placeholder `date`. The year and month come from the UTC timestamp, the
 * quarter from `date_format`.
 */
function readRelease(
  formatId: number | null | undefined,
  date: number | null | undefined,
): DatedRelease | "tba" | null {
  if (formatId === null || formatId === undefined) return null;
  const format = dateFormat(formatId);
  if (format === undefined) return null;
  if (format === "tbd") return "tba";
  const { releaseDate, releaseYear } = releaseDay(date);
  if (
    releaseDate === null ||
    releaseYear === null ||
    typeof date !== "number"
  ) {
    return null;
  }
  if (format === "day" || format === "month" || format === "year") {
    return {
      timestamp: date,
      release: { precision: format, date: releaseDate },
    };
  }
  return {
    timestamp: date,
    release: {
      precision: "quarter",
      year: releaseYear,
      quarter: QUARTER[format],
    },
  };
}

/**
 * The earliest release per platform (spec 0031, AC-10), grouped by platform
 * id across every region. A platform with only TBD entries reads TBA, one
 * with no usable entry is left out. Sorted by timestamp, TBA last, ties by
 * platform name ignoring case.
 */
export function platformReleases(
  values: readonly unknown[] | null | undefined,
): PlatformRelease[] {
  const byPlatform = new Map<
    number,
    { platform: string; dated: DatedRelease | null; tba: boolean }
  >();
  for (const value of values ?? []) {
    const parsed = releaseDateSchema.safeParse(value);
    if (!parsed.success) continue;
    const platform = parsed.data.platform;
    const name = platform?.name?.trim();
    if (!platform || !name) continue;
    const read = readRelease(parsed.data.date_format, parsed.data.date);
    if (read === null) continue;
    const entry = byPlatform.get(platform.id) ?? {
      platform: name,
      dated: null,
      tba: false,
    };
    if (read === "tba") entry.tba = true;
    else if (entry.dated === null || read.timestamp < entry.dated.timestamp) {
      entry.dated = read;
    }
    byPlatform.set(platform.id, entry);
  }

  return [...byPlatform.values()]
    .map((entry) => ({
      platform: entry.platform,
      timestamp: entry.dated?.timestamp ?? Number.POSITIVE_INFINITY,
      release: entry.dated?.release ?? ({ precision: "tba" } as const),
    }))
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp < b.timestamp ? -1 : 1;
      }
      return compareStrings(a.platform.toLowerCase(), b.platform.toLowerCase());
    })
    .map(({ platform, release }) => ({ platform, release }));
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
    storyline: textOrNull(record.storyline),
    // From the full lists, never the capped 12 (spec 0031, AC-3).
    artUrl: artUrl(record),
    screenshotUrls: screenshotUrls(record.screenshots),
    trailer: pickGameTrailer(record.videos),
    similarGameIds: similarIds(record.similar_games, record.id),
    developers: companyNames(record.involved_companies, "developer"),
    publishers: companyNames(record.involved_companies, "publisher"),
    gameModes: refs(record.game_modes),
    playerPerspectives: refs(record.player_perspectives),
    franchises: uniqueRefs([
      ...refs(record.franchise === undefined ? [] : [record.franchise]),
      ...refs(record.franchises),
    ]),
    series: refs(record.collections),
    gameEngines: refs(record.game_engines),
    platformReleases: platformReleases(record.release_dates),
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
