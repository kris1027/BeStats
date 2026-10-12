import "server-only";
import { tmdbRequest } from "./client";
import { normalizeMovieExtras, normalizeTvExtras } from "./normalize-extras";
import { movieExtrasSchema, tvExtrasSchema } from "./schemas";
import type { MovieExtras, TvExtras } from "./types";
import { assertId } from "./validation";

/**
 * The title page extras: trailer, recommendations, watch providers and age
 * ratings, in one request per title (spec 0022, AC-8).
 *
 * A separate read from `fetchMovie` and `fetchTvShow` on purpose: the
 * library pages read those for up to 500 titles, and none of them needs any
 * of this, so they keep their size and their lifetime. The details TMDB sends
 * back alongside the appended keys are ignored; the page reads them from the
 * detail reads (AC-16).
 *
 * `include_video_language=en,null` keeps videos with no language, which
 * `buildUrl`'s `language=en-US` would otherwise filter out. No region is
 * sent: every country comes back, and the page picks its visitor's after the
 * cache returns (AC-9).
 */

/**
 * Reads a movie's extras, uncached. The inner half of `getMovieExtras`.
 *
 * @param id TMDB movie id.
 * @throws {TmdbError} `not_found` when TMDB has no such movie.
 */
export async function fetchMovieExtras(id: number): Promise<MovieExtras> {
  const endpoint = `/movie/${id}`;
  assertId(id, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      append_to_response:
        "videos,recommendations,watch/providers,release_dates",
      include_video_language: "en,null",
    },
    movieExtrasSchema,
  );
  return normalizeMovieExtras(raw);
}

/**
 * Reads a show's extras, uncached. The inner half of `getTvExtras`.
 *
 * @param id TMDB show id.
 * @throws {TmdbError} `not_found` when TMDB has no such show.
 */
export async function fetchTvExtras(id: number): Promise<TvExtras> {
  const endpoint = `/tv/${id}`;
  assertId(id, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    {
      append_to_response:
        "videos,recommendations,watch/providers,content_ratings",
      include_video_language: "en,null",
    },
    tvExtrasSchema,
  );
  return normalizeTvExtras(raw);
}
