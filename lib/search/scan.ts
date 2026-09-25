import "server-only";

import { lastReachablePage } from "@/lib/catalog/pages";

import {
  MIN_VOTE_COUNT,
  SCAN_MAX_PAGES,
  SCAN_TARGET,
  TMDB_PAGE_SIZE,
} from "./constants";
import type { SearchParams } from "./params";
import { readSearchPage, type SearchPage, type SearchResult } from "./read";

/**
 * True when a search result meets every filter TMDB's search endpoint ignores
 * (spec 0010, AC-10, AC-13): it carries all the selected genres, and, with a
 * rating set, TMDB rates it at least that from at least 100 votes. A title
 * TMDB has no rating for fails any rating filter.
 */
export function matchesFilters(
  result: Pick<SearchResult, "genreIds" | "tmdbRating" | "tmdbVoteCount">,
  params: Pick<SearchParams, "genreIds" | "rating">,
): boolean {
  if (!params.genreIds.every((id) => result.genreIds.includes(id))) {
    return false;
  }
  if (params.rating !== null) {
    if (result.tmdbRating === null || result.tmdbRating < params.rating) {
      return false;
    }
    if (result.tmdbVoteCount < MIN_VOTE_COUNT) return false;
  }
  return true;
}

export type FilteredScan =
  | { kind: "no_such_page" }
  | {
      kind: "ok";
      /** Every kept result from the pages read, in TMDB order. */
      results: SearchResult[];
      /** The first and last TMDB result index this page read, 1 based. */
      fromIndex: number;
      toIndex: number;
      /** TMDB's unfiltered search total, from the first page read. */
      totalResults: number;
      /** The TMDB page the `More results` cursor points at, if any. */
      nextPage: number | null;
    };

type ReadPage = (page: number) => Promise<SearchPage>;

/**
 * Filtered search: a title query combined with a genre or a rating
 * (spec 0010, AC-13, AC-14, AC-18).
 *
 * TMDB's search endpoint takes the query and the year but ignores genres and
 * ratings, so its pages are read here and every result is checked with
 * `matchesFilters`; nothing that fails a filter is returned.
 *
 * `params.page` is a TMDB page cursor, not a results page number. That page is
 * read alone first, which settles whether it exists before anything else is
 * fetched. When it keeps fewer than 20 results, the rest of the 5 page budget
 * (clipped to the last page TMDB serves) is requested at once, at most 4
 * requests and so inside the module's concurrency cap of 8, then consumed in
 * page order, whole pages only, stopping after the page that reaches 20. Whole
 * pages are what keep the cursor from skipping or repeating a result.
 *
 * A later page that fails only matters if the scan reaches it: if an earlier
 * page already filled the target, its failure is ignored.
 *
 * @param params The parsed URL, in `filtered_search` mode, so `q` is set.
 * @param readPage Reads one TMDB search page. Tests pass fixtures; the page
 * uses the cached module read.
 * @throws {TmdbError} When a page the scan needs cannot be read.
 */
export async function scanFilteredSearch(
  params: SearchParams,
  readPage: ReadPage = (page) =>
    readSearchPage(params.type, params.q ?? "", {
      year: params.year ?? undefined,
      page,
    }),
): Promise<FilteredScan> {
  const start = params.page;
  const first = await readPage(start);
  const lastPage = lastReachablePage(first.totalPages);
  // Page 1 of a search with no results at all is an empty page, not a
  // missing one.
  if (start > Math.max(lastPage, 1)) return { kind: "no_such_page" };

  const results = first.results.filter((result) =>
    matchesFilters(result, params),
  );
  let lastRead = start;

  const budgetEnd = Math.min(start + SCAN_MAX_PAGES - 1, lastPage);
  if (results.length < SCAN_TARGET && budgetEnd > start) {
    const pageNumbers = Array.from(
      { length: budgetEnd - start },
      (_, index) => start + 1 + index,
    );
    const settled = await Promise.allSettled(pageNumbers.map(readPage));
    for (const [index, outcome] of settled.entries()) {
      if (outcome.status === "rejected") throw outcome.reason;
      for (const result of outcome.value.results) {
        if (matchesFilters(result, params)) results.push(result);
      }
      lastRead = pageNumbers[index];
      if (results.length >= SCAN_TARGET) break;
    }
  }

  return {
    kind: "ok",
    results,
    fromIndex: (start - 1) * TMDB_PAGE_SIZE + 1,
    toIndex: Math.min(lastRead * TMDB_PAGE_SIZE, first.totalResults),
    totalResults: first.totalResults,
    nextPage: lastRead + 1 <= lastPage ? lastRead + 1 : null,
  };
}
