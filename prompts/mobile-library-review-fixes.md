# Mobile 5c review fixes (feat/mobile-library)

## Goal

Fix the problems the two-axis review of `feat/mobile-library` against `main` found, so the app's library follows the repo's standards (shared rules and copy come from core, never a copy) and does what the 5c plan ([prompts/mobile-library-tabs.md](mobile-library-tabs.md)) and spec 0033 ask for. The fixes stay on this branch, before its PR.

## Inspected code

- Mobile: `src/lib/library-card.ts` (`community`, `personalScore`, `releasePill`, `upcomingShowPill`, `libraryCardView`), `src/screens/library-screen.tsx` (`resolveLibraryParams`, the empty and error states), `src/lib/library.ts`, `src/components/{poster-card,library-card,dated-card,centered-state}.tsx`, `src/__tests__/library-screen.test.tsx`.
- Web: `components/library/{library-card,game-library-card,game-library-tab,show-cards,dated-pill}.tsx`, `lib/api/v1/library.ts` (`gameEntry`), `app/api/v1/me/library/library.test.ts`, `lib/tracking/game-library.ts` (`GameLibraryRow.startedAt`, `finishedAt`).
- Core: `api/v1/library.ts` (`gameCardSchema`), `catalog/library-list.ts`, `catalog/media-type.ts` (`parseLibraryTypeParam`), `format.ts` (`formatReleaseDate`, `formatAirDate`, `formatShortDate`, `formatMonthYear`), `tracking/messages.ts` (`UPCOMING_MESSAGES`, `GAME_DATE_LINES`), `tv/library-page.ts` (`EpisodePlace`).
- Spec 0033 `index.md`, child 0035 (`LibraryEntry`), `verify.md` slice 5c.

## Skills used

`tanstack-query` (refetch error flags on infinite queries), `react-native-testing`, `vitest`, `next-dev-loop` (the v1 route check).

## Review findings and decisions

### Standards

1. **Community rating label duplicated and drifted.** `community()` in `library-card.ts` will call `communityRatingText` and `communityRatingLabel` from `poster-card.tsx`, so a game reads "IGDB community rating 8.1" as everywhere else.
2. **Upcoming and release pills copied from the web.** New core module `packages/core/src/catalog/library-card.ts` with two pure functions returning a pill union `{ kind: "dated"; text; label } | { kind: "tba"; label }`:
   - `releasePillText(release: ReleaseDate)`: the web's `ReleasePill` branch.
   - `upcomingEpisodePill(airDate, next: EpisodePlace | null, today)`: the web's `UpcomingShowPill` branch.
   The web's `ReleasePill` and `UpcomingShowPill` render from them, and the app maps them to its `CardPill`. Moved with tests, never copied (spec 0033, shared contracts).
3. **Hard-coded copy.** New `LIBRARY_CARD_MESSAGES` in `tracking/messages.ts`: `missing(source)` ("No longer on TMDB"/"No longer on IGDB"), `failed` ("Couldn't load this title"), `yourScore(text)`, `yourShowRating(text)`, and `LIBRARY_SIGNED_OUT` (title and description of the signed-out panel). The web's `MISSING_TITLE` and `MISSING_GAME` and `"Your show rating"` in `show-cards.tsx` read them too; the mobile `show-screen.tsx` "Your show rating" also. The strings themselves do not change.
4. **Badge table in core (your choice).** `LIBRARY_CARD_BADGES` in the same core module: per type and page key, `"community" | "personal" | "personal-else-community" | "show-rating" | null`, the one place a page decides its badge (spec 0020 AC-8, AC-9, AC-12; spec 0027). The web's movie `cardBadge` and `GAME_CARDS.scored` read it; the app's `libraryCardView` reads it. As a side effect, the app's Want to play and Coming soon games show the IGDB rating only, as the web (their rows cannot hold a score anyway, spec 0024 AC-2).
5. **Parse the path param (your choice).** `parseLibraryPathParam(value: string | string[] | null | undefined): LibraryPath | null` in `catalog/library-list.ts`, beside `parseLibraryTypeParam`; `resolveLibraryParams` uses it and drops the `as LibraryPath` cast.
6. **EpisodePlace (your choice).** The upcoming pill takes core's `EpisodePlace`, by way of item 2.
7. **Data clumps** (`entry, page, today`): left as is. Three props on one card is the normal shape, and bundling them adds a type for nothing.

### Spec

