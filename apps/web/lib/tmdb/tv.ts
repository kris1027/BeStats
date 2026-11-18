import "server-only";
import { tmdbRequest } from "./client";
import {
  normalizeSeasonDetail,
  normalizeShowCast,
  normalizeTvShow,
} from "./normalize";
import {
  aggregateCreditsSchema,
  seasonDetailSchema,
  tvShowSchema,
} from "./schemas";
import type { SeasonDetail, ShowCastMember, TvShow } from "./types";
import { assertId, assertSeasonNumber } from "./validation";

/**
 * Reads one TV show, uncached.
 *
 * Nothing is appended for the seasons: TMDB's `/3/tv/{id}` already carries the
 * season summaries natively. Only `translations` is appended, for the original
 * language overview, so the show is still one request. The cast is not: it
 * moved to `fetchShowCast`, because `getShowEpisodes` and the list screens
 * reuse this read and should not download the credits (spec 0009, AC-20,
 * amending spec 0002, AC-6).
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
    { append_to_response: "translations" },
    tvShowSchema,
  );
  return normalizeTvShow(raw);
}

/**
 * Reads a show's series cast from its aggregate credits, uncached.
 *
 * Aggregate credits, not plain credits: plain credits list only the latest
 * season's cast, so an ended show would lose everyone who left before its
 * finale (spec 0009, AC-8). The payload can be over a megabyte for a long
 * running show, which is why it is its own read with its own cache entry.
 *
 * @param id TMDB show id.
 * @returns At most `SHOW_CAST_LIMIT` people, most episodes first.
 * @throws {TmdbError} `not_found` when TMDB has no such show.
 */
export async function fetchShowCast(id: number): Promise<ShowCastMember[]> {
  const endpoint = `/tv/${id}/aggregate_credits`;
  assertId(id, endpoint);
  const raw = await tmdbRequest(endpoint, {}, aggregateCreditsSchema);
  return normalizeShowCast(raw.cast);
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
