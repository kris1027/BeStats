import type { Paged } from "@/lib/tmdb/types";

import { lastReachablePage, TMDB_MAX_PAGE, TMDB_PAGE_SIZE } from "./pages";

/**
 * Titles on one page of every paged `catalog` grid (spec 0022, AC-21). 24
 * divides by each of the grid's 2, 3, 4 and 6 columns, so a full page fills
 * every row at every width (AC-22).
 */
export const GRID_PAGE_SIZE = 24;

/**
 * The TMDB pages that hold grid page `page`, and how many results of the
 * first one come before it (spec 0022, AC-21).
 *
 * A 24 title window over 20 result pages always spans exactly two of them:
 * it starts at most 16 into the first, so it ends inside the second. A page
 * past TMDB's 500 is dropped rather than requested, because TMDB refuses it;
 * that leaves one page for grid page 417 and none past it, which is how grid
 * pages 418 to 500 come back empty and read as "no such page".
 */
export function gridPageWindow(page: number): {
  tmdbPages: number[];
  skip: number;
} {
  const first = (page - 1) * GRID_PAGE_SIZE;
  const from = Math.floor(first / TMDB_PAGE_SIZE) + 1;
  const tmdbPages = [from, from + 1].filter(
    (tmdbPage) => tmdbPage <= TMDB_MAX_PAGE,
  );
  return { tmdbPages, skip: first % TMDB_PAGE_SIZE };
}

/**
 * The last grid page a list reaches (spec 0022, AC-21): only results on the
 * TMDB pages it serves count, so a 10,000 result list ends at page 417 with
 * its 16 titles rather than hiding them.
 */
export function lastGridPage(totalResults: number, totalPages: number): number {
  const reachable = Math.min(
    totalResults,
    lastReachablePage(totalPages) * TMDB_PAGE_SIZE,
  );
  return Math.ceil(reachable / GRID_PAGE_SIZE);
}

/**
 * Cuts grid page `page` out of the TMDB pages `gridPageWindow` named, in
 * order (spec 0022, AC-21).
 *
 * Each TMDB page is cut by its own positions, never by a running count over
 * both: two grid pages that share a TMDB page then split that very array, so
 * nothing is skipped even when a page came back short (an adult title dropped
 * by the list read). A title TMDB returns on both pages, which its popularity
 * order does at page edges, is kept once (a grid keys its cards by id), and
 * the gap it leaves is filled from the results already read past the window,
 * so the page stays full (AC-22). The filler also opens the next page, the
 * same repeat TMDB itself served; with nothing read past the window the page
 * stays one short. `totalPages` becomes the grid's own page count, already
 * capped, and `totalResults` stays TMDB's count from the first read.
 */
export function combineGridPage<T extends { id: number }>(
  page: number,
  reads: Paged<T>[],
): Paged<T> {
  const { tmdbPages } = gridPageWindow(page);
  const firstIndex = (page - 1) * GRID_PAGE_SIZE;
  const endIndex = firstIndex + GRID_PAGE_SIZE;
  const seen = new Set<number>();
  const results: T[] = [];
  const spare: T[] = [];
  for (const [index, read] of reads.entries()) {
    const offset = (tmdbPages[index] - 1) * TMDB_PAGE_SIZE;
    const start = Math.max(firstIndex - offset, 0);
    const end = endIndex - offset;
    for (const result of read.results.slice(start, end)) {
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      results.push(result);
    }
    spare.push(...read.results.slice(Math.max(end, start)));
  }
  for (const result of spare) {
    if (results.length >= GRID_PAGE_SIZE) break;
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    results.push(result);
  }
  const first = reads[0];
  const totalResults = first?.totalResults ?? 0;
  return {
    page,
    results,
    totalPages: lastGridPage(totalResults, first?.totalPages ?? 0),
    totalResults,
  };
}

/**
 * Reads grid page `page` through any cached TMDB page read (spec 0022,
 * AC-21): both TMDB pages in parallel, so neighbouring grid pages share one
 * cache entry. A failure on either half rejects with the read's own error,
 * so the caller shows its usual error panel rather than half a page.
 *
 * Pure apart from the read it is handed, so the proxy rule for `lib/catalog/`
 * holds: no TMDB import here.
 */
export async function readGridPage<T extends { id: number }>(
  page: number,
  readTmdbPage: (tmdbPage: number) => Promise<Paged<T>>,
): Promise<Paged<T>> {
  const { tmdbPages } = gridPageWindow(page);
  const reads = await Promise.all(
    tmdbPages.map((tmdbPage) => readTmdbPage(tmdbPage)),
  );
  return combineGridPage(page, reads);
}
