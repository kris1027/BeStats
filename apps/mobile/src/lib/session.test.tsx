import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

/**
 * covers: spec 0033, AC-13 and child 0036 (an expired session and a chosen
 * sign out always end signed out, with the private cache wiped, even when
 * supabase-js refuses the sign out and sends no event;
 * prompts/mobile-forced-sign-out.md)
 */
const mockSignOutLocally = jest.fn(async () => {});
const mockSignOut = jest.fn();
const mockClearPrivate = jest.fn();
let mockExpiredHandler: () => Promise<void> = async () => {};
const SESSION = { access_token: "t", user: { email: "a@example.test" } };
let mockStoredSession: typeof SESSION | null = SESSION;

jest.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockStoredSession } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signOut: (options?: unknown) => mockSignOut(options),
    },
  }),
  signOutLocally: () => mockSignOutLocally(),
  watchAppStateForRefresh: () => () => {},
}));
jest.mock("./api", () => ({
  setSessionExpiredHandler: (handler: () => Promise<void>) => {
    mockExpiredHandler = handler;
  },
}));
jest.mock("./query-client", () => ({
  clearPrivateQueries: () => mockClearPrivate(),
}));

const { SessionProvider, useSession, wipePrivateCacheIfSignedOut } =
  require("./session") as typeof import("./session");

let signOut: () => Promise<void> = async () => {};
function Probe() {
  const state = useSession();
  signOut = state.signOut;
  return (
    <>
      <Text>{state.session ? "signed in" : "signed out"}</Text>
      {state.notice ? <Text>{state.notice}</Text> : null}
    </>
  );
}

async function renderSignedIn() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(await screen.findByText("signed in")).toBeOnTheScreen();
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("an expired session ends signed out with the notice, with no event", async () => {
  await renderSignedIn();
  await act(() => mockExpiredHandler());
  expect(mockSignOutLocally).toHaveBeenCalledTimes(1);
  expect(mockClearPrivate).toHaveBeenCalled();
  expect(screen.getByText("signed out")).toBeOnTheScreen();
  expect(
    screen.getByText("Your session expired, sign in again."),
  ).toBeOnTheScreen();
});

test("a refused global sign out falls back to a local one", async () => {
  mockSignOut.mockResolvedValue({ error: new Error("refused") });
  await renderSignedIn();
  await act(() => signOut());
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockSignOutLocally).toHaveBeenCalledTimes(1);
  expect(mockClearPrivate).toHaveBeenCalled();
  expect(screen.getByText("signed out")).toBeOnTheScreen();
});

test("an accepted global sign out needs no local fallback", async () => {
  mockSignOut.mockResolvedValue({ error: null });
  await renderSignedIn();
  await act(() => signOut());
  expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
  expect(mockSignOutLocally).not.toHaveBeenCalled();
  expect(screen.getByText("signed out")).toBeOnTheScreen();
});

/**
 * covers: spec 0033, AC-13 (a persisted cache restored with no stored
 * session is wiped at once, prompts/mobile-offline-about.md, decision 3)
 */
describe("after the persisted cache is restored", () => {
  afterEach(() => {
    mockStoredSession = SESSION;
  });

  test("wipes the private entries when no session is stored", async () => {
    mockClearPrivate.mockClear();
    mockStoredSession = null;
    await wipePrivateCacheIfSignedOut();
    expect(mockClearPrivate).toHaveBeenCalledTimes(1);
  });

  test("keeps them for the signed in user", async () => {
    mockClearPrivate.mockClear();
    await wipePrivateCacheIfSignedOut();
    expect(mockClearPrivate).not.toHaveBeenCalled();
  });
});
