import type { TvStatus } from "@/lib/tracking/types";

/**
 * The shapes the list pages hand to `LibraryGrid` (spec 0008, spec 0013).
 * Plain data, because they cross from the Server Component page into a
 * Client Component.
 */

/** Which private list a page shows. */
export type LibraryList = "watchlist" | "watched";

/**
 * One card: a Postgres row joined with its TMDB title, when TMDB has it. The
 * watched page holds movies only; the watchlist holds movies and shows
 * (spec 0013, AC-13).
 */
export type LibraryItem = {
  kind: "movie" | "tv";
  /** The TMDB id. A movie and a show can share one, so `kind` goes with it. */
  tmdbId: number;
  /** A show's status, which picks its button (AC-16); null for a movie. */
  status: TvStatus | null;
  /** Null when TMDB no longer has the title (`missingIds`, AC-11). */
  title: string | null;
  posterUrl: string | null;
  /** The TMDB community rating; the watchlist card's badge. */
  tmdbRating: number | null;
  /** The personal score; the watched card's badge, and the toast's extra line. */
  rating: number | null;
  /** The watched time as PostgREST returned it, for Undo on the watched page. */
  watchedAt: string | null;
};

/**
 * One key per card, stable across renders: a movie and a show with the same
 * TMDB id are different cards.
 */
export function libraryItemKey(item: Pick<LibraryItem, "kind" | "tmdbId">) {
  return `${item.kind}-${item.tmdbId}`;
}
