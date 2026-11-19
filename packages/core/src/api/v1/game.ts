import { z } from "zod";

import {
  gameIdSchema,
  gameStatusSchema,
  ratingSchema,
} from "../../tracking/schemas";
import type { GameTrackingError } from "../../tracking/types";
import type { V1ErrorCode } from "./errors";

/**
 * The game contracts of `/api/v1` (spec 0035, API surface): the public game
 * read and the caller's status, score and removal writes. Every field is one
 * the shared `Game` type already carries for the web's game page (no new
 * IGDB field, no invented data); image fields are full IGDB CDN URLs or null
 * (spec 0035, Images), and `communityRating` is IGDB's, never the user's
 * (AGENTS.md section 9).
 */

/** A path segment holding an IGDB game id, within `parseGameId`'s bounds. */
export const gameIdParamSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(gameIdSchema);

const gameRefSchema = z.object({ id: z.number(), name: z.string() });

const gameReleaseDateSchema = z.discriminatedUnion("precision", [
  z.object({
    precision: z.enum(["day", "month", "year"]),
    date: z.string(),
  }),
  z.object({
    precision: z.literal("quarter"),
    year: z.number(),
    quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ precision: z.literal("tba") }),
]);

/**
 * `GET /api/v1/games/{id}`: what the app's game screen shows. `releaseDate`
 * is IGDB's first release as a UTC day, the date the server's release gate
 * reads too (AGENTS.md section 7). `hidden` is left out: the route answers
 * 404 for a hidden game, as the web page does.
 */
export const v1GameSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullable(),
  coverUrl: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().nullable(),
  platforms: z.array(gameRefSchema),
  genres: z.array(gameRefSchema),
  themes: z.array(gameRefSchema),
  summary: z.string().nullable(),
  gameType: z
    .enum([
      "main_game",
      "standalone_expansion",
      "remake",
      "remaster",
      "expanded_game",
      "other",
    ])
    .nullable(),
  communityRating: z.number().nullable(),
  communityRatingCount: z.number().nullable(),
  storyline: z.string().nullable(),
  artUrl: z.string().nullable(),
  screenshotUrls: z.array(z.string()),
  trailer: z.object({ key: z.string(), name: z.string() }).nullable(),
  similarGameIds: z.array(z.number()),
  developers: z.array(z.string()),
  publishers: z.array(z.string()),
  gameModes: z.array(gameRefSchema),
  playerPerspectives: z.array(gameRefSchema),
  franchises: z.array(gameRefSchema),
  series: z.array(gameRefSchema),
  gameEngines: z.array(gameRefSchema),
  platformReleases: z.array(
    z.object({
      platformId: z.number(),
      platform: z.string(),
      release: gameReleaseDateSchema,
    }),
  ),
});

export type V1Game = z.infer<typeof v1GameSchema>;

/**
 * `PUT /api/v1/me/games/{id}` body: a status or a score, one per request, so
 * each maps to exactly one command (`setGameStatus` or `setGameRating`, spec
 * 0035, Mapping to actions). The spec lists both as optional; exactly one is
 * required because the two do not commute: a move to Want to play clears the
 * score, so a body carrying both would have no single honest result.
 *
 * Both members are strict, as the episode body is: a plain object would
 * strip the second key and answer 200 for a change it dropped, a false
 * success (AGENTS.md section 11).
 */
export const v1GameBodySchema = z.union([
  z.strictObject({ status: gameStatusSchema }),
  z.strictObject({ rating: ratingSchema.nullable() }),
]);

const restoreStateSchema = z.object({
  status: gameStatusSchema,
  rating: ratingSchema.nullable(),
  addedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

/**
 * A successful game write: the `ok` half of `GameTrackingResult`. `undo` is
 * there only when a move to Want to play cleared a score (`status`) or a
 * removal took a row away (`removed`); the app turns it into the
 * `game_status` or `game_removed` cleared state for the restore route.
 */
export const v1GameWriteOkSchema = z.object({
  ok: z.literal(true),
  undo: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("status"), previous: restoreStateSchema }),
      z.object({
        kind: z.literal("removed"),
        previous: restoreStateSchema,
        removedAt: z.string(),
      }),
    ])
    .optional(),
});

/**
 * How a refused game write answers over HTTP. The action's own reason rides
 * along as `reason`, so the app gets back exactly the `GameTrackingResult`
 * the web's Server Action returns (spec 0033, AC-5). A forward move or a
 * score before release is 409 `not_released` (AC-6); a score on a game not
 * yet started is the database refusing it, so `conflict`.
 */
export const GAME_ERROR_TO_V1: Record<GameTrackingError, V1ErrorCode> = {
  invalid_input: "invalid_input",
  session_expired: "unauthenticated",
  not_found: "not_found",
  igdb_unavailable: "catalog_unavailable",
  write_failed: "internal",
  not_released: "not_released",
  not_started: "conflict",
  undo_expired: "conflict",
};
