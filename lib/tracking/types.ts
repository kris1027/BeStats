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
  | "write_failed"
  /**
   * An Undo the database refused (spec 0008, AC-6, AC-7): the row was already
   * restored, changed too long ago, or never had the value to put back.
   */
  | "undo_expired";

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

/**
 * One episode's stored state (spec 0011, API surface). Watched and rating are
 * separate facts: either can exist without the other (`AGENTS.md` section 7).
 */
export type EpisodeTrackingState = {
  watched: boolean;
  /** The personal score, an integer from 1 to 10, or null when unrated. */
  rating: number | null;
};

/** No row yet, or a row that every removal has emptied. */
export const EMPTY_EPISODE_TRACKING: EpisodeTrackingState = {
  watched: false,
  rating: null,
};

/**
 * The movie refusals, plus one of the episode's own: a creating write for an
 * episode whose air date is still in the future (spec 0011, AC-7).
 */
export type EpisodeTrackingError = MovieTrackingError | "not_aired";

/** What the single episode actions and the season Undo return. */
export type EpisodeTrackingResult =
  | { ok: true }
  | { ok: false; error: EpisodeTrackingError };

/**
 * How to take back a season write (spec 0011, AC-10, AC-11). Marking reports
 * the ids it newly marked, so Undo clears exactly those; unmarking reports the
 * dates it cleared, so Undo can put each one back.
 */
export type SeasonUndo =
  | { kind: "unmark"; episodeIds: number[] }
  | { kind: "restore"; entries: { episodeId: number; watchedAt: string }[] };

/** `undo` is null when the write changed nothing. */
export type SeasonWatchedResult =
  | { ok: true; undo: SeasonUndo | null }
  | { ok: false; error: EpisodeTrackingError };
