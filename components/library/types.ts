/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008). Plain data,
 * because they cross from the Server Component page into a Client Component.
 */

/** Which private list a page shows. */
export type LibraryList = "watchlist" | "watched";

/** One card: a Postgres row joined with its TMDB title, when TMDB has it. */
export type LibraryItem = {
  movieId: number;
  /** Null when TMDB no longer has the movie (`missingIds`, AC-11). */
  title: string | null;
  posterUrl: string | null;
  /** The TMDB community rating; the watchlist card's badge. */
  tmdbRating: number | null;
  /** The personal score; the watched card's badge, and the toast's extra line. */
  rating: number | null;
  /** The watched time as PostgREST returned it, for Undo on the watched page. */
  watchedAt: string | null;
};
