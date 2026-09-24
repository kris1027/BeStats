/**
 * The largest id Postgres's `integer` holds, and so the largest TMDB id the
 * tracking tables in spec 0001 can store. Anything above it cannot be a title
 * this app knows about.
 */
const MAX_TMDB_ID = 2147483647;

/** Digits only, no sign, no leading zero, at most ten characters. */
const CANONICAL_ID = /^[1-9]\d{0,9}$/;

/**
 * Parses a `/movies/[id]` or `/shows/[id]` path segment, or returns null when
 * it is not a canonical positive integer.
 *
 * Shared by `proxy.ts`, which answers a malformed id with a real 404 before any
 * Supabase or TMDB call, and by the pages themselves, so the two can never
 * disagree about what a title URL looks like (spec 0006, AC-8; spec 0009,
 * AC-13). Canonical means one spelling per title: `0550`, `+550` and `550.0`
 * are refused rather than quietly served as a duplicate of `/movies/550`.
 *
 * The range check is not redundant with the pattern: ten digits would let
 * `9999999999` through.
 *
 * Pure and free of `server-only`, because the proxy imports it.
 *
 * @param segment The raw path segment, already URL decoded by Next.
 * @returns The id, or null.
 */
export function parseTmdbId(segment: string): number | null {
  if (!CANONICAL_ID.test(segment)) return null;
  const id = Number(segment);
  return id <= MAX_TMDB_ID ? id : null;
}

/** `0`, or a positive integer with no leading zero, at most four digits. */
const CANONICAL_SEASON = /^(0|[1-9]\d{0,3})$/;

/**
 * Parses a `/shows/[id]/season/[number]` segment, or returns null.
 *
 * `0` is TMDB's specials season and is valid. Everything else must be the one
 * canonical spelling, so `00`, `01`, `-1` and `1.0` are refused, and four
 * digits is a generous ceiling no real show reaches (spec 0009, AC-13). Shared
 * by the proxy and the season page, like `parseTmdbId`.
 *
 * @param segment The raw path segment, already URL decoded.
 * @returns The season number, or null.
 */
export function parseSeasonNumber(segment: string): number | null {
  return CANONICAL_SEASON.test(segment) ? Number(segment) : null;
}
