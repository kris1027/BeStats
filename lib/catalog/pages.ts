import { z } from "zod";

/**
 * The last page TMDB serves for any list. It answers a request for page 501 or
 * beyond with an error, whatever `total_pages` says (spec 0006, AC-2).
 */
export const TMDB_MAX_PAGE = 500;

const pageSchema = z.coerce.number().int().min(1).max(TMDB_MAX_PAGE);

/**
 * Reads the `page` search parameter of a paged catalog list, before any TMDB
 * call is made (spec 0006, AC-2).
 *
 * A missing value is page 1. Anything that is not one whole number from 1 to
 * 500 is null, which the page turns into "That page doesn't exist" without
 * asking TMDB. A repeated parameter (`?page=1&page=2`) is refused too, rather
 * than silently picking one.
 */
export function parsePageParam(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value)) return null;
  // `z.coerce` reads an empty or blank string as 0, which the range refuses.
  const parsed = pageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The last page a visitor can reach: TMDB's own count, capped at the page it
 * will actually serve.
 */
export function lastReachablePage(totalPages: number): number {
  return Math.min(totalPages, TMDB_MAX_PAGE);
}
