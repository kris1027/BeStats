# Mobile 5d2: offline cache, offline banner, About and attribution (feature 28, spec 0033 Build plan step 5, fourth slice, second half)

## Goal

Let the app keep working when the phone loses its connection, without ever leaving your private data behind for the next person. The pages you already opened (library pages, title pages, home and lists) stay readable offline for up to a day, a banner tells you that you are offline, and a write that cannot reach the server fails visibly with a Retry button. Signing out, an expired session and account deletion wipe every private entry from the phone, on disk too. An About screen shows TMDB's and IGDB's logos and attribution, as their terms ask.

Satisfies **AC-13** and **AC-14**. Slice 5e (deep links, **AC-16**) and step 6 (release, **AC-15**, **AC-17**) come after.

## Inspected code

- Spec 0033 `index.md` (AC-13, AC-14, Shared contracts: Attribution) and child 0036, section "Offline cache and sign out" plus its Value sourcing row (Offline banner from NetInfo). The decision is fully recorded, so no spec change is needed.
- Mobile: `src/lib/query-client.ts` (`queryClient`, `clearPrivateQueries`, `PRIVATE_QUERY_ROOT`), `src/lib/session.tsx` (the three wipe points: sign out, expired session, `endLocalSession` after deletion), `src/lib/api.ts` (`ApiError` with code `network`), `src/lib/tracking.ts` (`useTrackingWrite`, the error toast), `src/components/toast.tsx` (one action per toast), `src/components/catalog-notice.tsx`, `src/screens/account-screen.tsx`, the tab stack layout, `src/app/_layout.tsx`, `app.json`, `metro.config.js` (Expo's Metro already treats `.svg` as an asset).
- Web: `components/layout/site-footer.tsx` (logo sizes, links, alt text) and `tmdb-logo.test.ts`, `igdb-logo.test.ts` (the byte for byte hashes).
- Core: `legal/attribution.ts` (`TMDB_ATTRIBUTION`), `legal/operator.ts` (`IGDB_ATTRIBUTION`, `TMDB_HOME_URL`, `IGDB_HOME_URL`).

## Skills used

`tanstack-query` (persistence, `onlineManager`, network modes), `expo-router` (the About screen on the Account stack), `vercel-react-native-skills` and `react-native-best-practices` (banner and image rendering), `react-native-testing` (screen and hook tests). I'll check the Expo SDK 58 docs for NetInfo and `expo-image` SVG support before writing that code.

## Decisions and assumptions

Layouts with no native precedent are marked "needs your approval here" (AGENTS.md section 3).

1. **Persisted cache, as child 0036 says.** `PersistQueryClientProvider` from `@tanstack/react-query-persist-client` with `createAsyncStoragePersister` from `@tanstack/query-async-storage-persister` (JS only packages, same major as `@tanstack/react-query`). `maxAge` 24 hours, the queries' default `gcTime` raised to 24 hours to match, `buster` the app version from `app.json` (the same value `apiRequest` sends). Only successful queries are written; mutations are never written (`shouldDehydrateMutation: () => false`), since their input can be private and there are no queued writes. Tokens never touch this cache: the session stays in its own encrypted entry.
2. **The wipe covers the disk too.** `clearPrivateQueries()` keeps removing every `"me"` query and every mutation from memory, and now also removes the persisted entry. The persister's next save then writes only the public catalog queries. Public catalog queries stay, as today (the sign out spinner fix).
3. **A launch wipe.** When the persisted cache finishes restoring and no session is stored (for example the app was killed after the session ended), `clearPrivateQueries()` runs, so private data is never shown to a signed out phone.
4. **Online state from NetInfo.** `@react-native-community/netinfo` (installed with `npx expo install`) feeds TanStack's `onlineManager`. Offline, queries pause instead of failing, so a page with cached data keeps showing it (the library screen's "failed refresh shows the failed panel" rule stays true online). A page with nothing cached shows its usual loading state under the banner and loads by itself when the connection returns. NetInfo has native code, so this needs a new development build (`npx expo run:ios` locally, Xcode is installed).
5. **Writes fail, never queue.** Mutations switch to `networkMode: "always"`, so an offline write runs, gets the `network` error, reverts its optimistic state and shows the error toast. For a `network` error that toast gains a **Retry** action that sends the same write again. A refusal from the server (4xx) gets no Retry, as today.
6. **Offline banner (needs your approval here).** A slim glass strip pinned under the status bar, above every screen and modal content, shown only while NetInfo says there is no connection: "You're offline. Pages you opened recently still show." It uses `accessibilityLiveRegion` and `AccessibilityInfo.announceForAccessibility`, so the change is announced. No colour literal; the existing glass plate and muted text tokens.
7. **About screen (needs your approval here).** A new row "About" on the Account tab, signed in and signed out (under Delete account when signed in, under the sign in buttons when signed out), opening `account/about` on the Account stack. One column of glass panels: "BeStats" with the app version; a panel with the TMDB logo (linking to `TMDB_HOME_URL`) and `TMDB_ATTRIBUTION`; a panel with the IGDB logo (linking to `IGDB_HOME_URL`) and `IGDB_ATTRIBUTION`. Logos are smaller than the BeStats title, as TMDB's terms ask, sized from their viewBox like the web footer, with alt text "TMDB" and "IGDB". The existing `CatalogNotice` under catalog screens stays as is.
8. **The logos, byte for byte.** The two SVGs are copied unchanged into `apps/mobile/assets/legal/` and drawn with `expo-image`. A Jest test checks each copy against the same official SHA256 the web tests use, so an edited copy fails. If `expo-image` draws an SVG wrong (both use `<style>` classes), I'll stop and ask before choosing another renderer.
9. **No Privacy or Terms links on About in this slice.** The website returns 403 since 2026-11-21 (only `/api/v1` serves), so a link would open an error page. Store submission needs a reachable privacy policy URL; that belongs to step 6 and is listed under Needs your attention.
10. **Copy lives in the app.** The banner, Retry and About strings are mobile only (the web has no offline state), so they live in one `src/lib/offline.ts` and the About screen, not in core.

