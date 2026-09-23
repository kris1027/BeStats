import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_STATE } from "@/lib/auth/action-state";
import { AUTH_OUTCOME, SIGN_IN_NOTICE } from "@/lib/auth/messages";

/**
 * The Auth server is the boundary, so the request scoped client is the one
 * thing replaced. `redirect()` throws in Next by design; the stand in throws a
 * recognisable value so a test can assert where the action went without
 * catching a real framework error.
 */
const auth = {
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { resetPasswordAction } = await import("./actions");

const NEW_PASSWORD = "a-fresh-Passw0rd-for-tests";
const RECOVERY_AMR = [{ method: "recovery", timestamp: 1_758_500_000 }];

function passwordForm(password: string): FormData {
  const form = new FormData();
  form.set("password", password);
  return form;
}

function claimsWith(amr: unknown) {
  return { data: { claims: { sub: "user-a", amr } }, error: null };
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const thrown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(thrown).toBeInstanceOf(RedirectSignal);
  return (thrown as RedirectSignal).url;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  auth.getClaims.mockResolvedValue(claimsWith(RECOVERY_AMR));
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.resetAllMocks();
  warn.mockRestore();
});

/**
 * covers: spec 0005, AC-8, AC-24
 *
 * `/reset-password` writes a password without asking for the current one, so
 * the gate in front of that write is the security boundary for account
 * takeover. These drive the real action against a stubbed Auth client and
 * assert what reaches the Auth server, not just what the form shows.
 */
describe("resetPasswordAction", () => {
  describe("with a recovery session (AC-8)", () => {
    it("saves the new password", async () => {
      await redirectOf(
        resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD)),
      );

      expect(auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    });

    it("spends the recovery session by signing out everywhere (AC-24)", async () => {
      await redirectOf(
        resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD)),
      );

      expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
      // The sign out follows the write, never precedes it, or the write would
      // run with no session at all.
      expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
        auth.signOut.mock.invocationCallOrder[0],
      );
    });

    it("sends the person to sign in with the reset notice, not to /account", async () => {
      const url = await redirectOf(
        resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD)),
      );

      expect(url).toBe(`/sign-in?notice=${SIGN_IN_NOTICE.passwordReset}`);
    });

    it("still reports success when the global sign out fails, because the password is saved", async () => {
      auth.signOut.mockResolvedValue({
        error: new AuthApiError("boom", 500, "unexpected_failure"),
      });

      const url = await redirectOf(
        resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD)),
      );

      expect(url).toBe(`/sign-in?notice=${SIGN_IN_NOTICE.passwordReset}`);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
        event: "auth.reset_password",
        result: "error",
        outcome: AUTH_OUTCOME.unexpected,
      });
    });
  });

  describe("without a recovery session (AC-24)", () => {
    it.each([
      ["no session at all", { data: null, error: null }],
      [
        "a claim set with no subject",
        { data: { claims: { amr: RECOVERY_AMR } }, error: null },
      ],
      [
        "an ordinary password session",
        claimsWith([{ method: "password", timestamp: 1_758_500_000 }]),
      ],
      ["a session with no amr claim", claimsWith(undefined)],
      ["the bare string amr form", claimsWith(["recovery"])],
    ])(
      "refuses %s as an expired session and writes nothing",
      async (_label, claims) => {
        auth.getClaims.mockResolvedValue(claims);

        const state = await resetPasswordAction(
          IDLE_STATE,
          passwordForm(NEW_PASSWORD),
        );

        expect(state).toMatchObject({
          status: "error",
          outcome: AUTH_OUTCOME.sessionExpired,
        });
        expect(auth.updateUser).not.toHaveBeenCalled();
        expect(auth.signOut).not.toHaveBeenCalled();
      },
    );

    it("attaches the refusal to no field, since the password itself was fine", async () => {
      auth.getClaims.mockResolvedValue(
        claimsWith([{ method: "password", timestamp: 1 }]),
      );

      const state = await resetPasswordAction(
        IDLE_STATE,
        passwordForm(NEW_PASSWORD),
      );

      expect(state.fieldErrors).toBeUndefined();
    });
  });

  describe("input and Auth refusals", () => {
    it("rejects an invalid password before asking for the session", async () => {
      const state = await resetPasswordAction(IDLE_STATE, passwordForm(""));

      expect(state).toMatchObject({
        status: "error",
        outcome: AUTH_OUTCOME.invalidInput,
      });
      expect(state.fieldErrors?.password).toBeDefined();
      expect(auth.getClaims).not.toHaveBeenCalled();
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it("marks the password field when Auth calls the password breached (AC-9)", async () => {
      auth.updateUser.mockResolvedValue({
        data: {},
        error: new AuthWeakPasswordError(
          "Password is known to be weak and easy to guess, please choose a different one.",
          422,
          ["pwned"],
        ),
      });

      const state = await resetPasswordAction(
        IDLE_STATE,
        passwordForm(NEW_PASSWORD),
      );

      expect(state.outcome).toBe(AUTH_OUTCOME.passwordBreached);
      expect(state.fieldErrors?.password).toBe(state.message);
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it("keeps an outage off the password field", async () => {
      auth.updateUser.mockResolvedValue({
        data: {},
        error: new AuthApiError("boom", 500, "unexpected_failure"),
      });

      const state = await resetPasswordAction(
        IDLE_STATE,
        passwordForm(NEW_PASSWORD),
      );

      expect(state.outcome).toBe(AUTH_OUTCOME.unexpected);
      expect(state.fieldErrors).toBeUndefined();
      expect(auth.signOut).not.toHaveBeenCalled();
    });
  });

  /**
   * covers: spec 0005, AC-19
   *
   * Every branch logs something or nothing; none may log the password.
   */
  it("never writes the password to the log on any branch", async () => {
    auth.getClaims.mockResolvedValueOnce(claimsWith(undefined));
    await resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD));

    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError(`bad ${NEW_PASSWORD}`, 500, "unexpected_failure"),
    });
    await resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD));

    auth.signOut.mockResolvedValueOnce({
      error: new AuthApiError(`bad ${NEW_PASSWORD}`, 500, "unexpected_failure"),
    });
    await redirectOf(
      resetPasswordAction(IDLE_STATE, passwordForm(NEW_PASSWORD)),
    );

    expect(warn).toHaveBeenCalledTimes(3);
    for (const [line] of warn.mock.calls) {
      expect(String(line)).not.toContain(NEW_PASSWORD);
    }
  });
});
