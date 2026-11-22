/**
 * covers: spec 0035 (Sign up on mobile: the app shows core's words for a
 * Supabase Auth refusal, the same as the web), AGENTS.md section 11 (the raw
 * error message never reaches the screen).
 */
import { AUTH_MESSAGES, AUTH_OUTCOME } from "@bestats/core/auth/messages";
import {
  AuthApiError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";

import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  test("a null error, a thrown network failure, reads as unexpected", () => {
    expect(authErrorMessage(null)).toBe(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
  });

  test("wrong details read the neutral invalid credentials copy", () => {
    const error = new AuthApiError(
      "Invalid login credentials",
      400,
      "invalid_credentials",
    );
    expect(authErrorMessage(error)).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.invalidCredentials],
    );
  });

  test("an unknown address reads the same as a wrong password", () => {
    const unknown = new AuthApiError("User not found", 400, "user_not_found");
    const wrong = new AuthApiError("bad", 400, "invalid_credentials");
    expect(authErrorMessage(unknown)).toBe(authErrorMessage(wrong));
  });

  test("a 429 reads as rate limited whatever its code", () => {
    const error = new AuthApiError("Too many", 429, undefined);
    expect(authErrorMessage(error)).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.rateLimited],
    );
  });

  test("a weak password with the pwned reason reads as breached", () => {
    const error = new AuthWeakPasswordError("weak", 422, ["pwned"]);
    expect(authErrorMessage(error)).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.passwordBreached],
    );
  });

  test("a weak password without the pwned reason reads as too short", () => {
    const error = new AuthWeakPasswordError("weak", 422, ["length"]);
    expect(authErrorMessage(error)).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.passwordTooShort],
    );
  });

  test("a missing session reads as expired, not an outage", () => {
    expect(authErrorMessage(new AuthSessionMissingError())).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.sessionExpired],
    );
  });

  test("never passes the raw message through, even for an unknown code", () => {
    const secret = "password hunter2 rejected for user@example.com";
    const error = new AuthApiError(secret, 500, "some_new_code");
    const message = authErrorMessage(error);
    expect(message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("user@example.com");
  });
});
