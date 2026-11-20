import type { ClearedOf } from "@bestats/core/api/v1/cleared";
import {
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "@bestats/core/api/v1/movie";

import type { TrackingIntent } from "@bestats/core/tracking/intent";

import { apiRequest } from "./api";
import { postRestore } from "./tracking";

/**
 * `GET /api/v1/movies/{id}`: the public catalog detail, read without a
 * session so a signed out visitor sees the page (AGENTS.md section 7). Its
 * key is `catalogKeys.movie`, apart from the user's state (section 11).
 */
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

/**
 * `PUT /api/v1/me/movies/{id}/watchlist`. Planning a watched movie drops its
 * mark and score on the server, which answers with `cleared` for the Undo
 * (AGENTS.md section 7).
 */
export function putMovieWatchlist(id: number, planned: boolean) {
  return putMovie(id, "watchlist", { planned });
}

/**
 * `PUT /api/v1/me/movies/{id}/watched`. The server holds the release gate
 * and drops the score on an unmark, answering with `cleared` (AGENTS.md
 * section 7).
 */
export function putMovieWatched(id: number, watched: boolean) {
  return putMovie(id, "watched", { watched });
}

/**
 * `PUT /api/v1/me/movies/{id}/rating`; null clears the score. A score needs
 * a watch mark, which the server checks (AGENTS.md section 7).
 */
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
  return postRestore(
    `/api/v1/me/movies/${cleared.movieId}/${resource}/restore`,
    cleared,
    v1MovieWriteOkSchema,
  );
}

/**
 * Sends one movie pill's intent to its route. The one place an intent picks
 * its request, so the screen and its optimistic rule (`applyTrackingIntent`)
 * read the same intent (apps/mobile/AGENTS.md, BeStats rules).
 */
export function writeMovieIntent(id: number, intent: TrackingIntent) {
  switch (intent.kind) {
    case "watchlist":
      return putMovieWatchlist(id, intent.value);
    case "watched":
      return putMovieWatched(id, intent.value);
    case "rating":
      return putMovieRating(id, intent.value);
  }
}
