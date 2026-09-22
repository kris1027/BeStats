import {
  AuthApiError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { AUTH_OUTCOME } from "./messages";
import { classifyAuthError } from "./supabase-error";

describe("classifyAuthError", () => {
  it("treats a revoked session as expired, in the form the SDK actually returns", () => {
    // auth-js rewrites Auth's 403 `session_not_found` into this error, which
    // carries no code. Replaying a spent recovery cookie produces exactly this.
    expect(classifyAuthError(new AuthSessionMissingError())).toBe(
      AUTH_OUTCOME.sessionExpired,
    );
  });

  it("still maps the raw session_not_found code", () => {
    expect(
      classifyAuthError(
        new AuthApiError("Session not found", 403, "session_not_found"),
      ),
    ).toBe(AUTH_OUTCOME.sessionExpired);
  });

  it("keeps an unknown error unexpected", () => {
    expect(
      classifyAuthError(new AuthApiError("boom", 500, "unexpected_failure")),
    ).toBe(AUTH_OUTCOME.unexpected);
  });

  /*
   * covers: spec 0005, AC-18
   *
   * The local stack does not apply the rate limits, so these prove our side is
   * ready for the refusal the hosted project will send (feature 20).
   */
  it("treats a 429 as rate limited", () => {
    expect(
      classifyAuthError(
        new AuthApiError(
          "Request rate limit reached",
          429,
          "over_request_rate_limit",
        ),
      ),
    ).toBe(AUTH_OUTCOME.rateLimited);
  });

  it("treats the email send limit as rate limited", () => {
    expect(
      classifyAuthError(
        new AuthApiError(
          "Email rate limit exceeded",
          400,
          "over_email_send_rate_limit",
        ),
      ),
    ).toBe(AUTH_OUTCOME.rateLimited);
  });

  /*
   * covers: spec 0005, AC-9
   *
   * The breach refusal uses the Auth server's real wording, which never says
   * "pwned", so a regression to matching on the message fails here.
   */
  it("reads a breach from reasons, not from the message", () => {
    expect(
      classifyAuthError(
        new AuthWeakPasswordError(
          "Password is known to be weak and easy to guess, please choose a different one.",
          422,
          ["pwned"],
        ),
      ),
    ).toBe(AUTH_OUTCOME.passwordBreached);
  });

  it("treats a length refusal as too short", () => {
    expect(
      classifyAuthError(
        new AuthWeakPasswordError(
          "Password should be at least 8 characters.",
          422,
          ["length"],
        ),
      ),
    ).toBe(AUTH_OUTCOME.passwordTooShort);
  });
});
