import type { MovieTrackingError } from "./types";

/**
 * Every toast a tracking control can show, written once (spec 0007, toast
 * copy).
 *
 * Toasts appear only on failure; a success is shown by the control itself. An
 * invalid input shares the generic copy because it can only come from a bug or
 * a tampered call, and telling the person which field was wrong would not help
 * them.
 */
export const TRACKING_MESSAGES: Record<MovieTrackingError, string> = {
  session_expired: "Your session expired. Sign in to save this.",
  not_found: "This movie isn't available to track.",
  tmdb_unavailable: "Couldn't reach TMDB. Try again in a moment.",
  write_failed: "Couldn't save that change. Try again.",
  invalid_input: "Couldn't save that change. Try again.",
  // Only an Undo can be refused this way. The list pages show the copy for the
  // list the movie came from, in `UNDO_EXPIRED_MESSAGES`; this is the fallback.
  undo_expired: "Couldn't undo. Change it again from the movie page.",
};

/**
 * The toasts the two private list pages show after a removal (spec 0008,
 * AC-5, AC-7). Unlike the controls above, a removal does confirm itself with a
 * toast, because the card it changed is gone and the toast is where Undo lives.
 */
export const LIBRARY_MESSAGES = {
  watchlist: { removed: "Removed from Watchlist" },
  watched: {
    removed: "Removed from Watched",
    scoreKept: "Your score is kept.",
  },
} as const;

/** What a refused Undo says, per list (spec 0008, AC-6, AC-7). */
export const UNDO_EXPIRED_MESSAGES = {
  watchlist: "Couldn't undo. Plan it again from the movie page.",
  watched: "Couldn't undo. Mark it watched again from the movie page.",
} as const;

/** The label on a removal toast's action. */
export const UNDO_ACTION_LABEL = "Undo";

/** The label on the session expired toast's action. */
export const SIGN_IN_ACTION_LABEL = "Sign in";

/** The line that replaces the controls when the tracking read fails (AC-17). */
export const TRACKING_READ_FAILED = "Couldn't load your tracking.";
