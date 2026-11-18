/**
 * covers: spec 0033, child 0036 (a 401 refreshes once, however many calls
 * failed together, and a call that 401s after a refresh reuses its token)
 */
const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
    },
  }),
}));
jest.mock("./env", () => ({
  getPublicEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "http://supabase.test",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
  }),
}));
jest.mock("./session-storage", () => ({ encryptedSessionStorage: {} }));

const { refreshAfterUnauthorized } =
  require("./supabase") as typeof import("./supabase");

function session(token: string | null) {
  return { data: { session: token ? { access_token: token } : null } };
}

beforeEach(() => {
  mockGetSession.mockReset();
  mockRefreshSession.mockReset();
});

test("refreshes when the session still holds the refused token", async () => {
  mockGetSession.mockResolvedValue(session("old"));
  mockRefreshSession.mockResolvedValue(session("new"));
  await expect(refreshAfterUnauthorized("old")).resolves.toBe("new");
  expect(mockRefreshSession).toHaveBeenCalledTimes(1);
});

test("shares one refresh between calls that failed together", async () => {
  mockGetSession.mockResolvedValue(session("old"));
  let finish: (value: unknown) => void = () => {};
  mockRefreshSession.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = refreshAfterUnauthorized("old");
  const second = refreshAfterUnauthorized("old");
  await new Promise((resolve) => setImmediate(resolve));
  finish(session("new"));
  await expect(Promise.all([first, second])).resolves.toEqual(["new", "new"]);
  expect(mockRefreshSession).toHaveBeenCalledTimes(1);
});

test("reuses a token another call already refreshed", async () => {
  mockGetSession.mockResolvedValue(session("new"));
  await expect(refreshAfterUnauthorized("old")).resolves.toBe("new");
  expect(mockRefreshSession).not.toHaveBeenCalled();
});

test("answers null when the session cannot be renewed", async () => {
  mockGetSession.mockResolvedValue(session("old"));
  mockRefreshSession.mockRejectedValue(new Error("refresh_token_not_found"));
  await expect(refreshAfterUnauthorized("old")).resolves.toBeNull();
});
