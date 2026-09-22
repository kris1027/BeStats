import "server-only";

import type { AuthError } from "@supabase/supabase-js";

import { AUTH_OUTCOME, type AuthOutcome } from "./messages";

/**
 * Classifies a Supabase auth error into one of our outcomes (spec 0005).
 *
 * Done in one place for two reasons. The wording stays consistent across every
 * form, and, more importantly, this is the only function that ever touches the
 * raw error object. That object can carry the offending password or token in
 * its message, so it must never reach a log or a rendered message; here it is
 * reduced to a code and thrown away (AC-19).
 *
 * Matching is on `error.code` first, which Supabase added precisely so callers
 * would stop matching on message text, with a narrow message fallback for the
 * weak password case whose code does not distinguish length from breach.
 *
 * @param error The error Supabase returned.
 * @returns The outcome to show and log.
 */
export function classifyAuthError(error: AuthError): AuthOutcome {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return AUTH_OUTCOME.rateLimited;
  }

  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return AUTH_OUTCOME.invalidCredentials;
    case "email_not_confirmed":
      return AUTH_OUTCOME.emailNotConfirmed;
    case "otp_expired":
    case "validation_failed":
      return AUTH_OUTCOME.invalidLink;
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return AUTH_OUTCOME.sessionExpired;
    case "weak_password":
      // One code covers both rules, so the message is the only signal for which
      // one fired. `pwned` is the substring Supabase's leaked password check
      // uses; anything else under this code is a length or composition refusal.
      return /pwned|breach|leaked/i.test(error.message)
        ? AUTH_OUTCOME.passwordBreached
        : AUTH_OUTCOME.passwordTooShort;
    default:
      return AUTH_OUTCOME.unexpected;
  }
}
