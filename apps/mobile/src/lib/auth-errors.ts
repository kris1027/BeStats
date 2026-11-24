import { classifyAuthFailure } from "@bestats/core/auth/auth-error";
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  type AuthOutcome,
} from "@bestats/core/auth/messages";
import {
  type AuthError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

/**
 * The words for a Supabase Auth error on sign in or sign up, through core's
 * `classifyAuthFailure`, the rule the web's `classifyAuthError` runs, so the
 * app and `/sign-in` say the same thing (AGENTS.md section 5; spec 0035, Sign
 * up on mobile). Only the facts the rule reads leave the raw error, never its
 * message (AGENTS.md section 11). `null`, a thrown network failure, reads as
 * unexpected.
 */
export function authErrorMessage(error: AuthError | null): string {
  return AUTH_MESSAGES[authErrorOutcome(error)];
}

/**
 * The classified outcome behind `authErrorMessage`, for a form that marks a
 * field as well as saying why: a password rule refusal belongs to the
 * password field, a wrong current password to its field, and nothing else
 * marks one (core's `passwordFieldFor`; prompts/mobile-look-account.md,
 * decision 2). Like `authErrorMessage`, only the classified facts leave the
 * raw error (AGENTS.md section 11).
 */
export function authErrorOutcome(error: AuthError | null): AuthOutcome {
  if (!error) return AUTH_OUTCOME.unexpected;
  return classifyAuthFailure({
    code: error.code,
    status: error.status,
    reasons: isAuthWeakPasswordError(error) ? error.reasons : undefined,
    sessionMissing: isAuthSessionMissingError(error),
  });
}
