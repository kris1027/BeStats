import {
  IGDB_MAX_FILTER_IDS,
  IGDB_MAX_PAGE,
  IGDB_MIN_YEAR,
} from "@/lib/igdb/constants";

import { MIN_YEAR } from "./constants";
import type { CountEndpoint } from "./count";
import type { SearchType } from "./params";

type SearchCatalog = {
  /** The earliest year the year filter offers (spec 0010, AC-7; spec 0029, AC-2). */
  minYear: number;
  /**
   * The most genre or platform ids one filter takes, or null when the
   * catalog sets no cap (spec 0029, AC-2, AC-10).
   */
  maxFilterIds: number | null;
  /** The last results page a search may ask for, or null for no cap (spec 0029, AC-12). */
  maxPage: number | null;
  /** The endpoint a quick search total comes from (spec 0029, AC-16). */
  quickCountEndpoint: CountEndpoint;
};

/**
 * What differs between the three catalogs `/search` covers, in one map, so
 * a new rule is one more field rather than another `type === "game"` branch
 * scattered across the parser, the filter bar and quick search. `satisfies`
 * keeps it exhaustive, so a new type fails to compile until it has an entry
 * (spec 0029, AC-1).
 *
 * Pure, and the one place search code outside `lib/igdb/` reads IGDB's
 * limits, so no component imports the IGDB module (lib/igdb/AGENTS.md, What
 * lives where).
 */
export const SEARCH_CATALOGS = {
  tv: {
    minYear: MIN_YEAR,
    maxFilterIds: null,
    maxPage: null,
    quickCountEndpoint: "search",
  },
  movie: {
    minYear: MIN_YEAR,
    maxFilterIds: null,
    maxPage: null,
    quickCountEndpoint: "search",
  },
  game: {
    minYear: IGDB_MIN_YEAR,
    maxFilterIds: IGDB_MAX_FILTER_IDS,
    maxPage: IGDB_MAX_PAGE,
    quickCountEndpoint: "igdb",
  },
} as const satisfies Record<SearchType, SearchCatalog>;
