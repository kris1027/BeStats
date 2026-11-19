import type { ClearedOf } from "@bestats/core/api/v1/cleared";
import {
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "@bestats/core/api/v1/movie";

import { apiRequest } from "./api";

/**
 * The first segment of every private query key. `clearPrivateQueries` wipes
 * by it on sign out, so the keys and the wipe read the same constant
 * (spec 0033, AC-13; AGENTS.md section 11).
 */
export const PRIVATE_QUERY_ROOT = "me";

/** The public movie key; the user's state lives under `trackingKeys`. */
export const queryKeys = {
  movie: (id: number) => ["catalog", "movie", id] as const,
};

/** `GET /api/v1/movies/{id}`: the public catalog detail. */
export function fetchMovie(id: number) {
  return apiRequest(`/api/v1/movies/${id}`, v1MovieSchema);
}

/**
 * The movie writes (spec 0035, API surface): each runs the same command as
 * the web's Server Action, so the plan, mark and score rules and the release
 * gate stay on the server (spec 0033, AC-5, AC-6).
 */
function putMovie(id: number, resource: string, body: unknown) {
  return apiRequest(
    `/api/v1/me/movies/${id}/${resource}`,
    v1MovieWriteOkSchema,
    {
      method: "PUT",
      body,
      auth: true,
    },
  );
}

/** `PUT /api/v1/me/movies/{id}/watchlist`. */
export function putMovieWatchlist(id: number, planned: boolean) {
  return putMovie(id, "watchlist", { planned });
}

/** `PUT /api/v1/me/movies/{id}/watched`. */
export function putMovieWatched(id: number, watched: boolean) {
  return putMovie(id, "watched", { watched });
}

/** `PUT /api/v1/me/movies/{id}/rating`; null clears the score. */
export function putMovieRating(id: number, rating: number | null) {
  return putMovie(id, "rating", { rating });
}

/**
 * `POST …/watchlist/restore` or `…/watched/restore` (spec 0035, Undo): the
 * `cleared` state the earlier write returned, with the movie id it was sent.
 */
export function restoreMovie(
  cleared: ClearedOf<"movie_watchlist"> | ClearedOf<"movie_watched">,
) {
  const resource = cleared.kind === "movie_watchlist" ? "watchlist" : "watched";
  return apiRequest(
    `/api/v1/me/movies/${cleared.movieId}/${resource}/restore`,
    v1MovieWriteOkSchema,
    { method: "POST", body: { cleared }, auth: true },
  );
}
