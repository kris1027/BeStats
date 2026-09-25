import { z } from "zod";

import { MAX_QUERY_LENGTH, QUICK_MIN_CHARS } from "./constants";
import type { SearchType } from "./params";

/**
 * The contract between `GET /api/search` and the navbar's quick search
 * (spec 0010, AC-20). Pure, so the Client Component and the Route Handler
 * share one definition of what crosses the wire.
 */

/** Validates the two query parameters the Route Handler accepts. */
export const quickSearchRequestSchema = z.object({
  type: z.enum(["tv", "movie"]),
  q: z.string().trim().min(QUICK_MIN_CHARS).max(MAX_QUERY_LENGTH),
});

/** One row of the quick search panel, already shaped for display. */
export type QuickResult = {
  id: number;
  title: string;
  /** Release year for a movie, first air year for a show, null when unknown. */
  year: number | null;
  posterUrl: string | null;
  /** TMDB's community rating, never a personal one. */
  tmdbRating: number | null;
  href: string;
};

export type QuickSearchResponse = {
  /** TMDB's `total_results` for the search, capped as TMDB caps it. */
  totalResults: number;
  results: QuickResult[];
};

/** The Route Handler's error bodies, so the client can tell them apart. */
export type QuickSearchError =
  | { error: "invalid" }
  | { error: "upstream"; kind: string };

/** Where a result opens: `/shows/{id}` or `/movies/{id}`. */
export function titleHref(type: SearchType, id: number): string {
  return type === "movie" ? `/movies/${id}` : `/shows/${id}`;
}

/** The `See all` target, the results page for the same query (AC-4). */
export function seeAllHref(type: SearchType, query: string): string {
  const params = new URLSearchParams({ type, q: query.trim() });
  return `/search?${params.toString()}`;
}
