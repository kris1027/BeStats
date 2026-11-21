import { IDLE_STATE } from "@bestats/core/auth/action-state";
import { AUTH_OUTCOME, DELETE_ACCOUNT_COPY } from "@bestats/core/auth/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0033, AC-12 (the web half) and AGENTS.md section 11. The Auth
 * server and Postgres are the boundary: the request scoped client, the session
 * lookup and `redirect` are replaced.
 */
const auth = { signOut: vi.fn() };
const rpc = vi.fn();
const getOptionalUser = vi.fn();
const redirect = vi.fn((_path: string) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth, rpc }),
}));
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));
vi.mock("next/navigation", () => ({ redirect }));

const { deleteAccountAction } = await import("./actions");

function form(confirm: string): FormData {
  const data = new FormData();
  data.set("confirm", confirm);
  return data;
}

beforeEach(() => {
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.com" });
  rpc.mockResolvedValue({ data: null, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("deleteAccountAction", () => {
  it("deletes through the function, signs out locally, then leaves", async () => {
    await expect(
      deleteAccountAction(IDLE_STATE, form("DELETE")),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(rpc).toHaveBeenCalledWith("delete_own_account");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).toHaveBeenCalledWith("/shows");
  });

  it.each(["delete", "", "DELETE "])(
    "deletes nothing when the field holds %j",
    async (typed) => {
      const state = await deleteAccountAction(IDLE_STATE, form(typed));
      expect(state).toMatchObject({
        status: "error",
        outcome: AUTH_OUTCOME.invalidInput,
        message: DELETE_ACCOUNT_COPY.confirmLabel,
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("deletes nothing without a session", async () => {
    getOptionalUser.mockResolvedValue(null);
    const state = await deleteAccountAction(IDLE_STATE, form("DELETE"));
    expect(state.outcome).toBe(AUTH_OUTCOME.sessionExpired);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stays signed in and says so when Postgres refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    const state = await deleteAccountAction(IDLE_STATE, form("DELETE"));
    expect(state).toMatchObject({
      status: "error",
      message: DELETE_ACCOUNT_COPY.failed,
      outcome: AUTH_OUTCOME.unexpected,
    });
    expect(console.warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: "auth.delete_account",
        result: "error",
        outcome: AUTH_OUTCOME.unexpected,
      }),
    );
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
