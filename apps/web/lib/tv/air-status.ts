import { parseTmdbDate } from "@/lib/format";

/**
 * Whether an episode can be tracked yet (spec 0011, AC-3).
 *
 * `aired` and `upcoming` compare TMDB's calendar date with today in UTC.
 * `unknown` is no date at all, or a value that is not a real `YYYY-MM-DD` day:
 * such an episode is never treated as aired by a bulk action and never as
 * future by a single one, because the source says nothing either way
 * (`AGENTS.md` section 9).
 */
export type AirStatus = "aired" | "upcoming" | "unknown";

/**
 * Today as TMDB writes dates, `YYYY-MM-DD`, in UTC.
 *
 * TMDB gives an air date with no time or zone, so there is no precise local
 * release moment to compare with. UTC is the one reference every server
 * agrees on; the cost (an evening premiere in the Americas is markable a few
 * hours early) is accepted in spec 0011. Callers read the clock once per
 * request, never inside a `use cache` scope, or a cached page would freeze the
 * day it was rendered.
 *
 * @param now The current instant.
 */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The air status of one episode. The only place this rule exists: the season
 * page, every action and later features 14 to 16 all call it.
 *
 * @param airDate TMDB's `air_date`, unchanged.
 * @param today The result of `todayUtc`.
 */
export function airStatus(airDate: string | null, today: string): AirStatus {
  if (parseTmdbDate(airDate) === null || airDate === null) return "unknown";
  // Both are strict `YYYY-MM-DD` with a four digit year, so the string order
  // is the date order.
  return airDate <= today ? "aired" : "upcoming";
}
