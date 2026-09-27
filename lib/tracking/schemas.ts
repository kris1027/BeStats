import { z } from "zod";

import { TV_STATUSES } from "./types";

/**
 * The input rules every movie tracking action applies before any Supabase or
 * TMDB call (spec 0007, AC-13).
 *
 * The same bounds live in Postgres as `CHECK` constraints (spec 0001), so a
 * value that slipped past these would still be refused there. Checking here as
 * well is what lets a malformed call fail as `invalid_input` without costing a
 * TMDB request or a round trip to the database.
 */

/** The largest id Postgres's `integer` holds, matching `lib/catalog/ids.ts`. */
const MAX_TMDB_ID = 2147483647;

export const movieIdSchema = z.number().int().min(1).max(MAX_TMDB_ID);

export const ratingSchema = z.number().int().min(1).max(10);

export const watchlistInputSchema = z.object({
  movieId: movieIdSchema,
  inWatchlist: z.boolean(),
});

export const watchedInputSchema = z.object({
  movieId: movieIdSchema,
  watched: z.boolean(),
});

export const ratingInputSchema = z.object({
  movieId: movieIdSchema,
  rating: ratingSchema.nullable(),
});

/** Undo on the watchlist page takes nothing but the movie (spec 0008). */
export const restoreWatchlistInputSchema = z.object({
  movieId: movieIdSchema,
});

/**
 * Undo on the watched page also carries the watched time the page rendered.
 * It must be a full ISO timestamp with an offset, as PostgREST returned it, so
 * nothing is guessed about the time zone. `restore_movie_watched` still bounds
 * it to the past (spec 0008, AC-7).
 */
export const restoreWatchedInputSchema = z.object({
  movieId: movieIdSchema,
  watchedAt: z.iso.datetime({ offset: true }),
});

/** A TMDB show or episode id: the same bounds as a movie id. */
export const tmdbIdSchema = movieIdSchema;

/** A season number as Postgres's `smallint` holds it; 0 is Specials. */
export const seasonNumberSchema = z.number().int().min(0).max(32767);

/**
 * A list of episode ids for a season write. The bound matches the guard in
 * the season functions (spec 0011, AC-15), so an oversized list fails here
 * before costing a request.
 */
export const episodeIdListSchema = z.array(tmdbIdSchema).min(1).max(1000);

export const episodeWatchedInputSchema = z.object({
  showId: tmdbIdSchema,
  seasonNumber: seasonNumberSchema,
  episodeId: tmdbIdSchema,
  watched: z.boolean(),
});

export const episodeRatingInputSchema = z.object({
  showId: tmdbIdSchema,
  seasonNumber: seasonNumberSchema,
  episodeId: tmdbIdSchema,
  rating: ratingSchema.nullable(),
});

/**
 * Marking a season takes its episodes from TMDB, so only unmarking needs the
 * ids the page rendered (spec 0011, API surface).
 */
export const seasonWatchedInputSchema = z.discriminatedUnion("watched", [
  z.object({
    showId: tmdbIdSchema,
    seasonNumber: seasonNumberSchema,
    watched: z.literal(true),
  }),
  z.object({
    showId: tmdbIdSchema,
    seasonNumber: seasonNumberSchema,
    watched: z.literal(false),
    episodeIds: episodeIdListSchema,
  }),
]);

/**
 * A date to put back. As on the watched page, a full ISO timestamp with an
 * offset, and never in the future; `restore_episodes_watched` applies the same
 * bound again (spec 0011, AC-11, AC-15).
 */
const restoreEntrySchema = z.object({
  episodeId: tmdbIdSchema,
  watchedAt: z.iso
    .datetime({ offset: true })
    .refine((value) => Date.parse(value) <= Date.now()),
});

export const seasonUndoInputSchema = z.object({
  showId: tmdbIdSchema,
  undo: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unmark"), episodeIds: episodeIdListSchema }),
    z.object({
      kind: z.literal("restore"),
      entries: z.array(restoreEntrySchema).min(1).max(1000),
    }),
  ]),
});

/** One of the five statuses, exactly as `tv_status` spells them. */
export const tvStatusSchema = z.enum(TV_STATUSES);

/**
 * A status write (spec 0013, AC-21): the show and the status to set, or null
 * to remove it. The source is never an input: a choice made by hand is always
 * `user`, fixed inside `set_show_status`.
 */
export const showStatusInputSchema = z.object({
  showId: tmdbIdSchema,
  status: tvStatusSchema.nullable(),
});

/** A time the client carries back for an Undo: full ISO, never in the future. */
const pastInstantSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => Date.parse(value) <= Date.now());

/**
 * The Undo of a status removal or of Stop watching (spec 0013, AC-19, AC-21):
 * the values `set_show_status` or `remove_show_status` reported. A removal's
 * Undo must carry the time of the removal, which bounds the window;
 * `restore_show_status` applies every bound again.
 */
export const restoreShowStatusInputSchema = z
  .object({
    showId: tmdbIdSchema,
    undo: z.object({
      expected: tvStatusSchema.nullable(),
      status: tvStatusSchema,
      source: z.enum(["user", "system"]),
      listedAt: pastInstantSchema.nullable(),
      removedAt: pastInstantSchema.nullable(),
    }),
  })
  .refine(
    (input) => input.undo.expected !== null || input.undo.removedAt !== null,
  );
