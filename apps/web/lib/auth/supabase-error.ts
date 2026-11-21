import "server-only";

import { classifyAuthFailure } from "@bestats/core/auth/auth-error";
import { AUTH_OUTCOME, type AuthOutcome } from "@bestats/core/auth/messages";
import {
  type AuthError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

/**
 * Classifies a Supabase auth error into one of our outcomes (spec 0005).
 *
 * Done in one place for two reasons. The wording stays consistent across every
 * form, and, more importantly, this is the only function that ever touches the
 * raw error object. That object can carry the offending password or token in
 * its message, so it must never reach a log or a rendered message; here it is
 * reduced to a code and thrown away (AC-19).
 *
 * The matching itself is `classifyAuthFailure` in core, so the app reads the
 * same rule (AGENTS.md section 5); this half only pulls off the facts that
 * need auth-js's type guards, `reasons` and the missing session rewrite.
 *
 * @param error The error Supabase returned.
 * @returns The outcome to show and log.
 */
export function classifyAuthError(error: AuthError): AuthOutcome {
  return classifyAuthFailure({
    code: error.code,
    status: error.status,
    reasons: isAuthWeakPasswordError(error) ? error.reasons : undefined,
    sessionMissing: isAuthSessionMissingError(error),
  });
}

/**
 * Classifies a refused `profiles` write into one of our outcomes
 * (prompts/account-username.md).
 *
 * Lives beside `classifyAuthError` so this file stays the only code that reads
 * a raw Supabase error (`lib/auth/AGENTS.md`). Only the SQLSTATE is read:
 *
 * - `23505`, the unique index: the name is taken.
 * - `23514`, a check: Zod catches the format first, so in practice this is a
 *   reserved name, which is reported as taken so the list cannot be probed.
 * - `BS002`, raised by `guard_username_change`: the weekly lock.
 *
 * @param error Anything with an optional string `code`, as PostgREST returns.
 * @returns The outcome to show and log.
 */
export function classifyProfileWriteError(error: {
  code?: string | null;
}): AuthOutcome {
  switch (error.code) {
    case "23505":
    case "23514":
      return AUTH_OUTCOME.usernameTaken;
    case "BS002":
      return AUTH_OUTCOME.usernameLocked;
    default:
      return AUTH_OUTCOME.unexpected;
  }
}
