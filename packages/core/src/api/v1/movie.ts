import { z } from "zod";

import { movieIdSchema, ratingSchema } from "../../tracking/schemas";
import type { MovieTrackingError } from "../../tracking/types";
import type { V1ErrorCode } from "./errors";

/**
 * The movie contracts of `/api/v1` (spec 0033, child 0035, API surface): the
 * public detail read and the watched write. The app parses every response
 * with these, and each route's test does too, so the two cannot drift.
 */

/** A path segment holding a movie id, as the route receives it. */
export const movieIdParamSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(movieIdSchema);

const genreSchema = z.object({ id: z.number(), name: z.string() });

const castMemberSchema = z.object({
  personId: z.number(),
  creditId: z.string(),
  name: z.string(),
  character: z.string(),
  profileUrl: z.string().nullable(),
  order: z.number(),
});

/**
 * `GET /api/v1/movies/{id}`: the catalog fields the app's movie screen shows.
 * Image fields are absolute TMDB CDN URLs at the web's sizes, which carry no
 * secret and need no proxy. `tmdbRating` is TMDB's community score, never the
 * user's own (AGENTS.md section 9).
 */
export const v1MovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  originalTitle: z.string(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().nullable(),
  runtimeMinutes: z.number().nullable(),
  status: z.string().nullable(),
  genres: z.array(genreSchema),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  tmdbRating: z.number().nullable(),
  tmdbVoteCount: z.number(),
  directors: z.array(z.string()),
  cast: z.array(castMemberSchema),
});

export type V1Movie = z.infer<typeof v1MovieSchema>;

/** `PUT /api/v1/me/movies/{id}/watched` body. */
export const v1WatchedBodySchema = z.object({ watched: z.boolean() });

const movieClearedSchema = z.object({
  watchedAt: z.string(),
  rating: ratingSchema.nullable(),
});

/** A successful movie write: the `ok` half of `MovieTrackingResult`. */
export const v1MovieWriteOkSchema = z.object({
  ok: z.literal(true),
  cleared: movieClearedSchema.optional(),
});

/**
 * How a refused movie write answers over HTTP. The action's own reason rides
 * along as `reason`, so the app gets back exactly the `MovieTrackingResult`
 * the web's Server Action returns for the same input (spec 0033, AC-5).
 */
export const MOVIE_ERROR_TO_V1: Record<MovieTrackingError, V1ErrorCode> = {
  invalid_input: "invalid_input",
  session_expired: "unauthenticated",
  not_found: "not_found",
  tmdb_unavailable: "catalog_unavailable",
  write_failed: "internal",
  not_released: "not_released",
  not_watched: "conflict",
  undo_expired: "conflict",
};

const movieErrorSchema = z.enum(
  Object.keys(MOVIE_ERROR_TO_V1) as [
    MovieTrackingError,
    ...MovieTrackingError[],
  ],
);

/**
 * Reads a refused write's `reason` back into the action's error, if known.
 * The app branches on a closed error word, never on message text, so an
 * unknown reason from a newer server reads as null rather than being trusted
 * (AGENTS.md section 11). The Undo routes of build step 4 rely on it.
 */
export function movieErrorFromReason(
  reason: unknown,
): MovieTrackingError | null {
  const parsed = movieErrorSchema.safeParse(reason);
  return parsed.success ? parsed.data : null;
}
