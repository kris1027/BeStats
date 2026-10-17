import "server-only";
import { cond, type Sort } from "./query";
import { readSummaryPage, sharedConditions, unixDay } from "./summary-page";
import type {
  DiscoverGamesOptions,
  DiscoverSort,
  GameSummary,
  Paged,
} from "./types";
import { validateDiscoverOptions } from "./validation";

/**
 * Filtered browsing with an explicit order, which G6's rows and G7's filters
 * only browse need (spec 0023, AC-13).
 *
 * A sort also requires its field, so an undated or unrated game never sorts to
 * the top. The date window is UTC days, both ends inclusive, and the caller
 * passes them: this module never reads the clock for a filter. IGDB takes one
 * sort key, so ties can repeat or skip an item across pages; that is accepted.
 */

const SORT: Record<DiscoverSort, Sort> = {
  rating_desc: { field: "rating", direction: "desc" },
  rating_count_desc: { field: "rating_count", direction: "desc" },
  release_desc: { field: "first_release_date", direction: "desc" },
  release_asc: { field: "first_release_date", direction: "asc" },
  hypes_desc: { field: "hypes", direction: "desc" },
};

const DAY_SECONDS = 24 * 60 * 60;

/**
 * @throws {IgdbValidationError} On a bad option, before any request.
 */
export async function fetchDiscoverGames(
  options: DiscoverGamesOptions,
): Promise<Paged<GameSummary>> {
  const valid = validateDiscoverOptions(options);
  const sort = SORT[valid.sort];
  const where = sharedConditions(valid);

  if (valid.releasedFrom !== undefined) {
    where.push(cond.atLeast("first_release_date", unixDay(valid.releasedFrom)));
  }
  if (valid.releasedTo !== undefined) {
    where.push(
      cond.below("first_release_date", unixDay(valid.releasedTo) + DAY_SECONDS),
    );
  }
  if (valid.minRatingCount !== undefined) {
    where.push(cond.atLeast("rating_count", valid.minRatingCount));
  }
  if (valid.minHypes !== undefined) {
    where.push(cond.atLeast("hypes", valid.minHypes));
  }
  where.push(cond.notNull(sort.field));

  return readSummaryPage({
    where,
    sort,
    page: valid.page,
  });
}
