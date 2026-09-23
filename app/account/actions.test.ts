import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_STATE } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";

/**
 * The Auth server is the boundary, so the request scoped client and the
 * session lookup are the two things replaced.
 */
const auth = {
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

vi.mock("@/lib/auth/user", () => ({
  getOptionalUser: async () => ({ id: "user-a", email: "a@example.com" }),
}));

const { changePasswordAction } = await import("./actions");

function changeForm(): FormData {
  const form = new FormData();
  form.set("currentPassword", "the-current-Passw0rd");
  form.set("password", "a-fresh-Passw0rd-for-tests");
  return form;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.resetAllMocks();
  warn.mockRestore();
});

/**
 * covers: spec 0005, AC-16
 *
 * A field is only marked when the failure is about what was typed into it.
 * Anything else, a rate limit or an outage, must not tell the person that a
 * correct password is wrong.
 */
describe("changePasswordAction", () => {
  describe("checking the current password", () => {
    it("marks the current password when the credentials are refused", async () => {
      auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: new AuthApiError("nope", 400, "invalid_credentials"),
      });

      const state = await changePasswordAction(IDLE_STATE, changeForm());

      expect(state.outcome).toBe(AUTH_OUTCOME.wrongCurrentPassword);
      expect(state.fieldErrors?.currentPassword).toBeDefined();
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it.each([
      ["an outage", new AuthApiError("boom", 500, "unexpected_failure")],
      [
        "a rate limit",
        new AuthApiError("slow down", 429, "over_request_rate_limit"),
      ],
    ])("reports %s as itself, not as a wrong password", async (_, error) => {
      auth.signInWithPassword.mockResolvedValue({ data: {}, error });

      const state = await changePasswordAction(IDLE_STATE, changeForm());

      expect(state.outcome).not.toBe(AUTH_OUTCOME.wrongCurrentPassword);
      expect(state.fieldErrors).toBeUndefined();
      expect(auth.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("saving the new password", () => {
    it("marks the new password for a rule failure", async () => {
      auth.updateUser.mockResolvedValue({
        data: {},
        error: new AuthWeakPasswordError("weak", 422, ["length"]),
      });

      const state = await changePasswordAction(IDLE_STATE, changeForm());

      expect(state.outcome).toBe(AUTH_OUTCOME.passwordTooShort);
      expect(state.fieldErrors?.password).toBeDefined();
    });

    it.each([
      ["an outage", new AuthApiError("boom", 500, "unexpected_failure")],
      [
        "a rate limit",
        new AuthApiError("slow down", 429, "over_request_rate_limit"),
      ],
    ])("does not mark the new password for %s", async (_, error) => {
      auth.updateUser.mockResolvedValue({ data: {}, error });

      const state = await changePasswordAction(IDLE_STATE, changeForm());

      expect(state.status).toBe("error");
      expect(state.fieldErrors).toBeUndefined();
    });
  });
});
