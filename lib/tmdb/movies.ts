import "server-only";
import { tmdbRequest } from "./client";
import { normalizeMovie } from "./normalize";
import { movieSchema } from "./schemas";
import type { Movie } from "./types";
import { assertId } from "./validation";

/**
 * Reads one movie, uncached.
 *
 * This is the inner half of the two function split spec 0002's AC-23 requires:
 * the request, validation and normalization live here so the test suite can
 * call them directly, and the `use cache` wrapper in `reads.ts` is what pages
 * import. `credits` and `translations` are appended so the cast and the
 * original language overview arrive in the same round trip, which is the one
 * HTTP request AC-6 asks for (translations added by spec 0006, AC-5).
 *
 * @param id TMDB movie id.
 * @returns The normalized movie.
 * @throws {TmdbError} `not_found` when TMDB has no such movie.
 */
export async function fetchMovie(id: number): Promise<Movie> {
  const endpoint = `/movie/${id}`;
  assertId(id, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    { append_to_response: "credits,translations" },
    movieSchema,
  );
  return normalizeMovie(raw);
}
