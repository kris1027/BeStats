import "server-only";
import { cond } from "./query";
import { readSummaryPage, sharedConditions } from "./summary-page";
import type { GameSummary, Paged } from "./types";
import type { ValidSearchOptions } from "./validation";

/**
 * Title search, with every filter in the same IGDB query (spec 0023, AC-12).
 *
 * IGDB, unlike TMDB, takes a `where` beside `search` (confirmed live on
 * 2026-10-17), so every returned game meets every filter and the catalog rule,
 * and IGDB's own count is a truthful total. No `sort` is added, which keeps
 * IGDB's relevance order.
 */

/**
 * One page of a title search. The year becomes a UTC window on
 * `first_release_date`, as AC-12 fixes, so a game released late on 31
 * December in some timezone still counts for the year IGDB gives it.
 *
 * @param valid Checked by `validateSearchOptions` in `reads.ts`, before the
 * cache.
 */
export async function fetchSearchGames(
  valid: ValidSearchOptions,
): Promise<Paged<GameSummary>> {
  const where = sharedConditions(valid);
  if (valid.year !== undefined) {
    const from = Date.UTC(valid.year, 0, 1) / 1000;
    const to = Date.UTC(valid.year + 1, 0, 1) / 1000;
    where.push(
      cond.all([
        cond.atLeast("first_release_date", from),
        cond.below("first_release_date", to),
      ]),
    );
  }
  return readSummaryPage({ search: valid.query, where, page: valid.page });
}
