import { z } from "zod";

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
