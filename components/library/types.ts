/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008; spec 0020).
 * Plain data, because they cross from the Server Component page into a
 * Client Component.
 */

/** Which private library page a section shows (spec 0020, AC-8). */
export type LibraryList = "watchlist" | "upcoming" | "watched";

/**
 * A movie's release date on an Upcoming card, formatted on the server beside
 * the `today` that decided it (spec 0020, AC-13), or null for Date TBA.
 */
export type ReleaseDate = { shortDate: string; fullDate: string } | null;

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
