import { z } from "zod";

import { v1CatalogItemSchema } from "./browse";

/**
 * The title extras contracts of `/api/v1` (prompts/mobile-look-title-extras.md):
 * a movie's or show's trailer, age rating, Where to watch and More like this,
 * and a game's similar games as cards. The app parses every answer with
 * these, and each route's test does too, so the two cannot drift.
 */

/** The most recommendations or similar games a title shows, as the web's row. */
export const V1_MORE_LIKE_THIS_LIMIT = 12;

const providerSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** TMDB's `w92` logo, or null when it has none, so the name shows. */
  logoUrl: z.string().nullable(),
});

export type V1Provider = z.infer<typeof providerSchema>;

/**
 * `GET /api/v1/movies/{id}/extras` and `/shows/{id}/extras`. Everything that
 * depends on a country is already picked for the connection's country, which
 * `region` names (decision 1), so the answer is `private`: it never reaches a
 * shared cache. `ageRating` is null and `watch` is null when TMDB has nothing
 * for that country. `trailer.key` is checked again with `youtubeWatchUrl`
 * before any link is built.
 */
export const v1TitleExtrasSchema = z.object({
  region: z.object({ code: z.string(), name: z.string() }),
  trailer: z.object({ key: z.string(), name: z.string() }).nullable(),
  ageRating: z.string().nullable(),
  watch: z
    .object({
      link: z.string().nullable(),
      stream: z.array(providerSchema),
      free: z.array(providerSchema),
      rentOrBuy: z.array(providerSchema),
    })
    .nullable(),
  recommendations: z.array(v1CatalogItemSchema).max(V1_MORE_LIKE_THIS_LIMIT),
});

export type V1TitleExtras = z.infer<typeof v1TitleExtrasSchema>;

/**
 * `GET /api/v1/games/{id}/similar`: IGDB's similar games as cards, in the
 * game's own order, hidden and missing games dropped before the cap, as the
 * web's game page (spec 0031, AC-8).
 */
export const v1SimilarGamesSchema = z.object({
  results: z.array(v1CatalogItemSchema).max(V1_MORE_LIKE_THIS_LIMIT),
});

export type V1SimilarGames = z.infer<typeof v1SimilarGamesSchema>;
