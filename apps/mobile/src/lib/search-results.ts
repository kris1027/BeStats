import type { V1Search } from "@bestats/core/api/v1/browse";
import { CATALOG_SOURCES } from "@bestats/core/catalog/media-type";
import {
  formatPartialCount,
  formatRange,
  formatResultCount,
  mediaNoun,
} from "@bestats/core/search/count";
import type { SearchParams } from "@bestats/core/search/params";

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
 * - `no_matches`: nothing matches the query or filters.
 * - `no_popular_games`: IGDB's Popular list is empty right now.
 */
export type SearchView =
  | { kind: "results"; countLine: string | null }
  | { kind: "scan_empty"; title: string; description: string }
  | { kind: "no_matches"; title: string; description: string }
  | { kind: "no_popular_games" };

/** What to loosen when filters match nothing (the web's `FILTERED_HINTS`). */
const FILTERED_HINT = "Try fewer genres, another year or a lower rating.";

/**
 * The view for `pages` (every page loaded, in order) of a search for
 * `params`. Pure, so the copy is tested apart from the screen.
 */
export function searchView(
  params: SearchParams,
  pages: readonly V1Search[],
  hasMore: boolean,
): SearchView {
  const first = pages[0];
  const results = pages.flatMap((page) => page.results);
  const noun = mediaNoun(params.type);
  const filtered =
    params.genreIds.length > 0 ||
    params.year !== null ||
    params.rating !== null;

  if (first.mode === "browse" && results.length === 0) {
    return params.type === "game" ? { kind: "no_popular_games" } : noMatches();
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
        title: `No matches in TMDB results ${formatRange(fromIndex, toIndex)}`,
        description: `None of these results for “${params.q}” fit your filters.${hasMore ? " Later results might." : ""}`,
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
      countLine: `Popular ${noun} on ${CATALOG_SOURCES[params.type]}`,
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

  function noMatches(): SearchView {
    return {
      kind: "no_matches",
      title: filtered
        ? `No ${noun} match these filters`
        : `No ${noun} match “${params.q}”`,
      description: filtered
        ? FILTERED_HINT
        : "Check the spelling, or try a shorter title.",
    };
  }
}
