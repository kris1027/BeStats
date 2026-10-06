import type { TvStatus } from "@/lib/tracking/types";

/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008, spec 0013).
 * Plain data, because they cross from the Server Component page into a
 * Client Component.
 */

/** Which private list a page shows. */
export type LibraryList = "watchlist" | "watched";

/**
 * One card: a Postgres row joined with its TMDB title, when TMDB has it. Both
 * pages hold movies and shows: the watchlist since spec 0013 (AC-13), the
 * watched page since spec 0019 (AC-1).
 */
export type LibraryItem = {
  kind: "movie" | "tv";
  /** The TMDB id. A movie and a show can share one, so `kind` goes with it. */
  tmdbId: number;
  /**
   * A show's status, which picks its watchlist button (AC-16); always
   * `completed` on the watched page. Null for a movie.
   */
  status: TvStatus | null;
  /** Null when TMDB no longer has the title (`missingIds`, AC-11). */
  title: string | null;
  posterUrl: string | null;
  /** The TMDB community rating; the watchlist card's badge. */
  tmdbRating: number | null;
  /**
   * A movie's personal score; the watched card's badge, and the toast's extra
   * line. Always null for a show.
   */
  rating: number | null;
  /**
   * A watched show's calculated rating, unrounded (spec 0019, AC-5); null for
   * a movie, a watchlist card, or a show with no rated regular season.
   */
  showRating: number | null;
  /**
   * A watched movie's time as PostgREST returned it, for Undo on the watched
   * page. Null for a show, which this page never removes.
   */
  watchedAt: string | null;
};

/**
 * One key per card, stable across renders: a movie and a show with the same
 * TMDB id are different cards.
 */
export function libraryItemKey(item: Pick<LibraryItem, "kind" | "tmdbId">) {
  return `${item.kind}-${item.tmdbId}`;
}
