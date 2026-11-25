import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  defaultShouldDehydrateQuery,
  type Query,
  QueryClient,
} from "@tanstack/react-query";
import type {
  Persister,
  PersistQueryClientProviderProps,
} from "@tanstack/react-query-persist-client";

import { ApiError, appVersion } from "./api";
import { CATALOG_QUERY_ROOT } from "./catalog";

/**
 * The first segment of every private query key. `clearPrivateQueries` wipes
 * by it on sign out, so the keys and the wipe read the same constant
 * (spec 0033, AC-13; AGENTS.md section 11).
 */
export const PRIVATE_QUERY_ROOT = "me";

/** The AsyncStorage entry that holds the persisted query cache. */
export const QUERY_CACHE_STORAGE_KEY = "bestats-query-cache";

/**
 * How long a persisted page stays readable offline: 24 hours, as child 0036
 * says. Queries keep the same `gcTime`, or a restored page would be garbage
 * collected before it could be shown.
 */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The app's one query cache (spec 0033, child 0036, Offline cache).
 *
 * A refusal the server meant (any 4xx) is not retried; a network failure or
 * a 5xx is retried once. Offline, queries pause rather than fail
 * (`onlineManager` follows NetInfo, `lib/offline.ts`), so a page already
 * loaded keeps showing. Writes use `networkMode: "always"`: an offline write
 * runs, fails with the `network` error and shows it with Retry, and nothing
 * is ever queued (AC-13).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: PERSIST_MAX_AGE_MS,
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
    mutations: { retry: false, networkMode: "always" },
  },
});

/**
 * Writes the query cache to AsyncStorage so the last loaded pages show
 * offline (AC-13). Only the cache goes here; the session keeps its own
 * encrypted entry (`session-storage.ts`) and never enters this one.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_CACHE_STORAGE_KEY,
});

/**
 * Whether a successful query is written to disk. A title's extras are not:
 * the server picks their country from the connection, which the app cannot
 * know before it asks, so the key cannot carry it, and a page restored after
 * a trip would show the last country's Where to watch for a day. Kept in
 * memory only, a restart always reads the current country: the country is
 * never stored (apps/web/app/AGENTS.md, Visitor region) and time-sensitive
 * metadata refreshes rather than caching for a day (AGENTS.md section 12;
 * prompts/mobile-look-review-fixes.md, decision 7).
 */
export function shouldPersistQuery(query: Query): boolean {
  const [root, kind] = query.queryKey;
  if (root === CATALOG_QUERY_ROOT && kind === "extras") return false;
  return defaultShouldDehydrateQuery(query);
}

/**
 * The persistence rules from child 0036: 24 hours, dropped by an app update
 * (`buster` is the app version, so an old answer shape is never read), and
 * only successful queries, never a title's extras (`shouldPersistQuery`). Mutations are never written: their input can be
 * private, and an offline write fails rather than waiting to be replayed.
 */
export const persistOptions: PersistQueryClientProviderProps["persistOptions"] =
  {
    persister: queryPersister,
    maxAge: PERSIST_MAX_AGE_MS,
    buster: appVersion(),
    dehydrateOptions: {
      shouldDehydrateMutation: () => false,
      shouldDehydrateQuery: shouldPersistQuery,
    },
  };

/**
 * Wipes everything private on sign out, an expired session and account
 * deletion: every `"me"` query and every mutation, whose input can be
 * private, in memory and on disk (spec 0033, AC-13; AGENTS.md section 11).
 * The persisted entry is removed outright; the persister's next save then
 * holds only the public catalog, so the next person on a shared phone never
 * sees the previous library.
 *
 * Public catalog queries stay on purpose. `clear()` would also remove the
 * movie an open screen is showing and cancel its reload, which left that
 * screen on a spinner for good (prompts/mobile-sign-out-spinner.md).
 */
export function clearPrivateQueries(
  client: QueryClient = queryClient,
  storage: Pick<Persister, "removeClient"> = queryPersister,
): Promise<void> {
  client.removeQueries({ queryKey: [PRIVATE_QUERY_ROOT] });
  client.getMutationCache().clear();
  // A failed removal is not surfaced: removing the queries above already
  // changed the cache, so the persister's next save (within its throttle,
  // one second) writes a snapshot without them, and a kill inside that
  // window is caught by `wipePrivateCacheIfSignedOut` at the next launch.
  // Sign out must still finish, so the error cannot be allowed to throw.
  return Promise.resolve(storage.removeClient()).catch(() => undefined);
}
