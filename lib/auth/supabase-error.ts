import "server-only";

import {
  type AuthError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

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
 * Matching is on `error.code`, which Supabase added precisely so callers would
 * stop matching on message text. The weak password case is the one code that
 * covers two rules, so it reads the `reasons` list auth-js attaches instead.
 *
 * @param error The error Supabase returned.
 * @returns The outcome to show and log.
 */
export function classifyAuthError(error: AuthError): AuthOutcome {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return AUTH_OUTCOME.rateLimited;
  }

  // auth-js rewrites Auth's 403 `session_not_found` into this error before we
  // see it, and the rewrite has no `code`, so the switch below never matches
  // it. A revoked or spent session (a replayed recovery cookie, AC-24) must
  // read as expired, not as an outage.
  if (isAuthSessionMissingError(error)) {
    return AUTH_OUTCOME.sessionExpired;
  }

  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return AUTH_OUTCOME.invalidCredentials;
    case "email_not_confirmed":
      return AUTH_OUTCOME.emailNotConfirmed;
    case "otp_expired":
    case "validation_failed":
    // The `code` exchange only works in the browser that started the flow, so
    // opening the email on another device lands here. That is a link problem,
    // not an outage, and a sign up link has usually confirmed the address
    // already by the time the exchange fails.
    case "pkce_code_verifier_not_found":
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
      return AUTH_OUTCOME.invalidLink;
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return AUTH_OUTCOME.sessionExpired;
    case "weak_password":
      // One code covers both rules. The message cannot tell them apart: the
      // installed Auth server's breach refusal says "known to be weak and easy
      // to guess", never "pwned". auth-js carries the real signal as
      // `reasons`, where `pwned` means a breach (AC-9).
      return isAuthWeakPasswordError(error) && error.reasons.includes("pwned")
        ? AUTH_OUTCOME.passwordBreached
        : AUTH_OUTCOME.passwordTooShort;
    default:
      return AUTH_OUTCOME.unexpected;
  }
}
