import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_STATE } from "@/lib/auth/action-state";
import {
  AUTH_OUTCOME,
  USERNAME_UNCHANGED_MESSAGE,
  USERNAME_UPDATED_MESSAGE,
} from "@/lib/auth/messages";

/**
 * The database is the judge of the lock and of uniqueness, so the client is
 * replaced and each refusal it can send is played back.
 */
const upsert = vi.fn();
const from = vi.fn();
const getOptionalUser = vi.fn();
const getOwnProfile = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));
vi.mock("@/lib/auth/user", () => ({ getOptionalUser }));
vi.mock("@/lib/auth/profile", () => ({ getOwnProfile }));
vi.mock("next/cache", () => ({ refresh }));

const { changeUsernameAction } = await import("./actions");

function usernameForm(username: string): FormData {
  const form = new FormData();
  form.set("username", username);
  return form;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  from.mockReturnValue({ upsert });
  upsert.mockResolvedValue({ error: null });
  getOptionalUser.mockResolvedValue({ id: "user-a", email: "a@example.com" });
  getOwnProfile.mockResolvedValue(null);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.resetAllMocks();
  warn.mockRestore();
});

/** covers: prompts/account-username.md, R2, R6 */
describe("changeUsernameAction", () => {
  it("saves a valid name for the session's user and refreshes the page", async () => {
    const state = await changeUsernameAction(
      IDLE_STATE,
      usernameForm("  tester_one "),
    );

    expect(state).toMatchObject({
      status: "success",
      message: USERNAME_UPDATED_MESSAGE,
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-a", username: "tester_one" },
      { onConflict: "user_id" },
    );
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ["a", "at least 2"],
    ["has space", "spaces"],
    ["émile", "only letters"],
    ["-dash", "start or end"],
  ])("refuses %s on the field before any write", async (value, fragment) => {
    const state = await changeUsernameAction(IDLE_STATE, usernameForm(value));

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.username).toContain(fragment);
    expect(state.values?.username).toBe(value);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("calls a reserved name taken, so the list is not revealed", async () => {
    const state = await changeUsernameAction(IDLE_STATE, usernameForm("Admin"));

    expect(state.fieldErrors?.username).toBe("That username is taken.");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("says nothing changed for the name already set, without writing", async () => {
    getOwnProfile.mockResolvedValue({
      username: "tester_one",
      usernameChangedAt: new Date(),
    });

    const state = await changeUsernameAction(
      IDLE_STATE,
      usernameForm("tester_one"),
    );

    expect(state.message).toBe(USERNAME_UNCHANGED_MESSAGE);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["the unique index", { code: "23505" }, AUTH_OUTCOME.usernameTaken],
    ["a check", { code: "23514" }, AUTH_OUTCOME.usernameTaken],
    ["the weekly lock", { code: "BS002" }, AUTH_OUTCOME.usernameLocked],
    ["anything else", { code: "08006" }, AUTH_OUTCOME.unexpected],
  ])("reports a refusal from %s", async (_, error, outcome) => {
    upsert.mockResolvedValue({ error });

    const state = await changeUsernameAction(
      IDLE_STATE,
      usernameForm("tester_one"),
    );

    expect(state.outcome).toBe(outcome);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("writes nothing without a session", async () => {
    getOptionalUser.mockResolvedValue(null);

    const state = await changeUsernameAction(
      IDLE_STATE,
      usernameForm("tester_one"),
    );

    expect(state.outcome).toBe(AUTH_OUTCOME.sessionExpired);
    expect(from).not.toHaveBeenCalled();
  });
});
