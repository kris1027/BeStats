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
  /**
   * Unique per credit. `personId` is not: TMDB lists an actor once per role,
   * so it is what a list of credits keys on.
   */
  creditId: string;
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
  /**
   * TMDB's `genre_ids`, which a list result carries instead of `genres`.
   * Search checks them itself, because `/search` ignores genre filters
   * (spec 0010, AC-13). Missing means `[]`, never a guess.
   */
  genreIds: number[];
};

export type Movie = Omit<MovieSummary, "overview"> & {
  /**
   * TMDB's adult flag. Discover already excludes adult titles, but a detail
   * read by id does not, so the page checks this and answers not found
   * (spec 0006, AC-9). A missing flag is `false`.
   */
  adult: boolean;
  /**
   * The overview a page should show: English when TMDB has one, otherwise the
   * translation in the movie's original language, otherwise null. Never a
   * machine translation and never placeholder text (spec 0006, AC-5).
   */
  overview: string | null;
  /** ISO 639-1 code of `overview` (`"en"` for English), null with no overview. */
  overviewLanguage: string | null;
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
  /** As on `MovieSummary`. */
  genreIds: number[];
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

/**
 * One person in a show's series cast (spec 0009, AC-8). The same shape as a
 * movie credit, so `CastRow` renders both; `creditId` and `character` come
 * from the role the person played in the most episodes.
 */
export type ShowCastMember = CastMember;

export type TvShow = Omit<TvShowSummary, "overview"> & {
  /** As on `Movie`: a read by id does not exclude adult titles (spec 0009, AC-14). */
  adult: boolean;
  /** Resolved exactly like `Movie.overview` (spec 0009, AC-6). */
  overview: string | null;
  overviewLanguage: string | null;
  originalLanguage: string;
  tagline: string | null;
  backdropUrl: string | null;
  /** TMDB's own wording, for example `Ended`. Scope feature 16 interprets it. */
  status: string;
  inProduction: boolean;
  lastAirDate: string | null;
  /**
   * The year of `lastAirDate`, from the same `yearFromDate` as `firstAirYear`,
   * so the air span never parses a TMDB date outside this module.
   */
  lastAirYear: number | null;
  numberOfSeasons: number;
  numberOfEpisodes: number;
  genres: Genre[];
  /**
   * No `cast`: the series cast is its own read, `getShowCast`, so the show
   * read that progress and list screens reuse stays small (spec 0009, AC-20).
   */
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
  /** Every one of these genres, not any of them (spec 0010, AC-10). */
  genreIds?: number[];
  year?: number;
  minRating?: number;
  /**
   * Sent as `vote_count.gte`. Search sets it with a minimum rating so a title
   * rated 9 by three people does not top the list (spec 0010, AC-12).
   */
  minVoteCount?: number;
  page?: number;
};

/** Parameters TMDB's search endpoints actually accept. */
export type SearchOptions = {
  page?: number;
  year?: number;
};
