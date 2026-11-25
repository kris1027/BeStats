import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";

import { appVersion } from "./api";
import { catalogKeys } from "./catalog";
import {
  cacheBuster,
  clearPrivateQueries,
  PERSIST_MAX_AGE_MS,
  persistOptions,
  QUERY_CACHE_STORAGE_KEY,
  queryClient,
  shouldPersistQuery,
} from "./query-client";

/** No garbage collection timers, so a test leaves nothing running. */
function testClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function seed(client: QueryClient) {
  client.setQueryData(["me", "titles", "movie:603"], { planned: false });
  client.setQueryData(["catalog", "movie", 603], { id: 603 });
  client.getMutationCache().build(client, { mutationFn: async () => null });
}

beforeEach(() => AsyncStorage.clear());

/**
 * covers: spec 0033, AC-13 (sign out leaves no private data in the cache),
 * and prompts/mobile-sign-out-spinner.md (public catalog queries stay, so an
 * open screen keeps what it shows)
 */
test("wipes every me query and mutation, and keeps the catalog", async () => {
  const client = testClient();
  seed(client);

  await clearPrivateQueries(client, { removeClient: jest.fn() });

  expect(client.getQueryData(["me", "titles", "movie:603"])).toBeUndefined();
  expect(client.getQueryData(["catalog", "movie", 603])).toEqual({ id: 603 });
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});

/** covers: spec 0033, AC-13 (the wipe reaches the disk, child 0036) */
test("removes the persisted cache, so no me entry stays on disk", async () => {
  const client = testClient();
  seed(client);
  const persister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: 0,
  });
  await persistQueryClientSave({ queryClient: client, persister });
  await new Promise((done) => setTimeout(done, 0));
  expect(await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toContain('"me"');

  await clearPrivateQueries(client, persister);

  expect(await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
});

/** covers: spec 0033, AC-13 (child 0036, Offline cache and sign out) */
test("persists 24 hours of successful queries, never mutations, per app version", () => {
  expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE_MS);
  expect(PERSIST_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  expect(persistOptions.buster?.startsWith(appVersion())).toBe(true);
  expect(
    persistOptions.dehydrateOptions?.shouldDehydrateMutation?.(
      {} as Parameters<
        NonNullable<
          NonNullable<
            typeof persistOptions.dehydrateOptions
          >["shouldDehydrateMutation"]
        >
      >[0],
    ),
  ).toBe(false);
  // A restored page must outlive the persisted age, or it is collected
  // before it can be shown.
  expect(
    queryClient.getDefaultOptions().queries?.gcTime,
  ).toBeGreaterThanOrEqual(PERSIST_MAX_AGE_MS);
});

/** covers: spec 0033, AC-13 (offline writes fail, never queue) */
test("runs writes even offline, so they fail instead of waiting", () => {
  expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe("always");
});

/** covers: prompts/mobile-look-review-fixes.md, decision 7 (extras stay in memory) */
test("a title's extras are never written to disk; other catalog answers are", async () => {
  const client = testClient();
  client.setQueryData(catalogKeys.extras("movie", 603), { region: "PL" });
  client.setQueryData(catalogKeys.movie(603), { id: 603 });
  const find = (key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key, exact: true });

  const extras = find(catalogKeys.extras("movie", 603));
  const movie = find(catalogKeys.movie(603));
  if (!extras || !movie) throw new Error("queries not cached");
  expect(shouldPersistQuery(extras)).toBe(false);
  expect(shouldPersistQuery(movie)).toBe(true);
  expect(persistOptions.dehydrateOptions?.shouldDehydrateQuery).toBe(
    shouldPersistQuery,
  );
});

/**
 * covers: prompts/mobile-cache-buster-build-id.md, AC-1 and AC-2
 *
 * Two builds of 1.1.0 shared one buster, so the newer build restored a show
 * saved without `networks` and crashed opening it.
 */
test("a build from another commit never reads the same persisted cache", () => {
  expect(cacheBuster("1.1.0", "5e5bcb1")).not.toBe(
    cacheBuster("1.1.0", "a1b2c3d"),
  );
  expect(cacheBuster("1.1.0", "5e5bcb1")).not.toBe(
    cacheBuster("1.2.0", "5e5bcb1"),
  );
  expect(cacheBuster("1.1.0", undefined)).toBe("1.1.0");
});

/**
 * Saves a show under one build's buster and restores it under `restoredBy`,
 * through TanStack's own save and restore, the path the crash took.
 */
async function restoreAcrossBuilds(restoredBy: string) {
  const persister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: 0,
  });
  const saving = testClient();
  saving.setQueryData(catalogKeys.show(259909), { id: 259909 });
  await persistQueryClientSave({
    queryClient: saving,
    persister,
    buster: cacheBuster("1.1.0", "aaaaaaa"),
  });
  await new Promise((done) => setTimeout(done, 0));
  expect(await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)).not.toBeNull();

  const restoring = testClient();
  await persistQueryClientRestore({
    queryClient: restoring,
    persister,
    maxAge: persistOptions.maxAge,
    buster: restoredBy,
  });
  await new Promise((done) => setTimeout(done, 0));
  return restoring;
}

/**
 * covers: prompts/mobile-cache-buster-guards.md, AC-1
 *
 * A build of 1.1.0 restored a show an older 1.1.0 build had saved without
 * `networks`, and the show screen crashed on it.
 */
test("a newer build of the same version restores nothing an older build saved", async () => {
  const restored = await restoreAcrossBuilds(cacheBuster("1.1.0", "bbbbbbb"));

  expect(restored.getQueryData(catalogKeys.show(259909))).toBeUndefined();
  expect(await AsyncStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
});

/** covers: prompts/mobile-cache-buster-guards.md, AC-2 */
test("the same build restores what it saved", async () => {
  const restored = await restoreAcrossBuilds(cacheBuster("1.1.0", "aaaaaaa"));

  expect(restored.getQueryData(catalogKeys.show(259909))).toEqual({
    id: 259909,
  });
});
