import "server-only";
import { z } from "zod";

/**
 * Zod schemas for the IGDB fields the app reads, and nothing more (spec 0023,
 * AC-16). None is `.strict()`: IGDB adds keys freely and an unknown key must
 * never fail a read.
 *
 * A response is an array, checked loosely here (`z.array(z.unknown())`), and
 * each record is parsed on its own, so one malformed game in a list is dropped
 * instead of failing the whole page. In `getGame` the one record is required.
 * "Malformed" means a missing or invalid `id` or `name`, nothing else.
 */

/** Every IGDB read answers with a JSON array. */
export const recordsSchema = z.array(z.unknown());

/** A platform, genre or theme. A nameless one is dropped by `normalize.ts`. */
export const refSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
});

/*
 * Only `id` and `name` may fail a record (AC-11, AC-16). Every other field
 * falls back to null when IGDB sends it in a shape this module does not
 * expect, so a game with a valid id and name is never dropped from a batch
 * (where it would read as missing) or refused by `getGame` over one odd field.
 */
const optionalNumber = z.number().nullish().catch(null);
const optionalId = z.number().int().nullish().catch(null);
const optionalText = z.string().nullish().catch(null);

/**
 * A present `version_parent` of any shape still marks an edition, so the game
 * stays hidden rather than turning visible. IGDB ids are positive, so 0 stands
 * for a parent this module could not read.
 */
const versionParent = z.number().int().nullish().catch(0);

/** An array that may hold anything; `normalize.ts` keeps the valid entries. */
const looseArray = z.array(z.unknown()).nullish().catch(null);

const coverSchema = z
  .object({ image_id: z.string().nullish() })
  .nullish()
  .catch(null);

/**
 * Artworks or screenshots, each `{ image_id }`. An entry of another shape is
 * dropped, and an absent or odd list reads as none (spec 0028, AC-6).
 */
export const imageListSchema = z
  .array(z.object({ image_id: z.string().nullish() }).nullish().catch(null))
  .nullish()
  .catch(null);

/** The fields every game record shares. `id` and `name` are required. */
const baseGameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  cover: coverSchema,
  first_release_date: optionalNumber,
  rating: optionalNumber,
  rating_count: optionalNumber,
  game_type: optionalId,
  version_parent: versionParent,
});

/**
 * `getGame`: platforms, genres and themes expanded to `{ id, name }`, plus
 * the richer page's fields (spec 0031, AC-2). Every new list is loose, and
 * `normalize.ts` checks each entry on its own, so one odd video, company or
 * release date is dropped instead of failing the read. `franchise` is one
 * reference, so it is loose too, and checked as a `GameRef`.
 */
export const gameDetailSchema = baseGameSchema.extend({
  slug: optionalText,
  summary: optionalText,
  storyline: optionalText,
  platforms: looseArray,
  genres: looseArray,
  themes: looseArray,
  artworks: imageListSchema,
  screenshots: imageListSchema,
  videos: looseArray,
  similar_games: looseArray,
  involved_companies: looseArray,
  game_modes: looseArray,
  player_perspectives: looseArray,
  franchise: z.unknown().optional(),
  franchises: looseArray,
  collections: looseArray,
  game_engines: looseArray,
  release_dates: looseArray,
});

/** One of `videos`: a YouTube id and IGDB's name for it (AC-4). */
export const videoSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().nullish(),
  video_id: z.string(),
});

/**
 * One of `involved_companies` (AC-5). A company with no name is dropped by
 * `normalize.ts`; the flags read false when absent.
 */
export const involvedCompanySchema = z.object({
  company: z.object({
    id: z.number().int().positive().nullish(),
    name: z.string().nullish(),
  }),
  developer: z.boolean().nullish(),
  publisher: z.boolean().nullish(),
});

/**
 * One of `release_dates` (AC-10). `date_format` reads as a bare id or an
 * expanded `{ id }`, and `optionalId` turns an odd one into null, which drops
 * the entry.
 */
export const releaseDateSchema = z.object({
  date: optionalNumber,
  date_format: z
    .union([z.number().int(), z.object({ id: z.number().int() })])
    .nullish()
    .catch(null)
    .transform((value) =>
      typeof value === "object" && value !== null ? value.id : value,
    ),
  platform: z
    .object({ id: z.number().int().positive(), name: z.string().nullish() })
    .nullish()
    .catch(null),
});

/**
 * Batch, search and discover: platforms, genres and themes as ids, plus the
 * art a wide card shows.
 */
export const gameSummarySchema = baseGameSchema.extend({
  platforms: looseArray,
  genres: looseArray,
  themes: looseArray,
  artworks: imageListSchema,
  screenshots: imageListSchema,
});

export type GameDetailRecord = z.infer<typeof gameDetailSchema>;
export type GameSummaryRecord = z.infer<typeof gameSummarySchema>;

/**
 * One `popularity_primitives` row: only the game id is read, since the rows
 * already come in rank order. A row without a positive id is dropped.
 */
export const popularityPrimitiveSchema = z.object({
  game_id: z.number().int().positive(),
});