## Expected files

- `apps/mobile/package.json`, `pnpm-lock.yaml`: `@react-native-community/netinfo`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`.
- `apps/mobile/src/lib/query-client.ts` (+ test): `gcTime`, mutation `networkMode`, the persister and `persistOptions`, `clearPrivateQueries` removing the persisted entry.
- `apps/mobile/src/lib/offline.ts` (+ test): `onlineManager` wired to NetInfo, `useIsOffline()`, the banner copy.
- `apps/mobile/src/components/offline-banner.tsx` (+ test).
- `apps/mobile/src/lib/tracking.ts` (+ test): Retry on a `network` failure.
- `apps/mobile/src/app/_layout.tsx`: `PersistQueryClientProvider`, the launch wipe, the banner.
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/account/about.tsx`, the tab stack layout title, `src/screens/about-screen.tsx` (+ test), `src/screens/account-screen.tsx` (the About row).
- `apps/mobile/assets/legal/tmdb-logo.svg`, `igdb-logo.svg`, `src/lib/legal-logos.test.ts`.
- `apps/mobile/jest.setup.ts`: NetInfo's Jest mock.
- `apps/mobile/AGENTS.md`: replace the "in memory only until" line with the persisted cache rule (the rest goes through `/sync`).
- `docs/scope/scope.md`: tick 5d2 and 5d once built.

## Requirements

- AC-13: sign out, an expired session and account deletion remove every `"me"` query from memory and from AsyncStorage; offline, the last loaded library and title pages show with a banner; offline writes fail visibly with Retry; no queued writes.
- AC-14: About shows `TMDB_ATTRIBUTION`, `IGDB_ATTRIBUTION` and both unaltered logos; the catalog notice stays wherever catalog data shows; personal ratings stay visibly apart from TMDB and IGDB ratings (unchanged).
- Every new view has loading, empty, error, missing image and signed out states where they apply, 44pt touch targets and screen reader labels (AGENTS.md section 3).

## Security considerations

- Private data at rest: the persisted cache holds `"me"` reads, so the wipe must reach the disk on every way out (sign out, expired session, deletion, launch without a session). Tests assert the AsyncStorage entry no longer holds any `"me"` key after each.
- The session and tokens stay in their own encrypted entry and never enter the query cache.
- Mutations are never persisted, so a private write's input never lands on disk.
- The `buster` drops a cache written by an older app version, so an old response shape is never read.

## Acceptance criteria

1. Open a movie and the Library tab online, turn on airplane mode, relaunch the app: the banner shows, and both pages show the last loaded data.
2. Offline, mark a movie watched: the mark reverts, an error toast shows with Retry; back online, Retry saves it.
3. Sign out (and separately: an expired session, a deleted account): the AsyncStorage cache entry holds no `"me"` query.
4. Account tab, signed in and signed out: About opens and shows both logos unaltered, both attribution texts and the app version; the logo links open TMDB and IGDB.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test` from the repo root (covers web, core and mobile).
- New Jest tests: the persist options (`maxAge`, `buster`, no mutations), `clearPrivateQueries` removing the persisted entry, the launch wipe, `useIsOffline` and the banner, Retry on a network failure and none on a 4xx, the About screen, the logo hashes.
- `pnpm build` is not needed (no web change). `npx expo-doctor` after the installs.

## Manual test steps

1. From `apps/mobile`, rebuild the development build for the simulator: `npx expo run:ios` (NetInfo is new native code), with the local stack running (`pnpm dev:docker`).
2. Sign in, open a movie, a show and the Library tab.
3. Turn off the Mac's Wi Fi (the simulator follows it): the banner appears; the pages you opened still show; pull to refresh does not replace them with an error.
4. Mark the movie watched: the mark reverts and a toast says the write failed, with Retry. Turn Wi Fi on, press Retry: the mark saves.
5. Kill and relaunch offline: the cached pages still show with the banner.
6. Sign out, then (online) inspect the cache with the dev menu or the Jest test: no `"me"` entries. Sign in again: your library loads fresh.
7. Account tab, then About (try signed out too): both logos draw correctly, both texts show, the logo links open in the browser. Check VoiceOver reads the logos as "TMDB" and "IGDB".
