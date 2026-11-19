import { CATALOG_SOURCES } from "../catalog/media-type";
import { formatRange, mediaNoun } from "./count";
import type { SearchParams, SearchType } from "./params";

/** A titled empty state, as both apps' state panels take it. */
export type SearchMessage = { title: string; description: string };

/**
 * What to loosen when filters match nothing; games have platforms too
 * (spec 0029, AC-13). Lives here so the web and the phone give the same
 * advice (packages/core/AGENTS.md, a rule lives in one package).
 */
export const FILTERED_HINTS = {
  tv: "Try fewer genres, another year or a lower rating.",
  movie: "Try fewer genres, another year or a lower rating.",
  game: "Try fewer genres or platforms, another year or a lower rating.",
} as const satisfies Record<SearchType, string>;

/**
 * True when a filter beyond the title query is set. It decides which of the
 * two empty answers of AC-15 a search gives (AGENTS.md section 10; spec 0010,
 * AC-15), so both apps must count platforms the same way.
 */
export function hasFilter(params: SearchParams): boolean {
  return (
    params.genreIds.length > 0 ||
    params.platformIds.length > 0 ||
    params.year !== null ||
    params.rating !== null
  );
}

/**
 * The empty state for a search nothing matches: by query alone, or by its
 * filters (AGENTS.md section 10; spec 0010, AC-15). One copy for both apps,
 * so the phone never drifts from the web's wording.
 */
export function noMatchesMessage(params: SearchParams): SearchMessage {
  const noun = mediaNoun(params.type);
  return hasFilter(params)
    ? {
        title: `No ${noun} match these filters`,
        description: FILTERED_HINTS[params.type],
      }
    : {
        title: `No ${noun} match “${params.q}”`,
        description: "Check the spelling, or try a shorter title.",
      };
}

/**
 * The empty state when a catalog's Popular list comes back empty: there is no
 * query to name and nothing to loosen, so it says the list is empty rather
 * than that a search failed (AGENTS.md section 10; spec 0029, AC-4). One copy
 * for both apps.
 */
export function emptyBrowseMessage(type: SearchType): SearchMessage {
  const noun = mediaNoun(type);
  return {
    title: `No popular ${noun} right now`,
    description: `${CATALOG_SOURCES[type]} lists no popular ${noun} at the moment.`,
  };
}

/**
 * The empty state for a filtered title search whose results read so far kept
 * nothing. It names the range checked rather than claiming nothing matches,
 * since later results might (AGENTS.md section 10; spec 0010, AC-15).
 *
 * @param hasMore Whether later TMDB results remain to be checked.
 */
export function scanEmptyMessage({
  fromIndex,
  toIndex,
  query,
  hasMore,
}: {
  fromIndex: number;
  toIndex: number;
  query: string;
  hasMore: boolean;
}): SearchMessage {
  return {
    title: `No matches in TMDB results ${formatRange(fromIndex, toIndex)}`,
    description: `None of these results for “${query}” fit your filters.${hasMore ? " Later results might." : ""}`,
  };
}

/**
 * The count line of an unqueried, unfiltered search, which shows a catalog's
 * Popular list and names its source (AGENTS.md section 9, community data is
 * labelled; spec 0010, AC-3).
 */
export function browseCountLine(type: SearchType): string {
  return `Popular ${mediaNoun(type)} on ${CATALOG_SOURCES[type]}`;
}
