import { describe, expect, it } from "vitest";

import { failure, keepEmail } from "./action-state";
import { AUTH_OUTCOME } from "./messages";

/**
 * covers: spec 0005, AC-21
 *
 * React 19 resets a form's inputs once its action returns, so the email only
 * survives a refusal if the state carries it back. The password never may.
 */
describe("keepEmail", () => {
  it("carries the raw email and never the password", () => {
    const form = new FormData();
    form.set("email", "typo@exmaple");
    form.set("password", "a-secret-Passw0rd");

    const state = keepEmail(failure(AUTH_OUTCOME.invalidCredentials), form);

    expect(state.values).toEqual({ email: "typo@exmaple" });
    expect(JSON.stringify(state)).not.toContain("a-secret-Passw0rd");
    expect(state.outcome).toBe(AUTH_OUTCOME.invalidCredentials);
  });

  it("leaves the state alone when no email was submitted", () => {
    const state = failure(AUTH_OUTCOME.rateLimited);

    expect(keepEmail(state, new FormData())).toBe(state);
  });
});
