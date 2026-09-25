import type { SearchParams } from "./params";

/**
 * How `/search` answers a URL (spec 0010, state transitions table).
 *
 * - `browse`: nothing set, popular titles from discover.
 * - `discover`: no query, any filter, all of them sent to discover.
 * - `search`: a query and at most a year, which search accepts upstream.
 * - `filtered_search`: a query with a genre or a rating. Search ignores both,
 *   so the server checks every result itself (AC-13).
 */
export type SearchMode = "browse" | "discover" | "search" | "filtered_search";

/** The mode is a pure function of the parsed URL, never of client state. */
export function searchMode(params: SearchParams): SearchMode {
  const localFilters = params.genreIds.length > 0 || params.rating !== null;
  if (params.q === null) {
    return localFilters || params.year !== null ? "discover" : "browse";
  }
  return localFilters ? "filtered_search" : "search";
}
