import "server-only";

/**
 * The public face of the TMDB module.
 *
 * Pages import from here and nowhere else inside `lib/tmdb/`. What is exported
 * is the surface spec 0002 fixed: the cached reads, the pure helpers, the
 * normalized types, the error type and the attribution string. The request
 * client, the Zod schemas, the normalizers and the inner uncached reads stay
 * internal, so TMDB's `snake_case` naming and its raw responses never cross
 * this boundary (AC-7).
 *
 * `server-only` is imported here as well as in the internals, so importing this
 * entry point from a Client Component fails the build rather than shipping the
 * token (AC-2).
 */

export type { SettledBatch } from "./batch";
export { TMDB_ATTRIBUTION } from "./constants";
export { isTmdbNotFound, TmdbError, type TmdbErrorKind } from "./errors";
export { imageUrl, resizeImageUrl, type TmdbImageSize } from "./images";
export {
  discoverMovies,
  discoverTvShows,
  getMovie,
  getMovieGenres,
  getMovieSummaries,
  getMoviesByIds,
  getMoviesSettled,
  getSeason,
  getShowCast,
  getShowEpisodes,
  getTvGenres,
  getTvShow,
  getTvShowsByIds,
  getTvShowsSettled,
  searchMovies,
  searchTvShows,
} from "./reads";
export type {
  BatchResult,
  CastMember,
  DiscoverOptions,
  Episode,
  EpisodeToAir,
  Genre,
  Movie,
  MovieSummary,
  Paged,
  SearchOptions,
  SeasonDetail,
  SeasonSummary,
  ShowCastMember,
  ShowEpisodes,
  TmdbShowStatus,
  TvShow,
  TvShowSummary,
} from "./types";
