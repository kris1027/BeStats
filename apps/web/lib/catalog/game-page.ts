import { isMovieReleased, movieReleaseNote } from "@/lib/catalog/movie-page";
import type {
  GameTrackingState,
  StartedGameStatus,
} from "@/lib/tracking/types";

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

/**
 * What a game card shows of its stored row (spec 0030, AC-2, AC-6, AC-7),
 * read straight from the status, so a card always names the library tab the
 * game is on (AC-8): no row is no status, Want to play carries whether the
 * game is still to come (for the release pill), and Playing or Finished
 * carry the score for the badge.
 *
 * @param state The stored state, or undefined when the user has no row.
 * @param releaseDate The IGDB release date already on the card.
 * @param today `requestTodayUtc()`, read once per request.
 */
export function gameCardStatus(
  state: GameTrackingState | undefined,
  releaseDate: string | null,
  today: string,
): GameCardStatus | null {
  if (state === undefined || state.status === null) return null;
  if (state.status === "want_to_play") {
    return {
      status: "want_to_play",
      unreleased: !isGameReleased(releaseDate, today),
    };
  }
  return { status: state.status, rating: state.rating };
}

/** A game card's stored state, from `gameCardStatus`. */
export type GameCardStatus =
  | { status: "want_to_play"; unreleased: boolean }
  | { status: StartedGameStatus; rating: number | null };
