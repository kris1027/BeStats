/**
 * The largest id Postgres's `integer` holds, and so the largest TMDB id the
 * tracking tables in spec 0001 can store. Anything above it cannot be a movie
 * this app knows about.
 */
const MAX_TMDB_ID = 2147483647;

/** Digits only, no sign, no leading zero, at most ten characters. */
const CANONICAL_ID = /^[1-9]\d{0,9}$/;

/**
 * Parses a `/movies/[id]` path segment, or returns null when it is not a
 * canonical positive integer.
 *
 * Shared by `proxy.ts`, which answers a malformed id with a real 404 before any
 * Supabase or TMDB call, and by the page itself, so the two can never disagree
 * about what a movie URL looks like (spec 0006, AC-8). Canonical means one
 * spelling per movie: `0550`, `+550` and `550.0` are refused rather than
 * quietly served as a duplicate of `/movies/550`.
 *
 * The range check is not redundant with the pattern: ten digits would let
 * `9999999999` through.
 *
 * Pure and free of `server-only`, because the proxy imports it.
 *
 * @param segment The raw path segment, already URL decoded by Next.
 * @returns The id, or null.
 */
export function parseMovieId(segment: string): number | null {
  if (!CANONICAL_ID.test(segment)) return null;
  const id = Number(segment);
  return id <= MAX_TMDB_ID ? id : null;
}
