import "server-only";
import { catalogWhereClause } from "./catalog-filter";
import { igdbRequest } from "./client";
import { IGDB_PAGE_SIZE, IGDB_SUMMARY_FIELDS } from "./constants";
import { normalizeSummary } from "./normalize";
import { buildQuery, intList } from "./query";
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
 * The filters search and discover share. Within one id list a game matches on
 * any id; separate filters combine with AND. `minRating` is on the 0 to 10
 * scale against IGDB's 0 to 100 `rating`, and a minimum of 0 is no minimum.
 */
export function sharedConditions(options: GameFilters): string[] {
  const where = [catalogWhereClause()];
  if (options.genreIds?.length) {
    where.push(`genres = ${intList(options.genreIds)}`);
  }
  if (options.platformIds?.length) {
    where.push(`platforms = ${intList(options.platformIds)}`);
  }
  if (options.minRating !== undefined && options.minRating > 0) {
    // Rounded so 0.7 writes 7, not 7.000000000000001.
    where.push(`rating >= ${Number((options.minRating * 10).toFixed(6))}`);
  }
  return where;
}

/**
 * One page of summaries. It asks for 21 and keeps 20, so `hasNextPage` is
 * always known; `totalResults` is IGDB's count header or null, never a guess.
 */
export async function readSummaryPage(query: {
  search?: string;
  where: readonly string[];
  sort?: string;
  page: number;
}): Promise<Paged<GameSummary>> {
  const { data, totalCount } = await igdbRequest(
    "games",
    buildQuery({
      search: query.search,
      fields: IGDB_SUMMARY_FIELDS,
      where: query.where,
      sort: query.sort,
      limit: IGDB_PAGE_SIZE + 1,
      offset: (query.page - 1) * IGDB_PAGE_SIZE,
    }),
    recordsSchema,
  );

  const results: GameSummary[] = [];
  for (const record of data.slice(0, IGDB_PAGE_SIZE)) {
    const parsed = gameSummarySchema.safeParse(record);
    if (parsed.success) results.push(normalizeSummary(parsed.data));
  }

  return {
    page: query.page,
    results,
    hasNextPage: data.length > IGDB_PAGE_SIZE,
    totalResults: totalCount,
  };
}
