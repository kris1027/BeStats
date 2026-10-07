import { airStatus } from "@/lib/tv/air-status";

/** The library pages a movie can sit on (spec 0020, AC-13). */
export type MoviePage = "watched" | "watchlist" | "upcoming";

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
  return airStatus(movie.releaseDate, today) === "aired"
    ? "watchlist"
    : "upcoming";
}
