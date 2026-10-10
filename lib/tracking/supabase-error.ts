import "server-only";

import type { TrackingOutcome } from "./log";
import type { MovieTrackingError, TrackingError } from "./types";

/**
 * Reduces a PostgREST error to the class the client sees and the outcome the
 * log records (spec 0007, API surface).
 *
 * Only the `code` is read. The raw error's message and details can quote the
 * offending row, so the object is dropped here and never reaches a log line or
 * the browser (AC-21).
 *
 * `P0002` (`no_data_found`) is what the two restore functions raise when no
 * row matches, so a refused Undo reaches the user as `undo_expired` rather than
 * a silent success (spec 0008, AC-6, AC-7).
 *
 * `22023` (`invalid_parameter_value`) is what the season functions raise for an
 * empty, oversized or mismatched episode list (spec 0011, AC-15). The action
 * checks the same bounds first, so reaching it means a bug or a tampered call.
 *
 * `PGRST301` and `PGRST303` are an expired or invalid JWT: the session lapsed
 * between the claims check and the write, so the person is asked to sign in
 * again (AC-12). `42501` is a missing grant or a policy refusal, which a
 * correctly signed in user should never hit, so it is a bug, logged as
 * `forbidden`, and shown as an ordinary failed save.
 *
 * @param error Anything with an optional string `code`, as PostgREST returns.
 */
export function classifyTrackingError(error: { code?: string | null }): {
  error: TrackingError;
  outcome: TrackingOutcome;
} {
  switch (error.code) {
    case "P0002":
      return { error: "undo_expired", outcome: "undo_expired" };
    case "22023":
      return { error: "invalid_input", outcome: "invalid_input" };
    case "PGRST301":
    case "PGRST303":
      return { error: "session_expired", outcome: "session_expired" };
    case "42501":
      return { error: "write_failed", outcome: "forbidden" };
    default:
      return { error: "write_failed", outcome: "db_error" };
  }
}

/**
 * `classifyTrackingError` plus the one SQLSTATE only a movie write raises:
 * `BS001`, which `rate_movie` raises for a score on a movie that is not
 * watched, since a movie score needs a watch mark (`AGENTS.md` section 7,
 * prompts/movie-plan-watched-exclusive.md). Kept beside the shared mapping so
 * every code the app reads is listed in one file, and separate from it so the
 * episode and show writes can never return a movie refusal.
 *
 * @param error Anything with an optional string `code`, as PostgREST returns.
 */
export function classifyMovieTrackingError(error: { code?: string | null }): {
  error: MovieTrackingError;
  outcome: TrackingOutcome;
} {
  if (error.code === "BS001") {
    return { error: "not_watched", outcome: "not_watched" };
  }
  return classifyTrackingError(error);
}
