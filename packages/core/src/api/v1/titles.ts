import { z } from "zod";

import { movieIdSchema, ratingSchema } from "../../tracking/schemas";

/**
 * `GET /api/v1/me/titles` (spec 0033, child 0035): the caller's own state for
 * a batch of titles, keyed `movie:603`. The tracer ships movie keys only; show
 * and game keys arrive with step 4 and answer 400 until then.
 */

/** The most keys one request may ask for. */
export const MAX_TITLE_KEYS = 40;

/** A title key, `movie:<id>`. */
export const titleKeySchema = z
  .string()
  .regex(/^movie:\d+$/)
  .transform((key) => Number(key.slice("movie:".length)))
  .pipe(movieIdSchema);

/** The `ids` query value: comma separated keys, 1 to `MAX_TITLE_KEYS`. */
export const titleIdsParamSchema = z
  .string()
  .transform((value) => [...new Set(value.split(","))])
  .pipe(z.array(titleKeySchema).min(1).max(MAX_TITLE_KEYS));

/** One movie's stored state; no row reads as the empty state. */
export const v1MovieTitleStateSchema = z.object({
  planned: z.boolean(),
  watchedAt: z.string().nullable(),
  rating: ratingSchema.nullable(),
});

export type V1MovieTitleState = z.infer<typeof v1MovieTitleStateSchema>;

/** The whole response: every requested key, present even when empty. */
export const v1TitlesSchema = z.record(z.string(), v1MovieTitleStateSchema);

export type V1Titles = z.infer<typeof v1TitlesSchema>;

/** The state of a movie the user never touched. */
export const EMPTY_V1_MOVIE_TITLE_STATE: V1MovieTitleState = {
  planned: false,
  watchedAt: null,
  rating: null,
};

/**
 * The key a movie id is listed under. A title is its media type plus its
 * external id, because a TMDB movie and show can share a number, so the key
 * always carries the type (AGENTS.md section 8, Catalog identity).
 */
export function movieTitleKey(id: number): string {
  return `movie:${id}`;
}
