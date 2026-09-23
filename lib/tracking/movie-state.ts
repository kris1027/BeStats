import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import {
  EMPTY_MOVIE_TRACKING,
  type MovieTrackingState,
  type TrackingRead,
} from "./types";

/**
 * The request scoped reads behind the tracking controls (spec 0007, API
 * surface).
 *
 * Neither function may ever run inside `use cache`: the result belongs to one
 * person, and a shared cache entry would hand it to the next visitor
 * (`AGENTS.md` section 11, AC-19). They are only called from
 * `components/tracking/`, each inside its own Suspense boundary, so the public
 * routes keep their prerendered shells.
 *
 * Both check `publicEnvProblems()` before touching the session, as the navbar
 * account slot does, so a clone with no Supabase configuration still serves
 * the catalog with no controls rather than failing the page (AC-2).
 */

/**
 * The signed in user's state for one movie, or `signed_out`, or `failed`.
 *
 * No row is the empty state, not an error: a movie nobody has tracked yet has
 * nothing stored.
 *
 * @param movieId An id the page has already parsed and TMDB has confirmed.
 */
export async function getMovieTracking(
  movieId: number,
): Promise<TrackingRead<MovieTrackingState>> {
  if (publicEnvProblems()) return { kind: "signed_out" };

  const user = await getOptionalUser();
  if (!user) return { kind: "signed_out" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_movie_state")
    .select("in_watchlist, watched_at, rating")
    .eq("user_id", user.id)
    .eq("movie_id", movieId)
    .maybeSingle();

  if (error) {
    logTrackingEvent(TRACKING_EVENT.read, "db_error");
    return { kind: "failed" };
  }
  if (!data) return { kind: "ok", state: EMPTY_MOVIE_TRACKING };

  return {
    kind: "ok",
    state: {
      inWatchlist: data.in_watchlist,
      watched: data.watched_at !== null,
      rating: data.rating,
    },
  };
}

/**
 * Which of a grid's movies the signed in user has planned, in one query for
 * the whole grid (spec 0007, AC-16).
 *
 * Every card asks for the same set, so the argument is a primitive (a sorted,
 * comma joined id list) rather than an array: React `cache()` compares
 * arguments by identity, and only a string lets twenty cards share one read
 * per request.
 *
 * @param idsKey The grid's movie ids, sorted and joined with commas. Build it
 * with `movieIdsKey`.
 */
export const getWatchlistedMovieIds = cache(
  async (idsKey: string): Promise<TrackingRead<Set<number>>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    if (ids.length === 0) return { kind: "ok", state: new Set() };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_movie_state")
      .select("movie_id")
      .eq("user_id", user.id)
      .eq("in_watchlist", true)
      .in("movie_id", ids);

    if (error) {
      logTrackingEvent(TRACKING_EVENT.read, "db_error");
      return { kind: "failed" };
    }

    return { kind: "ok", state: new Set(data.map((row) => row.movie_id)) };
  },
);

/**
 * The cache key `getWatchlistedMovieIds` expects: the same ids in any order
 * give the same key.
 *
 * @param ids The movie ids on the grid.
 */
export function movieIdsKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}