8. **Game month line (your choice: add dates to v1).** `gameCardSchema` gains `startedAt` and `finishedAt` (`string | null`, the stored `timestamptz`), filled by `gameEntry` from the row. The field is additive: an older app strips it, a newer app against an older server would fail to parse, so the web ships first (the normal order, docs/deploy.md). The month line itself moves to core as `gameDateLine(page, startedAt, finishedAt)` in the new module (Playing: Started, Finished: Finished, others none, through `formatMonthYear` and `GAME_DATE_LINES`), and the web's `GAME_CARDS.dateLine` and `monthLine` call it. Spec 0035's `LibraryEntry` paragraph gets one sentence naming the two fields.
9. **Skeleton while loading.** A `LibrarySkeleton` in `library-screen.tsx`: one row of 3 poster-sized tiles with `plate-rim`-style missing-tile look (the existing missing poster tile's classes), times 2 rows, `accessibilityLabel="Loading <page name>"`, replacing the `ActivityIndicator` under the pills. The footer spinner for the next page stays.
10. **Games' Coming soon date.** The code already matches the web (`formatReleaseDate`); I'll correct decision 4 of `mobile-library-tabs.md` rather than the code, since `formatGameReleaseDate` takes IGDB's per-platform precision, which the library card does not receive.
11. **A failed refresh shows no error.** The list is failed when `query.isLoadingError || query.isRefetchError` (TanStack v5 keeps `isRefetchError` false for a failed next page, which has its own footer). A failed list draws the failed panel with Retry and no cards, never the empty copy and never stale cards (section 11, no false success), matching the web's error panel and the verify step.
12. **Bad params fall back to the type's first page.** `resolveLibraryParams` falls back to `libraryPages(type)[0]` (Coming soon on games, Up next and Watchlist elsewhere), as the plan says; the JSDoc is corrected.
13. **Files vs plan.** The pills and notes stay inline in `library-screen.tsx` (each is used once); I'll note this in `mobile-library-tabs.md` rather than split files.
14. **Scope creep findings.** The `LIBRARY_CLASSIFY_LIMIT` move and the failed next page footer stay; I'll add a line to the 5c plan recording both, so the plan matches what shipped.

## Expected files

- `packages/core/src/catalog/library-card.ts` and `library-card.test.ts` (new): `LIBRARY_CARD_BADGES`, `releasePillText`, `upcomingEpisodePill`, `gameDateLine`.
- `packages/core/src/catalog/library-list.ts` and its test: `parseLibraryPathParam`.
- `packages/core/src/tracking/messages.ts` and its test: `LIBRARY_CARD_MESSAGES`, `LIBRARY_SIGNED_OUT`.
- `packages/core/src/api/v1/library.ts`: `startedAt`, `finishedAt` on the game card.
- `apps/web/lib/api/v1/library.ts`, `apps/web/app/api/v1/me/library/library.test.ts`.
- `apps/web/components/library/{library-card,game-library-card,game-library-tab,show-cards,dated-pill}.tsx` (read core; no visible change).
- `apps/mobile/src/lib/library-card.ts`, `apps/mobile/src/screens/library-screen.tsx`, `apps/mobile/src/screens/show-screen.tsx`, `apps/mobile/src/__tests__/library-screen.test.tsx`.
- `docs/specs/0033-mobile-app-expo/0035-mobile-api-v1.md` (one sentence), `docs/specs/0033-mobile-app-expo/verify.md` (5c month line, skeleton, refresh error), `prompts/mobile-library-tabs.md` (corrections in items 10, 13, 14).

## Requirements

- No visible change on the web: same text, labels, badges and pills (its existing tests pass unchanged, except imports).
- The app's cards match the web's per page, including the game month line.
- Personal and community ratings stay apart; "Not rated" never zero (section 9).
- Every state on the Library tab: skeleton loading, empty, failed with Retry (first load and refresh), missing image, signed out.

## Security considerations

`startedAt` and `finishedAt` are the caller's own rows, already behind RLS and the bearer check; the private `no-store` caching of `/me/library` is unchanged. No new env value, endpoint or dependency.

## Acceptance criteria

- `communityRatingLabel` is the only producer of a community rating label in the app.
- The upcoming pill, release pill, badge per page and game month line each have one implementation, in core, used by both apps.
- `/api/v1/me/library?type=game&path=/playing` entries carry `startedAt`/`finishedAt`; the app's Playing card shows "Started Feb 2026" and Finished "Finished Oct 2026".
- A pull to refresh that fails shows the failed panel with Retry, on a page with titles and on an empty one.
- `?type=game&path=/up-next` opens Games, Coming soon.
- Loading shows skeleton tiles under the pills.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web, mobile), `pnpm build` (core and a v1 route change). New tests: core `library-card.test.ts` (each badge cell, both pills' dated and TBA forms, the month line per page and a bad date), `parseLibraryPathParam`; v1 route test for the two fields; mobile tests for the refresh error with and without cards, the games fallback, the skeleton, the month line, and the IGDB-only badge on Want to play. `pnpm test:db` not needed (no schema change).

## Manual test steps

1. `pnpm dev:docker`, then `npx expo start --dev-client` in `apps/mobile` and open the development build signed in as a user with games on every page.
2. Library → Games → Playing: each card shows "Started <Mon YYYY>"; Finished: "Finished <Mon YYYY>"; Want to play: IGDB rating only.
3. VoiceOver on a game card: "IGDB community rating …".
4. Shows → Upcoming: the pills read as before ("S2E1 · Oct 20" or Date TBA).
5. With titles on screen, stop the web server and pull to refresh: the failed panel with Retry replaces the cards; start the server, tap Retry: the cards return.
6. On an empty page, repeat step 5: the failed panel shows, not the empty copy.
7. Reload the app on Library: skeleton tiles show under the pills before the cards.
8. On the web (`localhost:3000`), open every library page: cards look exactly as before.
