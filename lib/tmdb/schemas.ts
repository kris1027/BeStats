import { z } from "zod";

/**
 * Zod schemas for the TMDB fields this app actually reads.
 *
 * Two rules govern every schema here (spec 0002, AC-8 and AC-9):
 *
 * 1. **Nothing is `.strict()`.** TMDB adds keys freely and an unknown key must
 *    never fail a read, so unknown keys are stripped instead.
 * 2. **Required means "the page is wrong without it".** A missing required top
 *    level field raises `bad_response`; everything the UI can render an honest
 *    "not available" for is nullable.
 */

/** TMDB sends absent strings as `null` and absent numbers inconsistently. */
const nullableString = z.string().nullish();
const nullableNumber = z.number().nullish();

export const genreSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const genreListSchema = z.object({
  genres: z.array(genreSchema),
});

/**
 * One credit. Parsed per item rather than as part of the movie schema, because
 * a single malformed credit must drop that credit and not blank the whole page
 * (spec 0002, AC-9).
 */
export const castMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  character: z.string().nullish(),
  profile_path: nullableString,
  order: z.number().nullish(),
});

/** Credits arrive as unknown items so one bad credit can be dropped by hand. */
const creditsSchema = z
  .object({
    cast: z.array(z.unknown()).nullish(),
  })
  .nullish();

export const movieSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  poster_path: nullableString,
  release_date: nullableString,
  overview: nullableString,
  vote_average: nullableNumber,
  vote_count: nullableNumber,
});

export const movieSchema = movieSummarySchema.extend({
  backdrop_path: nullableString,
  original_title: z.string(),
  original_language: z.string(),
  tagline: nullableString,
  runtime: nullableNumber,
  genres: z.array(genreSchema).nullish(),
  credits: creditsSchema,
});

export const tvSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  poster_path: nullableString,
  first_air_date: nullableString,
  overview: nullableString,
  vote_average: nullableNumber,
  vote_count: nullableNumber,
});

export const seasonSummarySchema = z.object({
  season_number: z.number(),
  name: z.string().nullish(),
  episode_count: z.number().nullish(),
  air_date: nullableString,
  poster_path: nullableString,
});

export const tvShowSchema = tvSummarySchema.extend({
  backdrop_path: nullableString,
  status: z.string().nullish(),
  in_production: z.boolean().nullish(),
  last_air_date: nullableString,
  number_of_seasons: nullableNumber,
  number_of_episodes: nullableNumber,
  genres: z.array(genreSchema).nullish(),
  credits: creditsSchema,
  seasons: z.array(seasonSummarySchema).nullish(),
});

/**
 * An episode's three identity fields are required and everything else is
 * nullable, including `name`. A dropped episode would silently change the
 * progress counts scope features 14 to 16 derive, so an episode missing an
 * identity field fails the whole season read instead (spec 0002, AC-9).
 */
export const episodeSchema = z.object({
  id: z.number(),
  season_number: z.number(),
  episode_number: z.number(),
  name: nullableString,
  overview: nullableString,
  air_date: nullableString,
  still_path: nullableString,
  runtime: nullableNumber,
  vote_average: nullableNumber,
});

export const seasonDetailSchema = z.object({
  season_number: z.number(),
  name: z.string().nullish(),
  overview: nullableString,
  air_date: nullableString,
  poster_path: nullableString,
  episodes: z.array(episodeSchema),
});

/**
 * TMDB's pagination envelope. `page`, `total_pages` and `total_results` are
 * returned to callers unchanged and never recomputed (spec 0002, AC-18).
 */
export function pagedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    page: z.number(),
    results: z.array(item),
    total_pages: z.number(),
    total_results: z.number(),
  });
}

export type RawMovie = z.infer<typeof movieSchema>;
export type RawMovieSummary = z.infer<typeof movieSummarySchema>;
export type RawTvShow = z.infer<typeof tvShowSchema>;
export type RawTvSummary = z.infer<typeof tvSummarySchema>;
export type RawSeasonSummary = z.infer<typeof seasonSummarySchema>;
export type RawSeasonDetail = z.infer<typeof seasonDetailSchema>;
export type RawEpisode = z.infer<typeof episodeSchema>;
