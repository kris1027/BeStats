import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  type AuthOutcome,
} from "@bestats/core/auth/messages";

/**
 * Maps a Supabase Auth sign in error to the web's outcome words, so the app
 * shows the same English copy as `/sign-in` (spec 0033, shared contracts).
 * Never shows the raw error text (AGENTS.md section 11).
 */
export function signInErrorMessage(error: {
  code?: string;
  status?: number;
}): string {
  let outcome: AuthOutcome = AUTH_OUTCOME.unexpected;
  if (error.code === "invalid_credentials") {
    outcome = AUTH_OUTCOME.invalidCredentials;
  } else if (error.code === "email_not_confirmed") {
    outcome = AUTH_OUTCOME.emailNotConfirmed;
  } else if (error.status === 429 || error.code === "over_request_rate_limit") {
    outcome = AUTH_OUTCOME.rateLimited;
  }
  return AUTH_MESSAGES[outcome];
}

/**
 * Maps a Supabase Auth sign up error to the web's outcome words, the same
 * cases `classifyAuthError` reads on the web (spec 0035, Sign up on mobile):
 * a weak password says too short, or breached when auth-js lists `pwned`, and
 * a rate limit says so. Never the raw error text (AGENTS.md section 11).
 */
export function signUpErrorMessage(error: {
  code?: string;
  status?: number;
  reasons?: string[];
}): string {
  let outcome: AuthOutcome = AUTH_OUTCOME.unexpected;
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    outcome = AUTH_OUTCOME.rateLimited;
  } else if (error.code === "weak_password") {
    outcome = error.reasons?.includes("pwned")
      ? AUTH_OUTCOME.passwordBreached
      : AUTH_OUTCOME.passwordTooShort;
  }
  return AUTH_MESSAGES[outcome];
}
