import { getGameGenres, getGamePlatforms, IgdbError } from "@/lib/igdb";
import type { GameLists } from "@/lib/search/params";
import { TmdbError } from "@/lib/tmdb";

/**
 * A genre or platform list, or null when its catalog could not supply it,
 * so a URL that does not need the list still works (spec 0010, AC-19; spec
 * 0029, AC-11). Any other error is a bug and still throws.
 *
 * No `server-only` line of its own: the TMDB and IGDB modules it reads
 * already carry one, and leaving it out lets component tests mock them.
 */
export async function settleList<T>(
  read: () => Promise<T[]>,
): Promise<T[] | null> {
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
 * IGDB's cached genre and platform lists, each settled on its own, as both
 * the filter bar and the results read them, so the two agree within one
 * render (spec 0029, AC-11).
 */
export async function readGameLists(): Promise<GameLists> {
  const [genres, platforms] = await Promise.all([
    settleList(getGameGenres),
    settleList(getGamePlatforms),
  ]);
  return { genres, platforms };
}
