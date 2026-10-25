import { IGDB_LIST_PAGE_SIZE } from "@/lib/igdb/constants";
import type { DiscoverGamesOptions, PopularGamesKind } from "@/lib/igdb/types";

import type { GameListSlug } from "./lists";

/**
 * Where each games list comes from (spec 0028, AC-2): the two popularity
 * lists by their IGDB popularity kind, the other three as `discoverGames`
 * options. Pure and free of `server-only`, so the tests and the proxy side
 * of `lib/catalog/` can import it; it reads no clock, the caller passes
 * `today`.
 */

/** The lists read from IGDB's popularity primitives. */
export const POPULAR_GAME_LISTS = {
  trending: "trending",
  popular: "popular",
} as const satisfies Partial<Record<GameListSlug, PopularGamesKind>>;

export type PopularGameListSlug = keyof typeof POPULAR_GAME_LISTS;
export type DiscoverGameListSlug = Exclude<GameListSlug, PopularGameListSlug>;

/** Recently released reaches back this many days before today, inclusive. */
const RECENT_DAYS_BACK = 59;

/** Coming soon reaches this many days past today. */
const COMING_SOON_DAYS = 120;

/** Top rated counts only games with at least this many ratings. */
const TOP_RATED_MIN_RATINGS = 100;

/** True for a slug read from popularity rather than discover. */
export function isPopularGameList(
  slug: GameListSlug,
): slug is PopularGameListSlug {
  return slug in POPULAR_GAME_LISTS;
}

/** The UTC day `days` after `day` (before it when negative), `YYYY-MM-DD`. */
export function shiftUtcDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The `discoverGames` options of a discover list for one UTC day (spec 0028,
 * AC-2). Both windows are inclusive: Recently released is `today − 59` to
 * `today`, 60 days, and Coming soon `today + 1` to `today + 120`. Because the
 * day is in the options, a landing section and its list page share one cache
 * entry within a UTC day.
 *
 * @param today The current UTC day, read after `connection()` by the caller.
 */
export function gameListOptions(
  slug: DiscoverGameListSlug,
  today: string,
): DiscoverGamesOptions {
  switch (slug) {
    case "recently-released":
      return {
        sort: "hypes_desc",
        minHypes: 1,
        releasedFrom: shiftUtcDay(today, -RECENT_DAYS_BACK),
        releasedTo: today,
        pageSize: IGDB_LIST_PAGE_SIZE,
      };
    case "coming-soon":
      return {
        sort: "hypes_desc",
        minHypes: 1,
        releasedFrom: shiftUtcDay(today, 1),
        releasedTo: shiftUtcDay(today, COMING_SOON_DAYS),
        pageSize: IGDB_LIST_PAGE_SIZE,
      };
    case "top-rated":
      return {
        sort: "rating_desc",
        minRatingCount: TOP_RATED_MIN_RATINGS,
        pageSize: IGDB_LIST_PAGE_SIZE,
      };
  }
}
