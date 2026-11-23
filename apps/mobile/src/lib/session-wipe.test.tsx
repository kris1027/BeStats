import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "@/components/text";

/**
 * covers: spec 0033, AC-13 and child 0036 (sign out, an expired session and
 * account deletion each leave no `"me"` entry in AsyncStorage;
 * prompts/mobile-offline-about.md: "Tests assert the AsyncStorage entry no
 * longer holds any `"me"` key after each"). Unlike `session.test.tsx`, the
 * real query cache and persister run here, so the assertion is on disk.
 */
let mockExpiredHandler: () => Promise<void> = async () => {};

jest.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "t", user: { email: "a@x.test" } } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signOut: async () => ({ error: null }),
    },
  }),
  signOutLocally: async () => {},
  watchAppStateForRefresh: () => () => {},
}));
jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  setSessionExpiredHandler: (handler: () => Promise<void>) => {
    mockExpiredHandler = handler;
  },
}));

const { QUERY_CACHE_STORAGE_KEY, queryClient } =
  require("./query-client") as typeof import("./query-client");
const { SessionProvider, useSession } =
  require("./session") as typeof import("./session");

let actions: ReturnType<typeof useSession> | null = null;
function Probe() {
  actions = useSession();
  return <Text>{actions.session ? "signed in" : "signed out"}</Text>;
}

/** Writes a cache holding one private and one public query to disk. */
async function persistPrivateCache() {
  queryClient.setQueryData(["me", "titles", "movie:603"], { planned: true });
  queryClient.setQueryData(["catalog", "movie", 603], { id: 603 });
  await persistQueryClientSave({
    queryClient,
    persister: createAsyncStoragePersister({
      storage: AsyncStorage,
      key: QUERY_CACHE_STORAGE_KEY,
      throttleTime: 0,
    }),
  });
  await waitFor(async () =>
    expect(await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toContain(
      '"me"',
    ),
  );
}

async function expectNoPrivateEntryOnDisk() {
  await waitFor(async () => {
    const stored = await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    expect(stored ?? "").not.toContain('"me"');
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  queryClient.clear();
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  expect(await screen.findByText("signed in")).toBeOnTheScreen();
  await persistPrivateCache();
});

afterAll(() => queryClient.clear());

test("sign out", async () => {
  await act(() => actions?.signOut());
  await expectNoPrivateEntryOnDisk();
});

test("an expired session", async () => {
  await act(() => mockExpiredHandler());
  await expectNoPrivateEntryOnDisk();
});

test("account deletion", async () => {
  await act(() => actions?.endLocalSession());
  await expectNoPrivateEntryOnDisk();
});
