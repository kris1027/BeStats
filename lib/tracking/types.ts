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
 * Every reason any tracking action can refuse. A closed union rather than a
 * message, so the client picks copy from `messages.ts` and a raw Supabase or
 * TMDB error can never reach the browser (spec 0007, AC-11).
 */
export type TrackingError =
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
 * The shared refusals, plus the movie's own: a new watched mark or score for a
 * movie whose TMDB release date is still in the future, or missing
 * (prompts/movie-release-gate.md).
 */
export type MovieTrackingError = TrackingError | "not_released";

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
 * The shared refusals, plus one of the episode's own: a creating write for an
 * episode whose air date is still in the future (spec 0011, AC-7).
 */
export type EpisodeTrackingError = TrackingError | "not_aired";

/**
 * What an episode write did to tracking on its own (spec 0020, AC-5):
 * `showTracked` is true only when the write tracked a show that was not
 * tracked, which the "added to your shows" toast confirms.
 */
export type ShowTrackingFlags = { showTracked: boolean };

/**
 * What the single episode actions and the season Undo return, with
 * `showTracked`, which the season page and Up Next confirm with a toast.
 */
export type EpisodeTrackingResult =
  | ({ ok: true } & ShowTrackingFlags)
  | { ok: false; error: EpisodeTrackingError };

/**
 * What `setEpisodeWatched` returns (spec 0014, AC-9): the shared success
 * shape plus `newlyMarked`, true only when this call set the mark, so Up Next
 * offers Undo only for a mark it made. Always false when unmarking.
 *
 * `markedAt` is the `watched_at` that mark stored, as PostgREST returned it,
 * and null whenever `newlyMarked` is false. Undo hands it back to
 * `undoEpisodeMark`, so it clears that mark and never a newer one.
 */
export type MarkEpisodeWatchedResult =
  | ({
      ok: true;
      newlyMarked: boolean;
      markedAt: string | null;
    } & ShowTrackingFlags)
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
  | ({ ok: true; undo: SeasonUndo | null } & ShowTrackingFlags)
  | { ok: false; error: EpisodeTrackingError };

/**
 * The Undo of Stop tracking (spec 0020, AC-3): the `tracked_at` that
 * `untrack_show` reported deleting, so the show returns to its old place.
 * A show is tracked or not; there is no hold (amended 2026-10-10).
 */
export type ShowTrackingUndo = { trackedAt: string };

/**
 * A tracking write's failure: exactly the shared classes. Stop tracking is
 * idempotent (AC-4), so no stale state class exists.
 */
export type ShowTrackingError = TrackingError;

/** What `trackShow` and `restoreShowTracking` return. */
export type ShowTrackingResult =
  | { ok: true }
  | { ok: false; error: ShowTrackingError };

/**
 * What `untrackShow` returns: the Undo it carries, or null when the show was
 * already untracked (stopped in another tab), which has nothing to undo.
 */
export type UntrackShowResult =
  | { ok: true; undo: ShowTrackingUndo | null }
  | { ok: false; error: ShowTrackingError };
