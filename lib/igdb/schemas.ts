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
 */

/** Every IGDB read answers with a JSON array. */
export const recordsSchema = z.array(z.unknown());

/** A platform, genre or theme. A nameless one is dropped by `normalize.ts`. */
export const refSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
});

const optionalNumber = z.number().nullish();
const optionalId = z.number().int().nullish();

/** An array that may hold anything; `normalize.ts` keeps the valid entries. */
const looseArray = z.array(z.unknown()).nullish();

const coverSchema = z
  .object({ image_id: z.string().nullish() })
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
  version_parent: optionalId,
});

/** `getGame`: platforms, genres and themes expanded to `{ id, name }`. */
export const gameDetailSchema = baseGameSchema.extend({
  slug: z.string().nullish(),
  summary: z.string().nullish(),
  platforms: looseArray,
  genres: looseArray,
  themes: looseArray,
});

/** Batch, search and discover: platforms, genres and themes as ids. */
export const gameSummarySchema = baseGameSchema.extend({
  platforms: looseArray,
  genres: looseArray,
  themes: looseArray,
});

export type GameDetailRecord = z.infer<typeof gameDetailSchema>;
export type GameSummaryRecord = z.infer<typeof gameSummarySchema>;
