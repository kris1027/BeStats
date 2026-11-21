import { AUTH_OUTCOME, type AuthOutcome } from "./messages";

/**
 * The parts of a Supabase Auth error the classifier reads, already pulled off
 * the raw error by the app (the web's `classifyAuthError`, the app's
 * `authErrorMessage`). Core cannot import auth-js (packages/core/AGENTS.md,
 * Pure only), so the two facts that need its type guards arrive as plain
 * values: `reasons` only from a weak password error, and `sessionMissing`
 * from `isAuthSessionMissingError`.
 */
export type AuthErrorFacts = {
  code?: string;
  status?: number;
  reasons?: readonly string[];
  sessionMissing?: boolean;
};

/**
 * Classifies a Supabase Auth error into one of our outcomes, the one rule both
 * apps run so the phone and the web show the same words for the same refusal
 * (spec 0005; AGENTS.md section 5, business rules in core).
 *
 * Matching is on `code`, which Supabase added so callers would stop matching
 * on message text, and the raw message never reaches the result, since it can
 * carry the offending password or token (AGENTS.md section 11).
 */
export function classifyAuthFailure(error: AuthErrorFacts): AuthOutcome {
  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return AUTH_OUTCOME.rateLimited;
  }

  // auth-js rewrites Auth's 403 `session_not_found` into an error with no
  // `code`, so the switch below never matches it. A revoked or spent session
  // (a replayed recovery cookie, AC-24) must read as expired, not an outage.
  if (error.sessionMissing) return AUTH_OUTCOME.sessionExpired;

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
      // One code covers both rules, and the installed Auth server's breach
      // message never says "pwned". auth-js carries the real signal as
      // `reasons`, where `pwned` means a breach (AC-9).
      return error.reasons?.includes("pwned")
        ? AUTH_OUTCOME.passwordBreached
        : AUTH_OUTCOME.passwordTooShort;
    default:
      return AUTH_OUTCOME.unexpected;
  }
}

/**
 * Whether a sign up met an address that already has an account, as the web
 * action and the app both ask (spec 0018, AC-12; AGENTS.md section 5).
 *
 * Supabase reports it two ways: `user_already_exists`, a plain 422 from the
 * installed version, or an empty `identities` array, the obfuscated form older
 * and differently configured versions send. Which one arrives is a property of
 * the Auth server, not of this code, so both count.
 */
export function isAlreadyRegistered(
  error: { code?: string } | null,
  user: { identities?: readonly unknown[] | null } | null | undefined,
): boolean {
  return (
    error?.code === "user_already_exists" ||
    (!error && user?.identities?.length === 0)
  );
}
