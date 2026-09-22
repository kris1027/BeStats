import { describe, expect, it } from "vitest";

import { failure, fromZodError } from "./action-state";
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  authMessage,
  RESEND_REQUESTED_MESSAGE,
  RESET_REQUESTED_MESSAGE,
} from "./messages";
import { signInSchema } from "./schemas";

/**
 * covers: spec 0005, AC-2, AC-5, AC-7, AC-19
 *
 * The neutrality guarantee is a property of the copy, so this is where it can
 * actually be checked. A message that names the address, or says "no account
 * with that email", turns the form into a membership lookup tool, and that
 * regression arrives as a well meaning copy edit, not as a code change.
 */
describe("neutral wording (AC-2, AC-5, AC-7)", () => {
  it("gives one message for a wrong password and an unknown address", () => {
    // They are the same outcome by construction: there is no second code for
    // an unknown address, so no branch can ever tell them apart.
    expect(authMessage(AUTH_OUTCOME.invalidCredentials)).toBe(
      AUTH_MESSAGES[AUTH_OUTCOME.invalidCredentials],
    );
  });

  it.each([
    ["invalid credentials", AUTH_MESSAGES[AUTH_OUTCOME.invalidCredentials]],
    ["reset requested", RESET_REQUESTED_MESSAGE],
    ["resend requested", RESEND_REQUESTED_MESSAGE],
  ])("the %s message reveals nothing about the address", (_name, message) => {
    expect(message).not.toMatch(/\bno account\b/i);
    expect(message).not.toMatch(/\balready (registered|exists|taken)\b/i);
    expect(message).not.toMatch(/\bnot found\b/i);
    expect(message).not.toMatch(/@/);
  });

  it("phrases both confirmations conditionally, so neither claims a message was sent", () => {
    // For an address with no account none was sent. "If" keeps it true.
    expect(RESET_REQUESTED_MESSAGE.toLowerCase()).toContain("if that address");
    expect(RESEND_REQUESTED_MESSAGE.toLowerCase()).toContain("if that address");
  });

  it("names neither the address nor the field at fault on a failed sign in", () => {
    const state = failure(AUTH_OUTCOME.invalidCredentials);
    expect(state.fieldErrors).toBeUndefined();
    expect(state.message).not.toMatch(/password|email/i);
  });
});

describe("failure()", () => {
  it("marks every field it is given with the same message", () => {
    const state = failure(AUTH_OUTCOME.passwordTooShort, ["password"]);
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.password).toBe(state.message);
    expect(state.outcome).toBe(AUTH_OUTCOME.passwordTooShort);
  });

  it("takes its copy from the message table, never from the caller", () => {
    for (const outcome of Object.values(AUTH_OUTCOME)) {
      expect(failure(outcome).message).toBe(AUTH_MESSAGES[outcome]);
    }
  });
});

describe("fromZodError()", () => {
  it("attaches one message per offending field", () => {
    const result = signInSchema.safeParse({ email: "nope", password: "" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const state = fromZodError(result.error);
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.email).toBeDefined();
    expect(state.fieldErrors?.password).toBeDefined();
  });

  it("keeps only the first issue per field", () => {
    const result = signInSchema.safeParse({ email: "", password: "" });
    if (result.success) return;

    const state = fromZodError(result.error);
    // One string, not a joined list: three messages under one input is noise.
    expect(typeof state.fieldErrors?.email).toBe("string");
  });
});
