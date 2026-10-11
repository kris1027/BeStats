import type { LibraryList } from "@/lib/catalog/library-list";
import { formatAirDate } from "@/lib/format";
import { UPCOMING_MESSAGES } from "@/lib/tracking/messages";
import type { MovieTrackingState } from "@/lib/tracking/types";
import { airStatus } from "@/lib/tv/air-status";

/** The library pages a movie can sit on (spec 0020, AC-13). */
export type MoviePage = LibraryList;

/** The user's own state for one movie, and the release date TMDB gives. */
export type MoviePlacement = {
  releaseDate: string | null;
  inWatchlist: boolean;
  watched: boolean;
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
  if (movie.watched) return "watched";
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
 * @param today The UTC day, read once: `requestTodayUtc()` in a render,
 * `todayUtc(new Date())` in a Server Action, as the episode actions do.
 */
export function isMovieReleased(
  releaseDate: string | null,
  today: string,
): boolean {
  return airStatus(releaseDate, today) === "aired";
}

/**
 * The line an unreleased movie shows in place of its watched and score
 * controls: "Releases Oct 24, 2026", or "Release date to be announced" when
 * TMDB gives no real date, so a missing date is never printed as one. The
 * copy is the Upcoming card's, so a movie reads the same on both pages.
 *
 * @param releaseDate `Movie.releaseDate`.
 */
export function movieReleaseNote(releaseDate: string | null): string {
  const formatted = formatAirDate(releaseDate);
  return formatted === null
    ? UPCOMING_MESSAGES.releaseTba
    : UPCOMING_MESSAGES.releases(formatted);
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

/**
 * What a catalog poster card shows of the user's own state for one movie
 * (prompts/catalog-card-status.md): the library page the movie sits on, with
 * what that page's card carries, or null when it sits on none.
 *
 * Placed by `classifyMovie` on the same request day, so a card on `/movies`
 * or `/search` can never disagree with the library page it mirrors.
 *
 * @param state The stored state, or undefined when the user has no row.
 * @param releaseDate The TMDB release date already on the card.
 * @param today `requestTodayUtc()`, read once per request (AC-22).
 */
export function movieCardStatus(
  state: MovieTrackingState | undefined,
  releaseDate: string | null,
  today: string,
): MovieCardStatus | null {
  if (state === undefined) return null;
  const page = classifyMovie({ releaseDate, ...state }, today);
  switch (page) {
    case null:
      return null;
    case "watched":
      return { page, rating: state.rating };
    case "watchlist":
      return { page };
    case "upcoming":
      return { page, releaseDate: upcomingReleaseDate(releaseDate, today) };
  }
}

/** A movie card's library state, from `movieCardStatus`. */
export type MovieCardStatus =
  | { page: "watched"; rating: number | null }
  | { page: "watchlist" }
  | { page: "upcoming"; releaseDate: string | null };
