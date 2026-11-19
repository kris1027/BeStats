import "server-only";

import {
  EMPTY_V1_MOVIE_TITLE_STATE,
  movieTitleKey,
  type V1Titles,
} from "@bestats/core/api/v1/titles";

import { logTrackingEvent, TRACKING_EVENT } from "../log";
import type { TrackingDeps } from "./run";

/**
 * The caller's own state for a batch of movies, keyed `movie:<id>`, for
 * `GET /api/v1/me/titles` (spec 0033, child 0035). One query for the whole
 * batch; a movie with no row answers the empty state, so every requested key
 * is present and the app never has to guess.
 *
 * Reads only through Row Level Security with the caller's verified id. No
 * catalog data: whether a movie is released stays the catalog's to say.
 *
 * @returns The map, or null when the read failed.
 */
export async function readMovieTitles(
  deps: TrackingDeps,
  movieIds: readonly number[],
): Promise<V1Titles | null> {
  const supabase = await deps.getClient();
  const { data, error } = await supabase
    .from("user_movie_state")
    .select("movie_id, in_watchlist, watched_at, rating")
    .eq("user_id", deps.userId)
    .in("movie_id", [...movieIds]);

  if (error) {
    logTrackingEvent(TRACKING_EVENT.listRead, "db_error");
    return null;
  }

  const titles: V1Titles = {};
  for (const id of movieIds) {
    titles[movieTitleKey(id)] = EMPTY_V1_MOVIE_TITLE_STATE;
  }
  for (const row of data ?? []) {
    titles[movieTitleKey(row.movie_id)] = {
      planned: row.in_watchlist,
      watchedAt: row.watched_at,
      rating: row.rating,
    };
  }
  return titles;
}
