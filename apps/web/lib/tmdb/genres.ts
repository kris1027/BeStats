import "server-only";
import type { Genre } from "@bestats/core/tmdb/types";
import { tmdbRequest } from "./client";
import { genreListSchema } from "./schemas";

/**
 * The genre lists TMDB's discover filters take ids from, uncached.
 *
 * Movie and TV genres are separate lists with overlapping but different ids, so
 * the two reads stay separate rather than merged into one lookup a caller could
 * use against the wrong media type.
 */
export async function fetchMovieGenres(): Promise<Genre[]> {
  const { genres } = await tmdbRequest(
    "/genre/movie/list",
    {},
    genreListSchema,
  );
  return genres;
}

export async function fetchTvGenres(): Promise<Genre[]> {
  const { genres } = await tmdbRequest("/genre/tv/list", {}, genreListSchema);
  return genres;
}
