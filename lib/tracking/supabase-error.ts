import "server-only";

import type { TrackingOutcome } from "./log";
import type { MovieTrackingError } from "./types";

/**
 * Reduces a PostgREST error to the class the client sees and the outcome the
 * log records (spec 0007, API surface).
 *
 * Only the `code` is read. The raw error's message and details can quote the
 * offending row, so the object is dropped here and never reaches a log line or
 * the browser (AC-21).
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
  error: MovieTrackingError;
  outcome: TrackingOutcome;
} {
  switch (error.code) {
    case "PGRST301":
    case "PGRST303":
      return { error: "session_expired", outcome: "session_expired" };
    case "42501":
      return { error: "write_failed", outcome: "forbidden" };
    default:
      return { error: "write_failed", outcome: "db_error" };
  }
}
