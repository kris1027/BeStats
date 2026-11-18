import {
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "@bestats/core/api/v1/movie";
import { movieTitleKey, v1TitlesSchema } from "@bestats/core/api/v1/titles";

import { apiRequest } from "./api";

/** Query keys, so a sign out can wipe every private one at once. */
export const queryKeys = {
  movie: (id: number) => ["catalog", "movie", id] as const,
  movieState: (id: number) => ["me", "titles", movieTitleKey(id)] as const,
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
  if (!state) throw new Error("The titles answer left out the asked movie.");
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
