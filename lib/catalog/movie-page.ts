import type { LibraryList } from "@/lib/catalog/library-list";
import { formatAirDate } from "@/lib/format";
import { airStatus } from "@/lib/tv/air-status";

/** The library pages a movie can sit on (spec 0020, AC-13). */
export type MoviePage = LibraryList;

/** The user's own state for one movie, and the release date TMDB gives. */
export type MoviePlacement = {
  releaseDate: string | null;
  inWatchlist: boolean;
  watchedAt: string | null;
};

/**
 * Which library page a movie belongs on (spec 0020, AC-13, AC-14), or null
 * when it is on none: neither watched nor planned. Pure, like `classifyShow`.
 *
 * Watched wins over the plan, so a movie that is both shows only on Watched,
 * and unmarking it puts it straight back where the plan places it. A planned
 * movie is on Watchlist from its release day (the UTC day `airStatus` uses
 * for episodes) and on Upcoming before it, or when TMDB gives no real date
 * ("Date TBA").
 *
 * @param movie The stored state, with `releaseDate` from `getMovie`.
 * @param today `requestTodayUtc()`, read once per request (AC-22).
 */
export function classifyMovie(
  movie: MoviePlacement,
  today: string,
): MoviePage | null {
  if (movie.watchedAt !== null) return "watched";
  if (!movie.inWatchlist) return null;
  return isMovieReleased(movie.releaseDate, today) ? "watchlist" : "upcoming";
}

/**
 * Whether a movie can be marked watched or scored yet
 * (prompts/movie-release-gate.md, `AGENTS.md` section 7).
 *
 * The same test `classifyMovie` places a planned movie on Watchlist by, so a
 * movie is markable exactly when it sits there. Unlike an episode, a missing
 * or malformed date counts as not released: a dateless movie is almost always
 * announced or in production, and the source gives no reason to believe it is
 * out.
 *
 * @param releaseDate `Movie.releaseDate`, TMDB's primary release date.
 * @param today The UTC day, read once per request or action.
 */
export function isMovieReleased(
  releaseDate: string | null,
  today: string,
): boolean {
  return airStatus(releaseDate, today) === "aired";
}

/**
 * The line an unreleased movie shows in place of its watched and score
 * controls: "Releases Oct 24, 2026", or "Release date TBA" when TMDB gives no
 * real date, so a missing date is never printed as one.
 *
 * @param releaseDate `Movie.releaseDate`.
 */
export function movieReleaseNote(releaseDate: string | null): string {
  const formatted = formatAirDate(releaseDate);
  return formatted === null ? "Release date TBA" : `Releases ${formatted}`;
}

/**
 * The date an Upcoming movie card shows, or null for Date TBA (spec 0020,
 * AC-13). The same `airStatus` reading `classifyMovie` places the movie by,
 * so a missing or malformed date can never be shown as a real one.
 *
 * @param releaseDate `Movie.releaseDate`.
 * @param today `requestTodayUtc()`, read once per request (AC-22).
 */
export function upcomingReleaseDate(
  releaseDate: string | null,
  today: string,
): string | null {
  return airStatus(releaseDate, today) === "upcoming" ? releaseDate : null;
}
