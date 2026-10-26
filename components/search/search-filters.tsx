import { Skeleton } from "@/components/skeleton";
import { parseLibraryTypeParam } from "@/lib/catalog/media-type";
import { getGameGenres, getGamePlatforms, IgdbError } from "@/lib/igdb";
import { gameSearchEnabled } from "@/lib/search/games-flag";
import {
  type CatalogRef,
  emptySearchParams,
  parseSearchParams,
} from "@/lib/search/params";
import { getMovieGenres, getTvGenres, TmdbError } from "@/lib/tmdb";

import { FilterBar } from "./filter-bar";

type RawParams = Record<string, string | string[] | undefined>;

/**
 * A genre or platform list, or null when its catalog could not supply it
 * (AC-19; spec 0029, AC-11).
 */
async function settleList(read: () => Promise<CatalogRef[]>) {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof TmdbError || error instanceof IgdbError)) {
      throw error;
    }
    return null;
  }
}

/**
 * The server half of the filter bar (spec 0010, AC-8, AC-19, AC-24).
 *
 * It reads the cached genre lists, of which the bar shows the one for the
 * navbar tab's type (feature 22), and the current UTC year, at request time,
 * for the year options. A list that fails leaves only its control disabled.
 * An invalid URL fills the bar with the valid type and nothing else; the
 * results panel below says what was wrong.
 *
 * A games search reads IGDB's genres and platforms instead of TMDB's genres,
 * and the games flag is read only for a raw `type=game` (spec 0029, AC-1).
 */
async function SearchFilters({ raw }: { raw: RawParams }) {
  const currentYear = new Date().getUTCFullYear();
  const gamesEnabled = gameSearchEnabled(raw.type);
  const type = parseLibraryTypeParam(raw.type, gamesEnabled) ?? "tv";

  if (type === "game") {
    const [genres, platforms] = await Promise.all([
      settleList(getGameGenres),
      settleList(getGamePlatforms),
    ]);
    const parsed = parseSearchParams(
      raw,
      { genres: genres ?? [], platforms: platforms ?? [] },
      currentYear,
      true,
    );
    return (
      <FilterBar
        initial={parsed.ok ? parsed.params : emptySearchParams(type)}
        genres={{ tv: null, movie: null, game: genres }}
        platforms={platforms}
        currentYear={currentYear}
      />
    );
  }

  const [tv, movie] = await Promise.all([
    settleList(getTvGenres),
    settleList(getMovieGenres),
  ]);
  const parsed = parseSearchParams(
    raw,
    { genres: (type === "movie" ? movie : tv) ?? [] },
    currentYear,
  );

  return (
    <FilterBar
      initial={parsed.ok ? parsed.params : emptySearchParams(type)}
      genres={{ tv, movie, game: null }}
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
