/**
 * The shapes every movie tracking surface shares (spec 0007, API surface).
 *
 * Pure and free of `server-only`, because the client controls hold a
 * `MovieTrackingState` and branch on a `MovieTrackingError` to pick a toast.
 */

/** What the reads return and what the controls hold between clicks. */
export type MovieTrackingState = {
  inWatchlist: boolean;
  watched: boolean;
  /** The personal score, an integer from 1 to 10, or null when unrated. */
  rating: number | null;
};

/** The empty state: no row yet, or a row that every removal has emptied. */
export const EMPTY_MOVIE_TRACKING: MovieTrackingState = {
  inWatchlist: false,
  watched: false,
  rating: null,
};

/**
 * Every reason a tracking action can refuse. A closed union rather than a
 * message, so the client picks copy from `messages.ts` and a raw Supabase or
 * TMDB error can never reach the browser (spec 0007, AC-11).
 */
export type MovieTrackingError =
  | "invalid_input"
  | "session_expired"
  | "not_found"
  | "tmdb_unavailable"
  | "write_failed";

/**
 * What every action returns. No state comes back: the controls converge on the
 * server prop that `refresh()` delivers in the same response, so the confirmed
 * state is only ever the server's (spec 0007, key invariants).
 */
export type MovieTrackingResult =
  | { ok: true }
  | { ok: false; error: MovieTrackingError };

/** A read that treats signed out and a failed read as ordinary outcomes. */
export type TrackingRead<T> =
  | { kind: "signed_out" }
  | { kind: "ok"; state: T }
  | { kind: "failed" };
