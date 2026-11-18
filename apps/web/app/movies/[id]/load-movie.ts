import "server-only";

import { getMovie, isTmdbNotFound, type Movie, TmdbError } from "@/lib/tmdb";

export type LoadMovieResult =
  | { kind: "found"; movie: Movie }
  | { kind: "not_found" }
  | { kind: "failed" };

/**
 * The one place the movie page decides whether it has a movie to show
 * (spec 0006, AC-9, AC-10, AC-12).
 *
 * The page body and `generateMetadata` both branch on this, so the title a
 * tab shows and the panel the page shows can never disagree about whether the
 * movie exists. Both calls read the same cached entry.
 *
 * An adult flagged movie is reported as not found. Discover already leaves
 * adult titles out, but a detail read by id does not, and this app never
 * renders one (spec 0006, key invariants).
 *
 * Only a `TmdbError` becomes `failed`. Anything else is a bug, not a TMDB
 * outcome, so it is rethrown rather than dressed up as "Couldn't reach TMDB".
 */
export async function loadMovie(id: number): Promise<LoadMovieResult> {
  try {
    const movie = await getMovie(id);
    return movie.adult ? { kind: "not_found" } : { kind: "found", movie };
  } catch (error) {
    if (isTmdbNotFound(error)) return { kind: "not_found" };
    if (error instanceof TmdbError) return { kind: "failed" };
    throw error;
  }
}
