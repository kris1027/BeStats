/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008; spec 0020).
 * Plain data, because they cross from the Server Component page into a
 * Client Component.
 */

export type { LibraryList } from "@/lib/catalog/library-list";

import type { ReleaseDate } from "@/lib/format";

export type { ReleaseDate };

/**
 * One movie card: a Postgres row joined with its TMDB title, when TMDB has
 * it. Show cards are Server Components of their own (`show-cards.tsx`,
 * `watchlist-show-card.tsx`): no client grid needs them.
 */
export type LibraryMovieItem = {
  /** The TMDB id. */
  tmdbId: number;
  /** Null when TMDB no longer has the title (`missingIds`, spec 0008, AC-11). */
  title: string | null;
  posterUrl: string | null;
  /** The TMDB community rating; the Watchlist card's badge. */
  tmdbRating: number | null;
  /**
   * The personal score; the Watched card's badge, and the toast's extra
   * line. Null elsewhere, or when unrated.
   */
  rating: number | null;
  /**
   * The watched time as PostgREST returned it, for Undo on Watched. Null
   * elsewhere.
   */
  watchedAt: string | null;
  /** The release date on Upcoming; null (Date TBA) elsewhere too. */
  release: ReleaseDate;
};

/** One key per card, stable across renders. */
export function libraryItemKey(item: Pick<LibraryMovieItem, "tmdbId">) {
  return `movie-${item.tmdbId}`;
}

/**
 * One game card on a games tab (spec 0027, API surface): a `user_game_state`
 * row joined with its IGDB game, when IGDB has it.
 */
export type LibraryGameItem = {
  /** The IGDB id. */
  gameId: number;
  /** Null when IGDB no longer has the game (`missingIds`, AC-11). */
  name: string | null;
  coverUrl: string | null;
  /** IGDB's community rating out of 10; the badge with no personal score. */
  communityRating: number | null;
  /** The personal score; only a Playing or Finished card shows it. */
  rating: number | null;
  /**
   * True when IGDB's catalog filter hides the game: its page is a soft 404
   * (spec 0025, AC-7), so the card has no link (AC-10).
   */
  hidden: boolean;
  /** Unreleased only on Want to play; an unreleased `date: null` is Date TBA. */
  release: { state: "released" } | { state: "unreleased"; date: ReleaseDate };
  /** `Started Oct 2026` or `Finished Oct 2026`, already formatted. */
  dateLine: string | null;
};

/** One key per game card, apart from the movie keys. */
export function gameItemKey(item: Pick<LibraryGameItem, "gameId">) {
  return `game-${item.gameId}`;
}
