import { DISCOVER_COUNT_CAP, SEARCH_COUNT_CAP } from "./constants";
import type { SearchType } from "./params";

/** Which TMDB endpoint a total came from, since each caps it differently. */
export type CountEndpoint = "search" | "discover";

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * A TMDB total as the number a person can trust (spec 0010, AC-3, AC-12).
 *
 * Below its endpoint's cap the total is exact. At the cap it is only a floor,
 * so it reads `10,000+` for search and `20,000+` for discover rather than a
 * number TMDB never really counted. Discover's cap is one past 20,000, which is
 * why its floor is written as the round figure.
 *
 * @param total TMDB's `total_results`.
 * @param endpoint The endpoint the total came from.
 * @returns `1,234` or `10,000+`, with no noun.
 */
export function formatTotal(total: number, endpoint: CountEndpoint): string {
  if (endpoint === "search" && total >= SEARCH_COUNT_CAP) {
    return `${numberFormat.format(SEARCH_COUNT_CAP)}+`;
  }
  if (endpoint === "discover" && total >= DISCOVER_COUNT_CAP) {
    return `${numberFormat.format(DISCOVER_COUNT_CAP - 1)}+`;
  }
  return numberFormat.format(total);
}

/**
 * The count line for quick search and the exact modes of `/search`:
 * `1 show`, `1,234 movies`, `10,000+ shows` (spec 0010, AC-3, AC-12).
 *
 * @param total TMDB's `total_results`.
 * @param type Which noun to use.
 * @param endpoint The endpoint the total came from.
 */
export function formatResultCount(
  total: number,
  type: SearchType,
  endpoint: CountEndpoint,
): string {
  const text = formatTotal(total, endpoint);
  return `${text} ${mediaNoun(type, text === "1")}`;
}

/**
 * The partial count line for filtered search, which never knows the filtered
 * total: `12 matches in TMDB results 1–100 of 1,112 for “dune”`
 * (spec 0010, AC-14). The range is what this page read, and the total is
 * TMDB's unfiltered search total, labelled as such.
 */
export function formatPartialCount({
  matches,
  fromIndex,
  toIndex,
  totalResults,
  query,
}: {
  matches: number;
  fromIndex: number;
  toIndex: number;
  totalResults: number;
  query: string;
}): string {
  const noun = matches === 1 ? "match" : "matches";
  return `${numberFormat.format(matches)} ${noun} in TMDB results ${formatRange(fromIndex, toIndex)} of ${formatTotal(totalResults, "search")} for “${query}”`;
}

/** `1–100`, with an en dash, as AC-14 and AC-15 write it. */
export function formatRange(fromIndex: number, toIndex: number): string {
  return `${numberFormat.format(fromIndex)}–${numberFormat.format(toIndex)}`;
}

/** `show` or `movies`, the noun every search message uses. */
export function mediaNoun(type: SearchType, singular = false): string {
  if (type === "movie") return singular ? "movie" : "movies";
  return singular ? "show" : "shows";
}
