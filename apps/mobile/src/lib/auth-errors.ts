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
