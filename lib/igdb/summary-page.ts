import "server-only";
import { catalogWhereClause } from "./catalog-filter";
import { igdbRequest } from "./client";
import { IGDB_SUMMARY_FIELDS } from "./constants";
import { normalizeSummary } from "./normalize";
import { buildQuery, type Condition, cond, type Sort } from "./query";
import { gameSummarySchema, recordsSchema } from "./schemas";
import type { GameFilters, GameSummary, Paged } from "./types";

/**
 * The paged summary read and the filters that `search.ts` and `discover.ts`
 * share (spec 0023, AC-12, AC-13). Kept apart from both so neither read
 * reaches into the other: a change to paging or to a shared filter lands here
 * once.
 */

/** UTC unix seconds of a day's midnight. */
export function unixDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000;
}

/**
 * The filters search and discover share. A game must have every genre and be
 * on any of the platforms (spec 0029, AC-7); separate filters combine with
 * AND. `minRating` is on the 0 to 10 scale against IGDB's 0 to 100 `rating`,
 * and a minimum of 0 is no minimum. `minRatingCount` is written here once, so
 * search and discover cannot drift apart on it (spec 0029, AC-19).
 */
export function sharedConditions(options: GameFilters): Condition[] {
  const where = [catalogWhereClause()];
  if (options.genreIds?.length) {
    where.push(cond.allOf("genres", options.genreIds));
  }
  if (options.platformIds?.length) {
    where.push(cond.anyOf("platforms", options.platformIds));
  }
  if (options.minRating !== undefined && options.minRating > 0) {
    // Rounded so 0.7 writes 7, not 7.000000000000001.
    where.push(
      cond.atLeast("rating", Number((options.minRating * 10).toFixed(6))),
    );
  }
  if (options.minRatingCount !== undefined) {
    where.push(cond.atLeast("rating_count", options.minRatingCount));
  }
  return where;
}

/**
 * One page of summaries. It asks for one more than `pageSize` and keeps
 * `pageSize`, so `hasNextPage` is always known; `totalResults` is IGDB's count
 * header or null, never a guess. The offset is counted in the same page size,
 * so pages never overlap (spec 0028, AC-5).
 */
export async function readSummaryPage(query: {
  search?: string;
  where: readonly Condition[];
  sort?: Sort;
  page: number;
  pageSize: number;
}): Promise<Paged<GameSummary>> {
  const { pageSize } = query;
  const { data, totalCount } = await igdbRequest(
    "games",
    buildQuery({
      search: query.search,
      fields: IGDB_SUMMARY_FIELDS,
      where: query.where,
      sort: query.sort,
      limit: pageSize + 1,
      offset: (query.page - 1) * pageSize,
    }),
    recordsSchema,
  );

  const results: GameSummary[] = [];
  for (const record of data.slice(0, pageSize)) {
    const parsed = gameSummarySchema.safeParse(record);
    if (parsed.success) results.push(normalizeSummary(parsed.data));
  }

  return {
    page: query.page,
    results,
    hasNextPage: data.length > pageSize,
    totalResults: totalCount,
  };
}
