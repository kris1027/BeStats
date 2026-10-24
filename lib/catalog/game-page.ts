import { isMovieReleased, movieReleaseNote } from "@/lib/catalog/movie-page";

/**
 * Whether a game can be Playing, Finished or scored yet (`AGENTS.md`
 * "Games", spec 0026, AC-8, AC-9).
 *
 * The movie rule exactly, so a game and a movie flip on the same UTC day: out
 * from the UTC day of IGDB's `first_release_date`, and a missing date counts
 * as not released. It delegates rather than copies, so the two can never
 * drift, and G5 and G8 reuse it for the library and the cards.
 *
 * @param releaseDate `Game.releaseDate`, the UTC day of IGDB's
 * `first_release_date` (spec 0023).
 * @param today The UTC day, read once: `requestTodayUtc()` in a render,
 * `todayUtc(new Date())` in a Server Action.
 */
export function isGameReleased(
  releaseDate: string | null,
  today: string,
): boolean {
  return isMovieReleased(releaseDate, today);
}

/**
 * The line an unreleased game shows under its status pills: "Releases Oct
 * 24, 2026", or "Release date to be announced" with no date. The movie
 * page's copy, so the two read alike.
 *
 * @param releaseDate `Game.releaseDate`.
 */
export function gameReleaseNote(releaseDate: string | null): string {
  return movieReleaseNote(releaseDate);
}
