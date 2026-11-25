/**
 * covers: prompts/mobile-look-account.md, decisions 1 and 2 (the current
 * password is checked on a throwaway client that is signed out locally, the
 * app's own session is never replaced, each refusal marks the web's field);
 * spec 0005, AC-16 (a wrong current password changes nothing); AGENTS.md
 * section 11 (success only after Supabase accepted it).
 */
import {
  AUTH_MESSAGES,
  AUTH_OUTCOME,
  CHANGE_PASSWORD_COPY,
} from "@bestats/core/auth/messages";
import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";

const mockCheckSignIn = jest.fn();
const mockCheckSignOut = jest.fn();
const mockCreateClient = jest.fn();
jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      auth: {
        signInWithPassword: (input: unknown) => mockCheckSignIn(input),
        signOut: (options: unknown) => mockCheckSignOut(options),
      },
    };
  },
}));

const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockAppSignIn = jest.fn();
const mockAppSignOut = jest.fn();
let mockConfigMissing: "supabase" | "env" | null = null;
jest.mock("./supabase", () => ({
  getSupabase: () => {
    if (mockConfigMissing === "supabase") throw new Error("no config");
    return mockAppClient();
  },
}));
const mockAppClient = () => ({
  auth: {
    getSession: () => mockGetSession(),
    updateUser: (input: unknown) => mockUpdateUser(input),
    signInWithPassword: (input: unknown) => mockAppSignIn(input),
    signOut: (options: unknown) => mockAppSignOut(options),
  },
});
jest.mock("./env", () => ({
  getPublicEnv: () => {
    if (mockConfigMissing === "env") throw new Error("no config");
    return {
      EXPO_PUBLIC_SUPABASE_URL: "http://supabase.test",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
    };
  },
}));

const { changePassword } = require("./password") as typeof import("./password");

const VALID = {
  currentPassword: "old-Passw0rd",
  password: "a-new-Passw0rd",
  confirmPassword: "a-new-Passw0rd",
};

beforeEach(() => {
  mockConfigMissing = null;
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { email: "a@example.test" } } },
  });
  mockCheckSignIn.mockResolvedValue({ data: {}, error: null });
  mockCheckSignOut.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
});

test("checks the current password on a client that keeps no session", async () => {
  await expect(changePassword(VALID)).resolves.toEqual({
    status: "success",
    message: CHANGE_PASSWORD_COPY.changed,
  });
  const [, , options] = mockCreateClient.mock.calls[0] as [
    string,
    string,
    { auth: Record<string, unknown> },
  ];
  expect(options.auth).toMatchObject({
    persistSession: false,
    autoRefreshToken: false,
  });
  expect(options.auth.storageKey).not.toBe("bestats-auth");
  expect(mockCheckSignIn).toHaveBeenCalledWith({
    email: "a@example.test",
    password: VALID.currentPassword,
  });
  expect(mockCheckSignOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mockUpdateUser).toHaveBeenCalledWith({ password: VALID.password });
  // The app's own session is never replaced or ended.
  expect(mockAppSignIn).not.toHaveBeenCalled();
  expect(mockAppSignOut).not.toHaveBeenCalled();
});

test("refuses mismatched passwords under Confirm before any request", async () => {
  const result = await changePassword({ ...VALID, confirmPassword: "other" });
  expect(result.status).toBe("error");
  expect(result.fieldErrors?.confirmPassword).toBe(
    "The passwords don't match.",
  );
  expect(mockCheckSignIn).not.toHaveBeenCalled();
  expect(mockUpdateUser).not.toHaveBeenCalled();
});

test("marks a wrong current password and changes nothing", async () => {
  mockCheckSignIn.mockResolvedValue({
    data: {},
    error: new AuthApiError(
      "Invalid login credentials",
      400,
      "invalid_credentials",
    ),
  });
  const result = await changePassword(VALID);
  expect(result.fieldErrors?.currentPassword).toBe(
    AUTH_MESSAGES[AUTH_OUTCOME.wrongCurrentPassword],
  );
  expect(mockUpdateUser).not.toHaveBeenCalled();
  expect(mockCheckSignOut).toHaveBeenCalledWith({ scope: "local" });
});

test("never calls a rate limited check a wrong password", async () => {
  mockCheckSignIn.mockResolvedValue({
    data: {},
    error: new AuthApiError("Too many", 429, "over_request_rate_limit"),
  });
  const result = await changePassword(VALID);
  expect(result.message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.rateLimited]);
  expect(result.fieldErrors).toBeUndefined();
  expect(mockUpdateUser).not.toHaveBeenCalled();
});

test("puts a refused new password under its field", async () => {
  mockUpdateUser.mockResolvedValue({
    data: {},
    error: new AuthWeakPasswordError("weak", 422, ["pwned"]),
  });
  const result = await changePassword(VALID);
  expect(result.status).toBe("error");
  expect(result.fieldErrors?.password).toBe(
    AUTH_MESSAGES[AUTH_OUTCOME.passwordBreached],
  );
});

test("says the session ended when there is none, and checks nothing", async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  const result = await changePassword(VALID);
  expect(result.message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.sessionExpired]);
  expect(mockCheckSignIn).not.toHaveBeenCalled();
});

test("reads a thrown network failure as unexpected, never as success", async () => {
  mockUpdateUser.mockRejectedValue(new Error("offline"));
  const result = await changePassword(VALID);
  expect(result.message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
});

test.each(["supabase", "env"] as const)(
  "a missing %s config answers the unexpected error, never a throw",
  async (missing) => {
    mockConfigMissing = missing;
    const state = await changePassword(VALID);
    expect(state.status).toBe("error");
    expect(state.message).toBe(AUTH_MESSAGES[AUTH_OUTCOME.unexpected]);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  },
);
