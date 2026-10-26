import type {
  GameSearchParams,
  SearchParams,
  TmdbSearchParams,
} from "./params";

/**
 * How `/search` answers a URL (spec 0010, state transitions table).
 *
 * - `browse`: nothing set, popular titles from discover.
 * - `discover`: no query, any filter, all of them sent to discover.
 * - `search`: a query and at most a year, which search accepts upstream.
 * - `filtered_search`: a query with a genre or a rating. Search ignores both,
 *   so the server checks every result itself (AC-13).
 *
 * A games search never filters locally: IGDB applies every filter beside the
 * query, so it is `search` whenever `q` is set (spec 0029, AC-3).
 */
export type SearchMode = "browse" | "discover" | "search" | "filtered_search";

/** The modes a games search can be in, so its read never meets `filtered_search`. */
export type GameSearchMode = Exclude<SearchMode, "filtered_search">;

/**
 * The mode is a pure function of the parsed URL, never of client state. A
 * games search's return type leaves out `filtered_search`, so its caller
 * needs no runtime guard against it (spec 0029, AC-1, AC-3).
 */
export function searchMode(params: GameSearchParams): GameSearchMode;
export function searchMode(params: TmdbSearchParams): SearchMode;
export function searchMode(params: SearchParams): SearchMode;
export function searchMode(params: SearchParams): SearchMode {
  switch (params.type) {
    case "game":
      return gameSearchMode(params);
    case "tv":
    case "movie":
      return tmdbSearchMode(params);
  }
}

function gameSearchMode(params: GameSearchParams): GameSearchMode {
  if (params.q !== null) return "search";
  const anyFilter =
    params.genreIds.length > 0 ||
    params.platformIds.length > 0 ||
    params.year !== null ||
    params.rating !== null;
  return anyFilter ? "discover" : "browse";
}

function tmdbSearchMode(params: TmdbSearchParams): SearchMode {
  const localFilters = params.genreIds.length > 0 || params.rating !== null;
  if (params.q === null) {
    return localFilters || params.year !== null ? "discover" : "browse";
  }
  return localFilters ? "filtered_search" : "search";
}
