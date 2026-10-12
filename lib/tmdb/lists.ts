import "server-only";
import type { z } from "zod";
import { type TmdbQuery, tmdbRequest } from "./client";
import { MOVIE_LIST_REGION, TV_LIST_TIMEZONE } from "./constants";
import { normalizeMovieSummary, normalizeTvSummary } from "./normalize";
import { movieListItemSchema, pagedSchema, tvListItemSchema } from "./schemas";
import type {
  ListOptions,
  MovieListKind,
  MovieSummary,
  Paged,
  TvListKind,
  TvShowSummary,
} from "./types";
import { assertPage } from "./validation";

/**
 * TMDB's ready made lists, the rows of the `/shows` and `/movies` landings
 * (spec 0021, AC-2). Popular is not here: it stays on discover, the call the
 * sitemap shares (`discoverTvShows`, `discoverMovies`).
 *
 * Only the date based lists carry a place: `timezone` for Airing today and On
 * the air, `region` for Now playing and Upcoming. Trending and Top rated send
 * neither. Unlike discover, these endpoints take no `include_adult`, so a
 * result TMDB flags `adult` is dropped here, before any page sees it (AC-8).
 * TMDB's `page`, `total_pages` and `total_results` pass through unchanged, as
 * on every paged read (spec 0002, AC-18).
 */

const pagedMovieListSchema = pagedSchema(movieListItemSchema);
const pagedTvListSchema = pagedSchema(tvListItemSchema);

const TV_ENDPOINTS: Record<TvListKind, string> = {
  trending: "/trending/tv/week",
  airing_today: "/tv/airing_today",
  on_the_air: "/tv/on_the_air",
  top_rated: "/tv/top_rated",
};

const MOVIE_ENDPOINTS: Record<MovieListKind, string> = {
  trending: "/trending/movie/week",
  now_playing: "/movie/now_playing",
  upcoming: "/movie/upcoming",
  top_rated: "/movie/top_rated",
};

/**
 * Reads one page of a TV list, uncached.
 *
 * @param kind Which list, in TMDB's own naming.
 * @param options The page, 1 when left out.
 * @throws {TmdbError} `bad_response` for a page that is not a positive integer.
 */
export function fetchTvList(
  kind: TvListKind,
  options: ListOptions = {},
): Promise<Paged<TvShowSummary>> {
  const dated = kind === "airing_today" || kind === "on_the_air";
  return fetchList(
    TV_ENDPOINTS[kind],
    options,
    { timezone: dated ? TV_LIST_TIMEZONE : undefined },
    pagedTvListSchema,
    normalizeTvSummary,
  );
}

/**
 * Reads one page of a movie list, uncached.
 *
 * @param kind Which list, in TMDB's own naming.
 * @param options The page, 1 when left out.
 * @throws {TmdbError} `bad_response` for a page that is not a positive integer.
 */
export function fetchMovieList(
  kind: MovieListKind,
  options: ListOptions = {},
): Promise<Paged<MovieSummary>> {
  const dated = kind === "now_playing" || kind === "upcoming";
  return fetchList(
    MOVIE_ENDPOINTS[kind],
    options,
    { region: dated ? MOVIE_LIST_REGION : undefined },
    pagedMovieListSchema,
    normalizeMovieSummary,
  );
}

/**
 * The request both media types share: only the endpoint, the place param,
 * the schema and the normalizer differ, so the adult drop and the totals
 * pass through are written once (AC-8).
 */
async function fetchList<Raw extends { adult?: boolean | null }, Summary>(
  endpoint: string,
  options: ListOptions,
  place: TmdbQuery,
  schema: z.ZodType<{
    page: number;
    results: Raw[];
    total_pages: number;
    total_results: number;
  }>,
  normalize: (raw: Raw) => Summary,
): Promise<Paged<Summary>> {
  const page = assertPage(options.page ?? 1, endpoint);
  const raw = await tmdbRequest(endpoint, { page, ...place }, schema);
  return {
    page: raw.page,
    results: raw.results.filter((item) => item.adult !== true).map(normalize),
    totalPages: raw.total_pages,
    totalResults: raw.total_results,
  };
}
