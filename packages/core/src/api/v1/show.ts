import { z } from "zod";

import {
  episodeIdListSchema,
  ratingSchema,
  seasonNumberSchema,
  tmdbIdSchema,
} from "../../tracking/schemas";
import type {
  EpisodeTrackingError,
  ShowTrackingError,
} from "../../tracking/types";
import type { V1ErrorCode } from "./errors";

/**
 * The show contracts of `/api/v1` (spec 0035, API surface): the public show
 * and season reads, the caller's season state, and the episode, season and
 * tracking write bodies. Every field is one the shared normalized types
 * already carry for the web pages; image fields are full CDN URLs or null
 * (spec 0035, Images), and `tmdbRating` is TMDB's community score, never the
 * user's (AGENTS.md section 9).
 */

const idParam = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number);

/** A path segment holding a TMDB show or episode id. */
export const showIdParamSchema = idParam.pipe(tmdbIdSchema);

/** A path segment holding a season number; 0 is Specials. */
export const seasonNumberParamSchema = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number)
  .pipe(seasonNumberSchema);

const genreSchema = z.object({ id: z.number(), name: z.string() });

const episodeToAirSchema = z
  .object({
    seasonNumber: z.number(),
    episodeNumber: z.number(),
    airDate: z.string().nullable(),
  })
  .nullable();

const seasonSummarySchema = z.object({
  seasonNumber: z.number(),
  name: z.string(),
  episodeCount: z.number(),
  airDate: z.string().nullable(),
  posterUrl: z.string().nullable(),
  isSpecials: z.boolean(),
});

/** `GET /api/v1/shows/{id}`: what the app's show screen shows. */
export const v1ShowSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  firstAirDate: z.string().nullable(),
  firstAirYear: z.number().nullable(),
  lastAirDate: z.string().nullable(),
  status: z.string(),
  inProduction: z.boolean(),
  numberOfSeasons: z.number(),
  numberOfEpisodes: z.number(),
  genres: z.array(genreSchema),
  createdBy: z.array(z.string()),
  tmdbRating: z.number().nullable(),
  tmdbVoteCount: z.number(),
  seasons: z.array(seasonSummarySchema),
  lastEpisodeToAir: episodeToAirSchema,
  nextEpisodeToAir: episodeToAirSchema,
});

export type V1Show = z.infer<typeof v1ShowSchema>;

const episodeSchema = z.object({
  id: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  name: z.string().nullable(),
  overview: z.string().nullable(),
  airDate: z.string().nullable(),
  stillUrl: z.string().nullable(),
  runtimeMinutes: z.number().nullable(),
  tmdbRating: z.number().nullable(),
});

/**
 * `GET /api/v1/shows/{id}/seasons/{n}`: a season with its episodes and their
 * air dates (UTC days), plus the show's name for the screen header.
 */
export const v1SeasonSchema = z.object({
  show: z.object({ id: z.number(), name: z.string() }),
  seasonNumber: z.number(),
  name: z.string(),
  overview: z.string().nullable(),
  airDate: z.string().nullable(),
  posterUrl: z.string().nullable(),
  episodes: z.array(episodeSchema),
});

export type V1Season = z.infer<typeof v1SeasonSchema>;

/** `GET /api/v1/me/shows/{id}/seasons/{n}`: the caller's rows for a season. */
export const v1SeasonStateSchema = z.object({
  episodes: z.array(
    z.object({
      episodeId: z.number(),
      watchedAt: z.string().nullable(),
      rating: ratingSchema.nullable(),
    }),
  ),
});

export type V1SeasonState = z.infer<typeof v1SeasonStateSchema>;

/**
 * `PUT /api/v1/me/episodes/{episodeId}` body: a watched mark or a score, one
 * per request, so each maps to exactly one command (spec 0035, Mapping to
 * actions). The season number is checked against TMDB on the server.
 *
 * Both members are strict: a plain object would strip the extra key, so a
 * body carrying a mark and a score would match the mark, drop the score and
 * still answer 200, a false success (AGENTS.md section 11). Strict members
 * refuse it as 400 instead.
 */
export const v1EpisodeBodySchema = z.union([
  z.strictObject({
    showId: tmdbIdSchema,
    seasonNumber: seasonNumberSchema,
    watched: z.boolean(),
  }),
  z.strictObject({
    showId: tmdbIdSchema,
    seasonNumber: seasonNumberSchema,
    rating: ratingSchema.nullable(),
  }),
]);

/**
 * `PUT /api/v1/me/shows/{id}/seasons/{n}/watched` body. Marking takes its
 * episodes from TMDB on the server; unmarking names the ids the screen
 * showed, as the web's season page does (spec 0011, API surface).
 */
export const v1SeasonWatchedBodySchema = z.discriminatedUnion("watched", [
  z.object({ watched: z.literal(true) }),
  z.object({ watched: z.literal(false), episodeIds: episodeIdListSchema }),
]);

/** How a refused episode or season write answers over HTTP. */
export const EPISODE_ERROR_TO_V1: Record<EpisodeTrackingError, V1ErrorCode> = {
  invalid_input: "invalid_input",
  session_expired: "unauthenticated",
  not_found: "not_found",
  tmdb_unavailable: "catalog_unavailable",
  write_failed: "internal",
  not_aired: "not_released",
  undo_expired: "conflict",
};

/** How a refused show tracking write answers over HTTP. */
export const SHOW_ERROR_TO_V1: Record<ShowTrackingError, V1ErrorCode> = {
  invalid_input: "invalid_input",
  session_expired: "unauthenticated",
  not_found: "not_found",
  tmdb_unavailable: "catalog_unavailable",
  write_failed: "internal",
  undo_expired: "conflict",
};
