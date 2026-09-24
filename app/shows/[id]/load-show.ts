import "server-only";

import { getTvShow, isTmdbNotFound, TmdbError, type TvShow } from "@/lib/tmdb";

export type LoadShowResult =
  | { kind: "found"; show: TvShow }
  | { kind: "not_found" }
  | { kind: "failed" };

/**
 * The one place the show and season pages decide whether they have a show
 * (spec 0009, AC-14, AC-15, AC-16), the `loadMovie` pattern.
 *
 * The page bodies and `generateMetadata` all branch on this, so a tab title
 * and the panel under it never disagree. Every call reads the same cached
 * entry.
 *
 * An adult flagged show is reported as not found, on the show page and on
 * every one of its season pages: discover leaves adult titles out, but a read
 * by id does not, and this app never renders one.
 *
 * Only a `TmdbError` becomes `failed`. Anything else is a bug, not a TMDB
 * outcome, so it is rethrown rather than dressed up as "Couldn't reach TMDB".
 */
export async function loadShow(id: number): Promise<LoadShowResult> {
  try {
    const show = await getTvShow(id);
    return show.adult ? { kind: "not_found" } : { kind: "found", show };
  } catch (error) {
    if (isTmdbNotFound(error)) return { kind: "not_found" };
    if (error instanceof TmdbError) return { kind: "failed" };
    throw error;
  }
}
