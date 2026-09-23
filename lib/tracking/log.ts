import "server-only";

import type { MovieTrackingError } from "./types";

/**
 * The only way a tracking path writes to the log (spec 0007, AC-21).
 *
 * The same structural rule `lib/auth/log.ts` follows: an event name and an
 * outcome class, and nothing else. There is no parameter a user id, a movie id
 * or a rating could travel through, because a log of who watched what is
 * viewing history this app has no reason to keep (`AGENTS.md` section 11).
 */
export const TRACKING_EVENT = {
  watchlist: "movie_tracking.watchlist",
  watched: "movie_tracking.watched",
  rate: "movie_tracking.rate",
  read: "movie_tracking.read",
} as const;

export type TrackingEvent =
  (typeof TRACKING_EVENT)[keyof typeof TRACKING_EVENT];

/**
 * The classified reason. `forbidden` is a `42501` (a missing grant or a policy
 * refusal, which means a bug) and `db_error` is anything else from Postgres;
 * both reach the client as `write_failed` but stay apart here, so a broken
 * grant is not mistaken for a flaky network.
 */
export type TrackingOutcome = MovieTrackingError | "forbidden" | "db_error";

/**
 * Records one failed or refused tracking attempt. Successful writes are not
 * logged.
 *
 * @param event Which tracking path ran.
 * @param outcome The classified reason. Never free text.
 */
export function logTrackingEvent(
  event: TrackingEvent,
  outcome: TrackingOutcome,
): void {
  console.warn(`${event} refused ${outcome}`);
}
