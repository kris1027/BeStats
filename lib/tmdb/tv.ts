import "server-only";
import { tmdbRequest } from "./client";
import { normalizeSeasonDetail, normalizeTvShow } from "./normalize";
import { seasonDetailSchema, tvShowSchema } from "./schemas";
import type { SeasonDetail, TvShow } from "./types";
import { assertId, assertSeasonNumber } from "./validation";

/**
 * Reads one TV show, uncached.
 *
 * Nothing is appended for the seasons: TMDB's `/3/tv/{id}` already carries the
 * season summaries natively, so only `credits` costs anything extra and the
 * whole show is still one request (spec 0002, AC-6).
 *
 * @param id TMDB show id.
 * @returns The normalized show, including its season summaries.
 * @throws {TmdbError} `not_found` when TMDB has no such show.
 */
export async function fetchTvShow(id: number): Promise<TvShow> {
  const endpoint = `/tv/${id}`;
  assertId(id, endpoint);
  const raw = await tmdbRequest(
    endpoint,
    { append_to_response: "credits" },
    tvShowSchema,
  );
  return normalizeTvShow(raw);
}

/**
 * Reads one season and its episodes, uncached.
 *
 * `showId` is passed rather than read from the response because TMDB's season
 * payload does not repeat it, and every episode row in spec 0001 stores it
 * (spec 0002, AC-14). Season 0 is a valid argument and returns normally; this
 * module applies no product rule about specials (AC-15).
 *
 * @param showId TMDB show id, injected into every returned episode.
 * @param seasonNumber The season, 0 or above.
 * @returns The normalized season.
 * @throws {TmdbError} `not_found` when the show or the season does not exist.
 */
export async function fetchSeason(
  showId: number,
  seasonNumber: number,
): Promise<SeasonDetail> {
  const endpoint = `/tv/${showId}/season/${seasonNumber}`;
  assertId(showId, endpoint);
  assertSeasonNumber(seasonNumber, endpoint);
  const raw = await tmdbRequest(endpoint, {}, seasonDetailSchema);
  return normalizeSeasonDetail(raw, showId);
}
