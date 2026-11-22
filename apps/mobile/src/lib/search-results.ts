import type { V1Search } from "@bestats/core/api/v1/browse";
import {
  formatPartialCount,
  formatResultCount,
} from "@bestats/core/search/count";
import {
  browseCountLine,
  emptyBrowseMessage,
  noMatchesMessage,
  scanEmptyMessage,
} from "@bestats/core/search/messages";
import type { SearchParams } from "@bestats/core/search/params";

import { joinPageResults } from "./page-results";

/**
 * What the search screen shows for the pages loaded so far, in the one form
 * that is true for the mode, as the web's results do (AGENTS.md section 10;
 * spec 0010, AC-11 to AC-15):
 *
 * - `results`: titles, under the browse heading, an exact or capped total,
 *   or, for a filtered title search, the partial line over every TMDB result
 *   range read so far (its total is never known).
 * - `scan_empty`: a filtered title search whose ranges so far kept nothing,
 *   said as such, since later results might match.
 * - `no_matches`: nothing matches the query or filters, or, with neither
 *   set, the catalog's Popular list is empty right now.
 */
export type SearchView =
  | { kind: "results"; countLine: string | null }
  | { kind: "scan_empty"; title: string; description: string }
  | { kind: "no_matches"; title: string; description: string };

/**
 * The view for `pages` (every page loaded, in order) of a search for
 * `params`. Pure, so the branching is tested apart from the screen; every
 * string comes from core's `search/messages`, so the phone says what the web
 * says (apps/mobile/AGENTS.md, copy comes from core). It counts the titles
 * `joinPageResults` keeps, the list the screen draws, so a title two pages
 * share counts once and the count matches the cards (AGENTS.md section 10).
 */
export function searchView(
  params: SearchParams,
  pages: readonly V1Search[],
  hasMore: boolean,
): SearchView {
  const first = pages[0];
  const results = joinPageResults(pages);
  const noMatches = (): SearchView => ({
    kind: "no_matches",
    ...noMatchesMessage(params),
  });

  if (first.mode === "browse" && results.length === 0) {
    return { kind: "no_matches", ...emptyBrowseMessage(params.type) };
  }
  if (
    first.total === 0 ||
    (first.mode !== "filtered_search" && results.length === 0)
  ) {
    return noMatches();
  }

  if (first.mode === "filtered_search") {
    const last = pages[pages.length - 1];
    const fromIndex = first.scanned?.fromIndex ?? 1;
    const toIndex = last.scanned?.toIndex ?? 0;
    if (results.length === 0) {
      return {
        kind: "scan_empty",
        ...scanEmptyMessage({
          fromIndex,
          toIndex,
          query: params.q ?? "",
          hasMore,
        }),
      };
    }
    return {
      kind: "results",
      countLine: formatPartialCount({
        matches: results.length,
        fromIndex,
        toIndex,
        totalResults: first.total ?? 0,
        query: params.q ?? "",
      }),
    };
  }

  if (first.mode === "browse") {
    return {
      kind: "results",
      countLine: browseCountLine(params.type),
    };
  }
  return {
    kind: "results",
    countLine:
      first.total === null
        ? null
        : formatResultCount(
            first.total,
            params.type,
            params.type === "game"
              ? "igdb"
              : first.mode === "discover"
                ? "discover"
                : "search",
          ),
  };
}
