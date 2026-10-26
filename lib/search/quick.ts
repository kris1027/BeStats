import { z } from "zod";

import { MAX_QUERY_LENGTH, QUICK_MIN_CHARS } from "./constants";
import type { SearchType } from "./params";

/**
 * The contract between `GET /api/search` and the navbar's quick search
 * (spec 0010, AC-20). Pure, so the Client Component and the Route Handler
 * share one definition of what crosses the wire.
 */

const query = z.string().trim().min(QUICK_MIN_CHARS).max(MAX_QUERY_LENGTH);

/**
 * Validates the two query parameters the Route Handler accepts. `game` is
 * one of the types only while the games library is on (spec 0029, AC-17).
 *
 * @param options.gamesEnabled `gameSearchEnabled(rawType)`, which reads the
 * flag only for a raw `type=game`.
 */
export function quickSearchRequestSchema({
  gamesEnabled = false,
}: {
  gamesEnabled?: boolean;
} = {}) {
  return z.object({
    type: z
      .enum(["tv", "movie", "game"])
      .refine((type) => gamesEnabled || type !== "game"),
    q: query,
  });
}

/** One row of the quick search panel, already shaped for display. */
export type QuickResult = {
  id: number;
  title: string;
  /**
   * Release year for a movie or a game, first air year for a show, null when
   * unknown.
   */
  year: number | null;
  /** A poster, or for a game its cover. */
  posterUrl: string | null;
  /**
   * TMDB's or IGDB's community rating, never a personal one (spec 0029,
   * AC-17 renamed it from `tmdbRating`).
   */
  rating: number | null;
  href: string;
};

export type QuickSearchResponse = {
  /**
   * TMDB's `total_results`, capped as TMDB caps it, or IGDB's exact count,
   * null when IGDB sent none (spec 0029, AC-16).
   */
  totalResults: number | null;
  results: QuickResult[];
};

/** The Route Handler's error bodies, so the client can tell them apart. */
export type QuickSearchError =
  | { error: "invalid" }
  | { error: "upstream"; kind: string };

/** The `See all` target, the results page for the same query (AC-4). */
export function seeAllHref(type: SearchType, query: string): string {
  const params = new URLSearchParams({ type, q: query.trim() });
  return `/search?${params.toString()}`;
}
