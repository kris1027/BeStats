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
  credit_id: z.string().nullish(),
  name: z.string(),
  character: z.string().nullish(),
  profile_path: nullableString,
  order: z.number().nullish(),
});

/**
 * One crew credit, read for a movie's directors and writers (spec 0022,
 * AC-15). Parsed per item like a cast credit.
 */
export const crewMemberSchema = z.object({
  name: z.string(),
  job: z.string().nullish(),
});

/**
 * A production company or a network (spec 0022, AC-16). Parsed per item, so
 * one malformed entry drops that entry rather than the title.
 */
export const companySchema = z.object({
  id: z.number(),
  name: z.string(),
  logo_path: nullableString,
});

/**
 * A show creator from `created_by` (spec 0022, AC-15). Parsed per item.
 */
export const creatorSchema = z.object({
  name: z.string(),
});

/** Credits arrive as unknown items so one bad credit can be dropped by hand. */
const creditsSchema = z
  .object({
    cast: z.array(z.unknown()).nullish(),
    crew: z.array(z.unknown()).nullish(),
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
  genre_ids: z.array(z.number()).nullish(),
  backdrop_path: nullableString,
});

/**
 * One translation. Parsed per item, like a credit, so one malformed language
 * entry drops that entry rather than failing the whole movie (spec 0006).
 */
export const translationSchema = z.object({
  iso_639_1: z.string(),
  data: z
    .object({
      overview: nullableString,
    })
    .nullish(),
});

/** Translations arrive as unknown items so one bad entry can be dropped. */
const translationsSchema = z
  .object({
    translations: z.array(z.unknown()).nullish(),
  })
  .nullish();

export const movieSchema = movieSummarySchema.extend({
  adult: z.boolean().nullish(),
  original_title: z.string(),
  original_language: z.string(),
  tagline: nullableString,
  runtime: nullableNumber,
  genres: z.array(genreSchema).nullish(),
  credits: creditsSchema,
  translations: translationsSchema,
  status: nullableString,
  budget: nullableNumber,
  revenue: nullableNumber,
  production_companies: z.array(z.unknown()).nullish(),
});

export const tvSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  poster_path: nullableString,
  first_air_date: nullableString,
  overview: nullableString,
  vote_average: nullableNumber,
  vote_count: nullableNumber,
  genre_ids: z.array(z.number()).nullish(),
  backdrop_path: nullableString,
});

/**
 * A result of one of TMDB's list endpoints (trending, now playing, top rated
 * and so on). The summary plus `adult`, because unlike discover these
 * endpoints take no `include_adult` and the module drops adult titles itself
 * (spec 0021, AC-8).
 */
export const movieListItemSchema = movieSummarySchema.extend({
  adult: z.boolean().nullish(),
});

/** The TV twin of `movieListItemSchema` (spec 0021, AC-8). */
export const tvListItemSchema = tvSummarySchema.extend({
  adult: z.boolean().nullish(),
});

export const seasonSummarySchema = z.object({
  season_number: z.number(),
  name: z.string().nullish(),
  episode_count: z.number().nullish(),
  air_date: nullableString,
  poster_path: nullableString,
});

export const tvShowSchema = tvSummarySchema.extend({
  adult: z.boolean().nullish(),
  original_language: z.string(),
  tagline: nullableString,
  status: z.string().nullish(),
  in_production: z.boolean().nullish(),
  last_air_date: nullableString,
  number_of_seasons: nullableNumber,
  number_of_episodes: nullableNumber,
  genres: z.array(genreSchema).nullish(),
  translations: translationsSchema,
  seasons: z.array(seasonSummarySchema).nullish(),
  type: nullableString,
  created_by: z.array(z.unknown()).nullish(),
  networks: z.array(z.unknown()).nullish(),
  production_companies: z.array(z.unknown()).nullish(),
  /**
   * Left unparsed here and checked one by one in the normalizer, so a
   * malformed value is read as null rather than failing the whole show
   * (spec 0020, AC-7).
   */
  last_episode_to_air: z.unknown().optional(),
  next_episode_to_air: z.unknown().optional(),
});

/**
 * `last_episode_to_air` and `next_episode_to_air` on `/tv/{id}`. Only the
 * three fields library classification reads (spec 0020, AC-7).
 */
