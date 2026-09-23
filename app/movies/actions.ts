"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import {
  logTrackingEvent,
  TRACKING_EVENT,
  type TrackingEvent,
} from "@/lib/tracking/log";
import {
  ratingInputSchema,
  watchedInputSchema,
  watchlistInputSchema,
} from "@/lib/tracking/schemas";
import { classifyTrackingError } from "@/lib/tracking/supabase-error";
import type { MovieTrackingResult } from "@/lib/tracking/types";

import { loadMovie } from "./[id]/load-movie";

/**
 * The three movie tracking mutations, as Server Actions (spec 0007, API
 * surface).
 *
 * Each takes a target value, never a toggle, so the same call twice gives the
 * same row and queued rapid clicks settle on the last one (AC-15). Each runs
 * the same order: Zod parse, then the verified session, then (for a write that
 * can create a row) the TMDB check, then the write through Row Level Security,
 * then `refresh()` on success only.
 *
 * None of them throws or redirects. A thrown error reaches the browser as an
 * opaque digest and would land in an error boundary instead of a toast, so
 * every failure is returned as a `MovieTrackingResult` (AC-11). `user_id` is
 * always the verified session's, never an argument (`AGENTS.md` section 5,
 * AC-18).
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** What a write step returns: PostgREST's error, or null on success. */
type WriteStep = (
  supabase: SupabaseClient,
  userId: string,
) => PromiseLike<{ error: { code?: string | null } | null }>;

/**
 * The shared shape of every tracking action.
 *
 * @param event The log event for a refusal.
 * @param movieId The already parsed movie id.
 * @param creates Whether this write can insert a row. Only those confirm the
 * movie with TMDB first; a removal must keep working for a movie TMDB later
 * drops, or during an outage (AC-14).
 * @param write The Supabase call, given the request client and the user id.
 */
async function runTrackingWrite(
  event: TrackingEvent,
  movieId: number,
  creates: boolean,
  write: WriteStep,
): Promise<MovieTrackingResult> {
  try {
    const user = await getOptionalUser();
    if (!user) {
      logTrackingEvent(event, "session_expired");
      return { ok: false, error: "session_expired" };
    }

    if (creates) {
      const movie = await loadMovie(movieId);
      if (movie.kind !== "found") {
        const error =
          movie.kind === "failed" ? "tmdb_unavailable" : "not_found";
        logTrackingEvent(event, error);
        return { ok: false, error };
      }
    }

    const supabase = await createClient();
    const { error } = await write(supabase, user.id);
    if (error) {
      const classified = classifyTrackingError(error);
      logTrackingEvent(event, classified.outcome);
      return { ok: false, error: classified.error };
    }
  } catch {
    // A network failure inside supabase-js or a bug surfaced by `loadMovie`.
    // The error object is dropped on purpose: its message can carry request
    // details that must not reach a log line (AC-21).
    logTrackingEvent(event, "db_error");
    return { ok: false, error: "write_failed" };
  }

  refresh();
  return { ok: true };
}

/** Parses an action's arguments, or reports `invalid_input` (AC-13). */
function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  event: TrackingEvent,
): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  logTrackingEvent(event, "invalid_input");
  return null;
}

/**
 * Plans or unplans a movie. Never touches `watched_at` or `rating`, so a
 * watched movie can be planned for a rewatch (AC-3, AC-6).
 *
 * Planning upserts only `in_watchlist`, so on conflict every other column
 * keeps its value (spec 0001's partial write rule). Unplanning is an update
 * only, so it never creates a row; matching no row is a success, because the
 * state was already empty.
 */
export async function setMovieWatchlist(
  movieId: number,
  inWatchlist: boolean,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watchlist;
  const input = parse(watchlistInputSchema, { movieId, inWatchlist }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.inWatchlist) {
    return runTrackingWrite(event, input.movieId, true, (supabase, userId) =>
      supabase
        .from("user_movie_state")
        .upsert(
          { user_id: userId, movie_id: input.movieId, in_watchlist: true },
          { onConflict: "user_id,movie_id" },
        ),
    );
  }

  return runTrackingWrite(event, input.movieId, false, (supabase, userId) =>
    supabase
      .from("user_movie_state")
      .update({ in_watchlist: false })
      .eq("user_id", userId)
      .eq("movie_id", input.movieId),
  );
}

/**
 * Marks a movie watched, or clears the mark.
 *
 * Marking goes through `mark_movie_watched`, because whether it also clears
 * the bookmark depends on the current row and must be decided in the same
 * statement (AC-4). Unmarking clears only `watched_at`: the rating and the
 * bookmark stay exactly as they were (AC-5, `AGENTS.md` section 7).
 */
export async function setMovieWatched(
  movieId: number,
  watched: boolean,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.watched;
  const input = parse(watchedInputSchema, { movieId, watched }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  if (input.watched) {
    return runTrackingWrite(event, input.movieId, true, (supabase) =>
      supabase.rpc("mark_movie_watched", { p_movie_id: input.movieId }),
    );
  }

  return runTrackingWrite(event, input.movieId, false, (supabase, userId) =>
    supabase
      .from("user_movie_state")
      .update({ watched_at: null })
      .eq("user_id", userId)
      .eq("movie_id", input.movieId),
  );
}

/**
 * Stores a personal score from 1 to 10, or clears it.
 *
 * A score goes through `rate_movie`, which also marks an unwatched movie
 * watched in the same statement (AC-8). Clearing touches only `rating`, so the
 * watched mark and the bookmark survive (AC-9).
 */
export async function setMovieRating(
  movieId: number,
  rating: number | null,
): Promise<MovieTrackingResult> {
  const event = TRACKING_EVENT.rate;
  const input = parse(ratingInputSchema, { movieId, rating }, event);
  if (!input) return { ok: false, error: "invalid_input" };

  const score = input.rating;
  if (score !== null) {
    return runTrackingWrite(event, input.movieId, true, (supabase) =>
      supabase.rpc("rate_movie", {
        p_movie_id: input.movieId,
        p_rating: score,
      }),
    );
  }

  return runTrackingWrite(event, input.movieId, false, (supabase, userId) =>
    supabase
      .from("user_movie_state")
      .update({ rating: null })
      .eq("user_id", userId)
      .eq("movie_id", input.movieId),
  );
}
