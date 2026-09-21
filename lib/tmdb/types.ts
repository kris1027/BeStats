/**
 * The types this module returns. TMDB's own naming and its nulls stop here.
 *
 * Nothing in `snake_case` and no raw TMDB object crosses the module boundary
 * (spec 0002, AC-7), so a field rename upstream is a change in this module
 * rather than a search across every component. Missing data is `null`
 * throughout, never zero, an empty string or placeholder text (AC-13).
 */

export type Genre = {
  id: number;
  name: string;
};

export type CastMember = {
  personId: number;
  name: string;
  character: string;
  profileUrl: string | null;
  order: number;
};

/** TMDB's pagination envelope, returned unchanged and never recomputed. */
export type Paged<T> = {
  page: number;
  results: T[];
  totalPages: number;
  totalResults: number;
};

export type MovieSummary = {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  overview: string | null;
  /** TMDB's community rating. Never the signed in user's personal rating. */
  tmdbRating: number | null;
  tmdbVoteCount: number;
};

export type Movie = MovieSummary & {
  backdropUrl: string | null;
  originalTitle: string;
  originalLanguage: string;
  tagline: string | null;
  runtimeMinutes: number | null;
  genres: Genre[];
  cast: CastMember[];
};

export type TvShowSummary = {
  id: number;
  name: string;
  posterUrl: string | null;
  firstAirDate: string | null;
  firstAirYear: number | null;
  overview: string | null;
  tmdbRating: number | null;
  tmdbVoteCount: number;
};

export type SeasonSummary = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterUrl: string | null;
  /** Derived from `seasonNumber === 0`; TMDB supplies no such flag. */
  isSpecials: boolean;
};

export type TvShow = TvShowSummary & {
  backdropUrl: string | null;
  /** TMDB's own wording, for example `Ended`. Scope feature 16 interprets it. */
  status: string;
  inProduction: boolean;
  lastAirDate: string | null;
  numberOfSeasons: number;
  numberOfEpisodes: number;
  genres: Genre[];
  cast: CastMember[];
  seasons: SeasonSummary[];
};

export type Episode = {
  id: number;
  /** Injected from the request argument; TMDB's season payload omits it. */
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  /**
   * Nullable on purpose. An episode is never dropped for a missing display
   * field, because a missing episode would corrupt the progress counts scope
   * features 14 to 16 derive (spec 0002, AC-9).
   */
  name: string | null;
  overview: string | null;
  /**
   * TMDB's `air_date`, unchanged. Null means TMDB has no confirmed date, and
   * is never coerced to today. The eligibility rule built on it belongs to
   * scope features 12 and 14.
   */
  airDate: string | null;
  stillUrl: string | null;
  runtimeMinutes: number | null;
  tmdbRating: number | null;
};

export type SeasonDetail = {
  seasonNumber: number;
  name: string;
  overview: string | null;
  airDate: string | null;
  posterUrl: string | null;
  episodes: Episode[];
};

/** The return of `getShowEpisodes`. */
export type ShowEpisodes = {
  /** Every regular episode, ordered by season number then episode number. */
  episodes: Episode[];
  /**
   * True only when every regular season was read successfully. Scope feature 16
   * must treat false as a bar to automatic completion, per AGENTS.md section 9.
   */
  complete: boolean;
  failedSeasonNumbers: number[];
};

/** The return of the batch helpers: what was found, and what TMDB has lost. */
export type BatchResult<T> = {
  found: T[];
  missingIds: number[];
};

/** Filters TMDB's discover endpoints accept. Search endpoints accept none. */
export type DiscoverOptions = {
  genreIds?: number[];
  year?: number;
  minRating?: number;
  page?: number;
};

/** Parameters TMDB's search endpoints actually accept. */
export type SearchOptions = {
  page?: number;
  year?: number;
};