export const episodeToAirSchema = z.object({
  season_number: z.number().int().min(0),
  episode_number: z.number().int().min(1),
  air_date: nullableString,
});

/**
 * One person in a show's aggregate credits, with every role they played.
 * Parsed per item, like a movie credit, so one malformed person is dropped
 * rather than failing the whole cast (spec 0009, AC-8).
 */
export const aggregateCastMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  profile_path: nullableString,
  total_episode_count: z.number().nullish(),
  order: z.number().nullish(),
  roles: z.array(
    z.object({
      credit_id: z.string(),
      character: z.string().nullish(),
      episode_count: z.number().nullish(),
    }),
  ),
});

/** `/tv/{id}/aggregate_credits`, its people left unparsed until one by one. */
export const aggregateCreditsSchema = z.object({
  cast: z.array(z.unknown()).nullish(),
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
 * One video from the appended `videos` (spec 0022, AC-11). Parsed per item,
 * so one malformed video is dropped rather than the extras.
 */
export const videoSchema = z.object({
  site: z.string(),
  type: z.string(),
  key: z.string(),
  name: nullableString,
  official: z.boolean().nullish(),
  published_at: nullableString,
});

/** One watch provider in a region's group (spec 0022, AC-12). */
export const watchProviderSchema = z.object({
  provider_id: z.number(),
  provider_name: z.string(),
  logo_path: nullableString,
  display_priority: nullableNumber,
});

/**
 * One region's entry in `watch/providers.results`. The groups stay unknown
 * items so one malformed provider is dropped by hand.
 */
export const regionProvidersSchema = z.object({
  link: nullableString,
  flatrate: z.array(z.unknown()).nullish(),
  free: z.array(z.unknown()).nullish(),
  ads: z.array(z.unknown()).nullish(),
  rent: z.array(z.unknown()).nullish(),
  buy: z.array(z.unknown()).nullish(),
});

/** One country of a movie's `release_dates` (spec 0022, AC-13). */
export const releaseDatesCountrySchema = z.object({
  iso_3166_1: z.string(),
  release_dates: z.array(
    z.object({
      certification: nullableString,
      type: nullableNumber,
    }),
  ),
});

/** One country of a show's `content_ratings` (spec 0022, AC-13). */
export const contentRatingSchema = z.object({
  iso_3166_1: z.string(),
  rating: nullableString,
});

/**
 * The appended keys both extras reads share. Every list is unknown items,
 * checked one by one in the normalizer, so a malformed video, provider,
 * country or recommendation drops that entry and never the whole read; a
 * missing key reads as empty.
 */
const extrasSchema = z.object({
  videos: z.object({ results: z.array(z.unknown()).nullish() }).nullish(),
  recommendations: z
    .object({
      page: nullableNumber,
      results: z.array(z.unknown()).nullish(),
      total_pages: nullableNumber,
      total_results: nullableNumber,
    })
    .nullish(),
  "watch/providers": z
    .object({ results: z.record(z.string(), z.unknown()).nullish() })
    .nullish(),
});

/**
 * `/movie/{id}` with the extras appended (spec 0022, AC-8). Only the
 * appended keys are read: the details in the same response are ignored, and
 * the page takes them from `getMovie` (AC-16).
 */
export const movieExtrasSchema = extrasSchema.extend({
  release_dates: z
    .object({ results: z.array(z.unknown()).nullish() })
    .nullish(),
});

/** The show twin of `movieExtrasSchema`, with `content_ratings`. */
export const tvExtrasSchema = extrasSchema.extend({
  content_ratings: z
    .object({ results: z.array(z.unknown()).nullish() })
    .nullish(),
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
export type RawAggregateCredits = z.infer<typeof aggregateCreditsSchema>;
export type RawTvSummary = z.infer<typeof tvSummarySchema>;
export type RawSeasonSummary = z.infer<typeof seasonSummarySchema>;
export type RawSeasonDetail = z.infer<typeof seasonDetailSchema>;
export type RawEpisode = z.infer<typeof episodeSchema>;
export type RawMovieExtras = z.infer<typeof movieExtrasSchema>;
export type RawTvExtras = z.infer<typeof tvExtrasSchema>;
