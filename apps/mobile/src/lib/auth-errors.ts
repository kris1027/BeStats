import { classifyAuthFailure } from "@bestats/core/auth/auth-error";
import { AUTH_MESSAGES, AUTH_OUTCOME } from "@bestats/core/auth/messages";
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
  if (!error) return AUTH_MESSAGES[AUTH_OUTCOME.unexpected];
  return AUTH_MESSAGES[
    classifyAuthFailure({
      code: error.code,
      status: error.status,
      reasons: isAuthWeakPasswordError(error) ? error.reasons : undefined,
      sessionMissing: isAuthSessionMissingError(error),
    })
  ];
}
