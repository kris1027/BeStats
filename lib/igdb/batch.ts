import "server-only";
import { igdbRequest } from "./client";
import { IGDB_BATCH_LIMIT, IGDB_SUMMARY_FIELDS } from "./constants";
import { normalizeSummary } from "./normalize";
import { buildQuery, intList } from "./query";
import { gameSummarySchema, recordsSchema } from "./schemas";
import type { BatchResult, GameSummary } from "./types";
import { canonicalGameIds } from "./validation";

/**
 * Reads up to 500 games by id in one IGDB request, which is what a library
 * page needs (spec 0023, AC-11).
 *
 * Two rules keep it honest, as in TMDB's batch:
 *
 * - An id IGDB does not return, or returns without a valid `id` and `name`,
 *   lands in `missingIds` instead of being dropped in silence. Only the caller
 *   knows how to tell the user.
 * - A systemic failure (a bad credential, an exhausted rate limit, a timeout,
 *   an outage) raises. A short list there would read as "those games are gone"
 *   and invite the UI to offer removing rows that are perfectly fine.
 *
 * Hidden games are returned with `hidden: true`, never filtered out, for the
 * same reason `getGame` keeps them.
 *
 * @param ids 0 to 500 positive integers, in any order, repeats allowed.
 * @returns `found` in no promised order, and every id that did not come back.
 * @throws {IgdbValidationError} Over 500 ids, or an invalid one, before any
 * request. An empty list makes no request at all.
 */
export async function fetchGamesByIds(
  ids: readonly number[],
): Promise<BatchResult<GameSummary>> {
  const wanted = canonicalGameIds(ids);
  if (wanted.length === 0) return { found: [], missingIds: [] };

  const { data } = await igdbRequest(
    "games",
    buildQuery({
      fields: IGDB_SUMMARY_FIELDS,
      where: [`id = ${intList(wanted)}`],
      limit: IGDB_BATCH_LIMIT,
    }),
    recordsSchema,
  );

  const requested = new Set(wanted);
  const byId = new Map<number, GameSummary>();
  for (const record of data) {
    const parsed = gameSummarySchema.safeParse(record);
    if (parsed.success && requested.has(parsed.data.id)) {
      byId.set(parsed.data.id, normalizeSummary(parsed.data));
    }
  }

  return {
    found: [...byId.values()],
    missingIds: wanted.filter((id) => !byId.has(id)),
  };
}
