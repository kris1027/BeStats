import { V1_ERROR_MESSAGES } from "@bestats/core/api/v1/errors";
import {
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "@bestats/core/api/v1/movie";
import { movieTitleKey, v1TitlesSchema } from "@bestats/core/api/v1/titles";

import { ApiError, apiRequest } from "./api";

/**
 * The first segment of every private query key. `clearPrivateQueries` wipes
 * by it on sign out, so the keys and the wipe read the same constant
 * (spec 0033, AC-13; AGENTS.md section 11).
 */
export const PRIVATE_QUERY_ROOT = "me";

/** Query keys, so a sign out can wipe every private one at once. */
export const queryKeys = {
  movie: (id: number) => ["catalog", "movie", id] as const,
  movieState: (id: number) =>
    [PRIVATE_QUERY_ROOT, "titles", movieTitleKey(id)] as const,
};

/** `GET /api/v1/movies/{id}`: the public catalog detail. */
export function fetchMovie(id: number) {
  return apiRequest(`/api/v1/movies/${id}`, v1MovieSchema);
}

/** The caller's own state for one movie, from `/api/v1/me/titles`. */
export async function fetchMovieState(id: number) {
  const titles = await apiRequest(
    `/api/v1/me/titles?ids=${movieTitleKey(id)}`,
    v1TitlesSchema,
    { auth: true },
  );
  const state = titles[movieTitleKey(id)];
  // The API answers every asked key; a missing one is an unreadable answer.
  if (!state) throw new ApiError(200, "internal", V1_ERROR_MESSAGES.internal);
  return state;
}

/** `PUT /api/v1/me/movies/{id}/watched`. */
export function putMovieWatched(id: number, watched: boolean) {
  return apiRequest(`/api/v1/me/movies/${id}/watched`, v1MovieWriteOkSchema, {
    method: "PUT",
    body: { watched },
    auth: true,
  });
}
