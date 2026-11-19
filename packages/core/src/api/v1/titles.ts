import { z } from "zod";

import {
  gameIdSchema,
  gameStatusSchema,
  movieIdSchema,
  ratingSchema,
  tmdbIdSchema,
} from "../../tracking/schemas";

/**
 * `GET /api/v1/me/titles` (spec 0033, child 0035): the caller's own state for
 * a batch of titles, keyed `movie:603`, `tv:1399` or `game:1942`. A title is
 * its media type plus its external id, since a TMDB movie and show can share
 * a number (AGENTS.md section 8). No catalog data rides along.
 */

/** The most keys one request may ask for. */
export const MAX_TITLE_KEYS = 40;

/** The kinds a key may name, and the one place the key format is written. */
export type TitleType = "movie" | "tv" | "game";

const ID_SCHEMAS: Record<TitleType, z.ZodType<number>> = {
  movie: movieIdSchema,
  tv: tmdbIdSchema,
  game: gameIdSchema,
};

/** One parsed key. */
export type TitleRef = { type: TitleType; id: number };

/** A title key, `movie:<id>`, `tv:<id>` or `game:<id>`. */
export const titleKeySchema = z
  .string()
  .regex(/^(movie|tv|game):\d{1,10}$/)
  .transform((key, ctx): TitleRef => {
    const [type, raw] = key.split(":") as [TitleType, string];
    const id = ID_SCHEMAS[type].safeParse(Number(raw));
    if (!id.success) {
      ctx.addIssue({ code: "custom", message: "invalid id" });
      return z.NEVER;
    }
    return { type, id: id.data };
  });

/** The `ids` query value: comma separated keys, 1 to `MAX_TITLE_KEYS`. */
export const titleIdsParamSchema = z
  .string()
  .transform((value) => [...new Set(value.split(","))])
  .pipe(z.array(titleKeySchema).min(1).max(MAX_TITLE_KEYS));

/** The key for one title; the app and the server build it the same way. */
export function titleKey(type: TitleType, id: number): string {
  return `${type}:${id}`;
}

/** A movie's key, `movie:<id>`. */
export function movieTitleKey(id: number): string {
  return titleKey("movie", id);
}

/** One movie's stored state; no row reads as the empty state. */
export const v1MovieTitleStateSchema = z.object({
  planned: z.boolean(),
  watchedAt: z.string().nullable(),
  rating: ratingSchema.nullable(),
});

export type V1MovieTitleState = z.infer<typeof v1MovieTitleStateSchema>;

export const EMPTY_V1_MOVIE_TITLE_STATE: V1MovieTitleState = {
  planned: false,
  watchedAt: null,
  rating: null,
};

/**
 * A show's progress as core's `showProgress` counts it: aired regular
 * episodes only (AGENTS.md section 9). Null when the catalog could not be
 * read, so the app shows the user's tracking without inventing a count.
 */
const v1ShowProgressSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none_aired") }),
    z.object({
      kind: z.literal("counted"),
      watched: z.number().int().min(0),
      total: z.number().int().min(1),
      next: z
        .object({
          id: z.number(),
          seasonNumber: z.number(),
          episodeNumber: z.number(),
        })
        .nullable(),
    }),
  ])
  .nullable();

/**
 * One show's state: tracking, progress, and the calculated ratings at full
 * precision (the app rounds to one decimal for display and shows "Not
 * rated" for null, AGENTS.md section 9). `seasonRatings` lists only seasons
 * with a rated episode, Specials included; `showRating` leaves Specials out.
 */
export const v1ShowTitleStateSchema = z.object({
  tracked: z.boolean(),
  progress: v1ShowProgressSchema,
  seasonRatings: z.array(
    z.object({
      seasonNumber: z.number().int().min(0),
      mean: z.number(),
      ratedEpisodes: z.number().int().min(1),
    }),
  ),
  showRating: z.number().nullable(),
});

export type V1ShowTitleState = z.infer<typeof v1ShowTitleStateSchema>;

/** One game's stored status and score; no row reads as nulls. */
export const v1GameTitleStateSchema = z.object({
  status: gameStatusSchema.nullable(),
  rating: ratingSchema.nullable(),
});

export type V1GameTitleState = z.infer<typeof v1GameTitleStateSchema>;

/**
 * The whole response: every requested key, present even when empty. Each
 * value has the shape of its key's type; `pickTitleState` reads one back.
 */
export const v1TitlesSchema = z.record(
  z.string(),
  z.union([
    v1MovieTitleStateSchema,
    v1ShowTitleStateSchema,
    v1GameTitleStateSchema,
  ]),
);

export type V1Titles = z.infer<typeof v1TitlesSchema>;

const STATE_SCHEMAS = {
  movie: v1MovieTitleStateSchema,
  tv: v1ShowTitleStateSchema,
  game: v1GameTitleStateSchema,
} as const;

/**
 * One title's state out of a `/me/titles` answer, narrowed to its type, or
 * null when the key is missing or holds another shape: an answer the app
 * cannot read is an error, never a guess (AGENTS.md section 11).
 */
export function pickTitleState<T extends TitleType>(
  titles: V1Titles,
  type: T,
  id: number,
): z.infer<(typeof STATE_SCHEMAS)[T]> | null {
  const parsed = STATE_SCHEMAS[type].safeParse(titles[titleKey(type, id)]);
  return parsed.success
    ? (parsed.data as z.infer<(typeof STATE_SCHEMAS)[T]>)
    : null;
}
