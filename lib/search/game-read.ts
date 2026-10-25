import "server-only";

import { sliceGamePage } from "@/lib/catalog-list-read";
import {
  discoverGames,
  type GameSummary,
  getPopularGames,
  type Paged,
  type SearchGamesOptions,
  searchGames,
} from "@/lib/igdb";
import { IGDB_LIST_PAGE_SIZE } from "@/lib/igdb/constants";

import { GAME_MIN_RATING_COUNT } from "./constants";
import type { SearchMode } from "./mode";
import type { GameSearchParams } from "./params";

/**
 * One 24 game page of a games search, in the mode the URL decides (spec 0029,
 * AC-3 to AC-6).
 *
 * Every filter goes into the IGDB query, so every game returned meets every
 * filter and the count is IGDB's own; nothing is filtered here. Browse reads
 * the cached Popular list `/games/popular` reads and slices it, so the two
 * share one cache entry and no clock is read. Discover puts the most rated
 * games first and keeps the unrated ones after them, so the count includes
 * them. Search keeps IGDB's relevance order. A rating brings the 10 rating
 * floor with it in both.
 *
 * The caller refuses a page above IGDB's 50 before calling this.
 *
 * @throws {IgdbError} When IGDB fails; the results panel catches it.
 */
export async function readGameSearchPage(
  mode: Exclude<SearchMode, "filtered_search">,
  params: GameSearchParams,
): Promise<Paged<GameSummary>> {
  if (mode === "browse") {
    return sliceGamePage(await getPopularGames("popular"), params.page);
  }

  const filters: Omit<SearchGamesOptions, "query" | "year"> = {
    genreIds: params.genreIds,
    platformIds: params.platformIds,
    ...(params.rating !== null && {
      minRating: params.rating,
      minRatingCount: GAME_MIN_RATING_COUNT,
    }),
    page: params.page,
    pageSize: IGDB_LIST_PAGE_SIZE,
  };

  if (mode === "search") {
    return searchGames({
      ...filters,
      query: params.q ?? "",
      year: params.year ?? undefined,
    });
  }

  return discoverGames({
    ...filters,
    ...(params.year !== null && {
      releasedFrom: `${params.year}-01-01`,
      releasedTo: `${params.year}-12-31`,
    }),
    sort: "rating_count_desc",
    requireSortField: false,
  });
}
