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
};

/** The label on the session expired toast's action. */
export const SIGN_IN_ACTION_LABEL = "Sign in";

/** The line that replaces the controls when the tracking read fails (AC-17). */
export const TRACKING_READ_FAILED = "Couldn't load your tracking.";
