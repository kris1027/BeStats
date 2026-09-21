import { z } from "zod";
import { TmdbError } from "./errors";

/**
 * Input guards for the values that end up in a TMDB URL path or query.
 *
 * A route parameter is attacker controlled, so an id is checked to be a
 * positive integer before it is ever interpolated into a path (spec 0002,
 * security model). A bad input fails as `bad_response` against the endpoint it
 * was aimed at rather than as a raw Zod error, so callers keep one error type.
 */
const positiveIntSchema = z.number().int().positive();
const seasonNumberSchema = z.number().int().min(0);

function assert<T>(
  schema: z.ZodType<T>,
  value: unknown,
  endpoint: string,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TmdbError(
      "bad_response",
      endpoint,
      `Invalid ${label}: ${parsed.error.issues[0].message}`,
    );
  }
  return parsed.data;
}

export function assertId(id: number, endpoint: string): number {
  return assert(positiveIntSchema, id, endpoint, "id");
}

/** Season 0 is valid: it is TMDB's specials bucket (spec 0002, AC-15). */
export function assertSeasonNumber(
  seasonNumber: number,
  endpoint: string,
): number {
  return assert(seasonNumberSchema, seasonNumber, endpoint, "season number");
}

export function assertPage(page: number, endpoint: string): number {
  return assert(positiveIntSchema, page, endpoint, "page");
}

export function assertQuery(query: string, endpoint: string): string {
  return assert(z.string().trim().min(1), query, endpoint, "query");
}
