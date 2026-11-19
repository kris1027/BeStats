import type { ClearedOf } from "@bestats/core/api/v1/cleared";
import {
  v1EpisodeMarkOkSchema,
  v1EpisodeWriteOkSchema,
  v1SeasonWatchedOkSchema,
  v1ShowTrackingOkSchema,
  v1UntrackShowOkSchema,
} from "@bestats/core/api/v1/show";

import { apiRequest } from "./api";
import { postRestore } from "./tracking";

/**
 * The show, season and episode writes (spec 0035, API surface). Each runs the
 * same command as the web's Server Action, so the air date gate, the "a mark
 * tracks the show" rule and the season's aired set all stay on the server
 * (spec 0033, AC-5, AC-6; `lib/tracking/AGENTS.md`).
 */

/** `PUT /api/v1/me/shows/{id}/tracking`: Plan to watch becomes Tracking. */
export function trackShow(showId: number) {
  return apiRequest(
    `/api/v1/me/shows/${showId}/tracking`,
    v1ShowTrackingOkSchema,
    { method: "PUT", auth: true },
  );
}

/**
 * `DELETE /api/v1/me/shows/{id}/tracking`: Stop tracking. Every mark and
 * rating stays (AGENTS.md section 7); a null `undo` means another device
 * already stopped it.
 */
export function untrackShow(showId: number) {
  return apiRequest(
    `/api/v1/me/shows/${showId}/tracking`,
    v1UntrackShowOkSchema,
    { method: "DELETE", auth: true },
  );
}

/** `POST …/tracking/restore`: the Undo of Stop tracking. */
export function restoreShowTracking(cleared: ClearedOf<"show_tracking">) {
  return postRestore(
    `/api/v1/me/shows/${cleared.showId}/tracking/restore`,
    cleared,
    v1ShowTrackingOkSchema,
  );
}

/** `PUT /api/v1/me/episodes/{episodeId}` with a watched mark. */
export function putEpisodeWatched(
  episodeId: number,
  body: { showId: number; season: number; watched: boolean },
) {
  return apiRequest(`/api/v1/me/episodes/${episodeId}`, v1EpisodeMarkOkSchema, {
    method: "PUT",
    body,
    auth: true,
  });
}

/**
 * `PUT /api/v1/me/episodes/{episodeId}` with a score, or null to clear it. A
 * score on an unwatched episode marks it too, with no Undo, as on the web.
 */
export function putEpisodeRating(
  episodeId: number,
  body: { showId: number; season: number; rating: number | null },
) {
  return apiRequest(
    `/api/v1/me/episodes/${episodeId}`,
    v1EpisodeWriteOkSchema,
    { method: "PUT", body, auth: true },
  );
}

/** `POST …/episodes/{episodeId}/restore`: the Undo of a new mark. */
export function restoreEpisode(cleared: ClearedOf<"episode">) {
  return postRestore(
    `/api/v1/me/episodes/${cleared.episodeId}/restore`,
    cleared,
    v1EpisodeWriteOkSchema,
  );
}

/**
 * `PUT …/seasons/{n}/watched`: marking takes the aired episodes from TMDB on
 * the server; unmarking names the ids the screen shows, as the web does.
 */
export function putSeasonWatched(
  showId: number,
  seasonNumber: number,
  body: { watched: true } | { watched: false; episodeIds: number[] },
) {
  return apiRequest(
    `/api/v1/me/shows/${showId}/seasons/${seasonNumber}/watched`,
    v1SeasonWatchedOkSchema,
    { method: "PUT", body, auth: true },
  );
}

/** `POST …/seasons/{n}/watched/restore`: the Undo of a season write. */
export function restoreSeason(cleared: ClearedOf<"season">) {
  return postRestore(
    `/api/v1/me/shows/${cleared.showId}/seasons/${cleared.seasonNumber}/watched/restore`,
    cleared,
    v1EpisodeWriteOkSchema,
  );
}
