import { type CatalogList, catalogList } from "./lists";
import type { LibraryType } from "./media-type";

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
  /** The counter moving rows: Upcoming, or On the air for TV. */
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

/**
 * The games landing (spec 0028, AC-1, AC-9): Recently released takes the
 * sticky sidebar under its `New releases` label, and Coming soon the counter
 * moving rows.
 */
const GAME_SLOTS: LandingSlots = {
  trending: catalogList("game", "trending"),
  popular: catalogList("game", "popular"),
  now: catalogList("game", "recently-released"),
  nowLabel: "New releases",
  upcoming: catalogList("game", "coming-soon"),
  top: catalogList("game", "top-rated"),
};

const SLOTS: Record<LibraryType, LandingSlots> = {
  tv: TV_SLOTS,
  movie: MOVIE_SLOTS,
  game: GAME_SLOTS,
};

/** One media type's landing slots. */
export function landingSlots(mediaType: LibraryType): LandingSlots {
  return SLOTS[mediaType];
}

/**
 * How many titles each part shows, all from TMDB's page 1 except the Upcoming
 * rows, which also read page 2 (decision 8, amended 2026-10-18). A list that
 * returns fewer shows fewer; nothing is padded.
 */
export const LANDING_COUNTS = {
  trending: 9,
  popular: 14,
  now: 12,
  /** Per Upcoming row; each row takes the next ten (decision 13). */
  upcomingRow: 10,
  /** Upcoming rows, alternating direction; rows 3 and 4 come from page 2. */
  upcomingRows: 4,
  /** Upcoming rows each page fills: page 1 rows 1 and 2, page 2 rows 3 and 4. */
  upcomingRowsPerPage: 2,
  top: 8,
} as const;

/**
 * The line under the sidebar heading, counting what is actually rendered
 * (decision 12), or null when nothing is.
 */
export function nowBlurb(list: CatalogList, count: number): string | null {
  if (count === 0) return null;
  switch (list.mediaType) {
    case "tv":
      return `${count} ${count === 1 ? "show" : "shows"} airing today.`;
    case "movie":
      return `${count} ${count === 1 ? "film" : "films"} in cinemas this week.`;
    case "game":
      // spec 0028, AC-9: its own branch, never the movie line.
      return `The ${count} most anticipated ${count === 1 ? "game" : "games"} of the last 60 days.`;
  }
}
