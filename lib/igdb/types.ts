/**
 * The app's own game types, the only shapes that leave `index.ts` (spec 0023,
 * AC-15). camelCase, closed unions, and `null` wherever IGDB may know nothing:
 * missing stays missing, never zero, placeholder text or today's date.
 */

/** A platform, genre or theme, and the rows of the reference lists. */
export type GameRef = { id: number; name: string };

/**
 * IGDB's game type, closed. `other` covers every id outside the visible set
 * (a DLC, a bundle, a port), so a new IGDB id can never widen the union.
 */
export type GameType =
  | "main_game"
  | "standalone_expansion"
  | "remake"
  | "remaster"
  | "expanded_game"
  | "other";

export type Game = {
  id: number;
  name: string;
  slug: string | null;
  coverUrl: string | null;
  /** The UTC day of IGDB's `first_release_date`, `YYYY-MM-DD`. */
  releaseDate: string | null;
  releaseYear: number | null;
  platforms: GameRef[];
  genres: GameRef[];
  themes: GameRef[];
  summary: string | null;
  gameType: GameType | null;
  /** IGDB's community rating on a 0 to 10 scale, full precision. */
  communityRating: number | null;
  communityRatingCount: number | null;
  /** True when the game fails the catalog filter (AC-10). */
  hidden: boolean;
};

/** What a card, a batch, a search and a discover read carry. */
export type GameSummary = {
  id: number;
  name: string;
  coverUrl: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  communityRating: number | null;
  communityRatingCount: number | null;
  /** Ids only; names come from the reference lists. */
  genreIds: number[];
  platformIds: number[];
  hidden: boolean;
};

/** `found` is in no promised order; look games up by id. */
export type BatchResult<T> = { found: T[]; missingIds: number[] };

export type Paged<T> = {
  page: number;
  results: T[];
  hasNextPage: boolean;
  /** IGDB's match count, or null when it sent none. Never a guess. */
  totalResults: number | null;
};

export type SearchGamesOptions = {
  query: string;
  genreIds?: readonly number[];
  platformIds?: readonly number[];
  /** The UTC year of the first release. */
  year?: number;
  /** On the 0 to 10 scale. */
  minRating?: number;
  page?: number;
};

export type DiscoverSort =
  | "rating_desc"
  | "rating_count_desc"
  | "release_desc"
  | "release_asc"
  | "hypes_desc";

export type DiscoverGamesOptions = {
  genreIds?: readonly number[];
  platformIds?: readonly number[];
  /** A UTC day, `YYYY-MM-DD`, inclusive. */
  releasedFrom?: string;
  /** A UTC day, `YYYY-MM-DD`, inclusive. */
  releasedTo?: string;
  minRating?: number;
  minRatingCount?: number;
  minHypes?: number;
  sort: DiscoverSort;
  page?: number;
};
