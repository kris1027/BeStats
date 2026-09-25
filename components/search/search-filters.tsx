import { Skeleton } from "@/components/skeleton";
import {
  emptySearchParams,
  parseSearchParams,
  parseSearchType,
} from "@/lib/search/params";
import { type Genre, getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";

import { FilterBar } from "./filter-bar";

type RawParams = Record<string, string | string[] | undefined>;

/** A genre list, or null when TMDB could not supply it (AC-19). */
async function settleGenres(read: () => Promise<Genre[]>) {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return null;
  }
}

/**
 * The server half of the filter bar (spec 0010, AC-8, AC-19, AC-24).
 *
 * It reads both cached genre lists, because switching type maps the selected
 * genres onto the other list, and the current UTC year, at request time, for
 * the year options. A genre list that fails leaves only the genre control
 * disabled. An invalid URL fills the bar with the valid type and nothing
 * else; the results panel below says what was wrong.
 */
async function SearchFilters({ raw }: { raw: RawParams }) {
  const [tv, movie] = await Promise.all([
    settleGenres(getTvGenres),
    settleGenres(getMovieGenres),
  ]);
  const currentYear = new Date().getUTCFullYear();
  const type = parseSearchType(raw.type) ?? "tv";
  const parsed = parseSearchParams(
    raw,
    (type === "movie" ? movie : tv) ?? [],
    currentYear,
  );

  return (
    <FilterBar
      initial={parsed.ok ? parsed.params : emptySearchParams(type)}
      genres={{ tv, movie }}
      currentYear={currentYear}
    />
  );
}

/** The filter bar's footprint while it streams (AC-21). */
function SearchFiltersSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-center gap-3">
      <Skeleton shape="pill" className="h-11 w-full md:h-9 md:w-80" />
      <Skeleton shape="pill" className="h-11 w-44 md:h-9" />
      <Skeleton shape="pill" className="h-11 w-28 md:h-9" />
      <Skeleton shape="pill" className="h-11 w-32 md:h-9" />
      <Skeleton shape="pill" className="h-11 w-40 md:h-9" />
    </div>
  );
}

export { SearchFilters, SearchFiltersSkeleton };
