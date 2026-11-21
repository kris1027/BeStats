import { describe, expect, it } from "vitest";

import { classifyAuthFailure, isAlreadyRegistered } from "./auth-error";
import { AUTH_OUTCOME } from "./messages";

/**
 * covers: spec 0005, AC-9, AC-18; spec 0018, AC-12; spec 0035 (Sign up on
 * mobile). The web's `supabase-error.test.ts` runs the same rule through
 * real auth-js errors; these pin the plain facts both apps hand in.
 */
describe("classifyAuthFailure", () => {
  it.each([
    [{ status: 429 }, AUTH_OUTCOME.rateLimited],
    [{ code: "over_request_rate_limit" }, AUTH_OUTCOME.rateLimited],
    [{ code: "over_email_send_rate_limit" }, AUTH_OUTCOME.rateLimited],
    [{ code: "invalid_credentials" }, AUTH_OUTCOME.invalidCredentials],
    [{ code: "user_not_found" }, AUTH_OUTCOME.invalidCredentials],
    [{ code: "email_not_confirmed" }, AUTH_OUTCOME.emailNotConfirmed],
    [{ code: "flow_state_expired" }, AUTH_OUTCOME.invalidLink],
    [{ code: "refresh_token_not_found" }, AUTH_OUTCOME.sessionExpired],
    [{ sessionMissing: true }, AUTH_OUTCOME.sessionExpired],
    [
      { code: "weak_password", reasons: ["pwned"] },
      AUTH_OUTCOME.passwordBreached,
    ],
    [
      { code: "weak_password", reasons: ["length"] },
      AUTH_OUTCOME.passwordTooShort,
    ],
    [{ code: "weak_password" }, AUTH_OUTCOME.passwordTooShort],
    [{ code: "unexpected_failure", status: 500 }, AUTH_OUTCOME.unexpected],
    [{}, AUTH_OUTCOME.unexpected],
  ])("maps %j", (facts, outcome) => {
    expect(classifyAuthFailure(facts)).toBe(outcome);
  });
});

describe("isAlreadyRegistered", () => {
  it("reads the installed server's user_already_exists", () => {
    expect(isAlreadyRegistered({ code: "user_already_exists" }, null)).toBe(
      true,
    );
  });

  it("reads the obfuscated empty identities form", () => {
    expect(isAlreadyRegistered(null, { identities: [] })).toBe(true);
  });

  it("is false for a new account or any other error", () => {
    expect(isAlreadyRegistered(null, { identities: [{}] })).toBe(false);
    expect(isAlreadyRegistered({ code: "weak_password" }, null)).toBe(false);
    expect(isAlreadyRegistered(null, null)).toBe(false);
  });
});
