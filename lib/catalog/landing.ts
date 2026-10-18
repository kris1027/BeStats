import { type CatalogList, catalogList } from "./lists";
import type { MediaType } from "./media-type";

/**
 * Which list fills each part of a catalog landing, and the words only the
 * landing uses (prompts/home-parallax-landing.md, decisions 1 and 12).
 *
 * The hero and the pinned row both read `trending`, the same cached page 1,
 * so the hero costs no extra list request. Pure and free of `server-only`, so
 * the tests and the showcase can import it.
 */
export type LandingSlots = {
  trending: CatalogList;
  popular: CatalogList;
  /** The sticky sidebar section: Now playing, or Airing today for TV. */
  now: CatalogList;
  /** The small label above the sidebar's heading. */
  nowLabel: string;
  /** The two counter moving rows: Upcoming, or On the air for TV. */
  upcoming: CatalogList;
  top: CatalogList;
};

const TV_SLOTS: LandingSlots = {
  trending: catalogList("tv", "trending"),
  popular: catalogList("tv", "popular"),
  now: catalogList("tv", "airing-today"),
  nowLabel: "On TV today",
  upcoming: catalogList("tv", "on-the-air"),
  top: catalogList("tv", "top-rated"),
};

const MOVIE_SLOTS: LandingSlots = {
  trending: catalogList("movie", "trending"),
  popular: catalogList("movie", "popular"),
  now: catalogList("movie", "now-playing"),
  nowLabel: "In cinemas",
  upcoming: catalogList("movie", "upcoming"),
  top: catalogList("movie", "top-rated"),
};

/** One media type's landing slots. */
export function landingSlots(mediaType: MediaType): LandingSlots {
  return mediaType === "tv" ? TV_SLOTS : MOVIE_SLOTS;
}

/**
 * How many titles each part shows, all from TMDB's page 1 (decision 8). A
 * list that returns fewer shows fewer; nothing is padded.
 */
export const LANDING_COUNTS = {
  trending: 9,
  popular: 14,
  now: 12,
  /** Per Upcoming row; the second row takes the next ten (decision 13). */
  upcomingRow: 10,
  top: 8,
} as const;

/**
 * The line under the sidebar heading, counting what is actually rendered
 * (decision 12), or null when nothing is.
 */
export function nowBlurb(list: CatalogList, count: number): string | null {
  if (count === 0) return null;
  if (list.mediaType === "tv") {
    return `${count} ${count === 1 ? "show" : "shows"} airing today.`;
  }
  return `${count} ${count === 1 ? "film" : "films"} in cinemas this week.`;
}
