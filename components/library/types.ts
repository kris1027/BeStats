import type { TvStatus } from "@/lib/tracking/types";

/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008, spec 0013).
 * Plain data, because they cross from the Server Component page into a
 * Client Component.
 */

/** Which private list a page shows. */
export type LibraryList = "watchlist" | "watched";

/**
 * What a show card does on each list, decided once here rather than at every
 * place that draws or fills a card (spec 0013, AC-15, AC-16; spec 0019, AC-5,
 * AC-6). On the watchlist a show carries its Next episode pill and the button
 * that takes it off the list. On `/watched` a Completed show carries its
 * calculated rating and no button: its history is edited on the show page.
 * A movie card always carries its button.
 */
export const SHOW_CARD = {
  watchlist: { button: true, nextEpisode: true, calculatedRating: false },
  watched: { button: false, nextEpisode: false, calculatedRating: true },
} as const satisfies Record<
  LibraryList,
  { button: boolean; nextEpisode: boolean; calculatedRating: boolean }
>;

/** The fields every card takes from TMDB, all null when TMDB lacks it. */
type LibraryCardTitle = {
  /** The TMDB id. A movie and a show can share one, so `kind` goes with it. */
  tmdbId: number;
  /** Null when TMDB no longer has the title (`missingIds`, AC-11). */
  title: string | null;
  posterUrl: string | null;
  /** The TMDB community rating; the watchlist card's badge. */
  tmdbRating: number | null;
};

/** A movie card on either list. */
export type LibraryMovieItem = LibraryCardTitle & {
  kind: "movie";
  /**
   * The personal score; the watched card's badge, and the toast's extra
   * line. Null on the watchlist, or when unrated.
   */
  rating: number | null;
  /**
   * The watched time as PostgREST returned it, for Undo on the watched page.
   * Null on the watchlist.
   */
  watchedAt: string | null;
};

/** A show card on either list. */
export type LibraryShowItem = LibraryCardTitle & {
  kind: "tv";
  /**
   * The show's status, which picks its watchlist button (AC-16); always
   * `completed` on the watched page.
   */
  status: TvStatus;
  /**
   * The calculated show rating, unrounded (spec 0019, AC-5). Null on the
   * watchlist, or when no regular season is rated.
   */
  showRating: number | null;
};

/**
 * One card: a Postgres row joined with its TMDB title, when TMDB has it. Both
 * pages hold movies and shows: the watchlist since spec 0013 (AC-13), the
 * watched page since spec 0019 (AC-1). Split by `kind`, so a movie never
 * carries a show's status or rating, nor a show a movie's score.
 */
export type LibraryItem = LibraryMovieItem | LibraryShowItem;

/**
 * One key per card, stable across renders: a movie and a show with the same
 * TMDB id are different cards.
 */
export function libraryItemKey(item: Pick<LibraryItem, "kind" | "tmdbId">) {
  return `${item.kind}-${item.tmdbId}`;
}
