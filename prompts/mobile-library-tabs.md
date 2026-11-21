# Mobile 5c: library tabs (feature 28, spec 0033 Build plan step 5, third slice)

## Goal

Replace the Library tab's placeholder with the real library: every page the web has, for shows, movies and games, with the same names, the same order and the same placement, read from `/api/v1/me/library`. Each card shows its tracking badge (your score, the next episode, a release date, Finished or Caught up), so the library reads the same on both apps. This is slice 5c of five (agreed 2026-11-19):

- 5a (shipped, PR #82): shell, home, list screens, search, read only title pages.
- 5b (PR #83, open): title pages and tracking.
- **5c (this plan)**: library tabs and card badges. Satisfies **AC-10** on the app side (the server half shipped in 4d) and part of **AC-14** (personal ratings visibly apart from TMDB and IGDB on library cards).
- 5d: sign up, account, deletion, offline cache, About.
- 5e: deep links.

## Inspected code

- Spec 0033 `index.md` (AC-10, the Library tabs contract) and child 0035 (`/me/library`, `LibraryEntry`, its errors). No spec change is needed: the route and its schema are built (step 4d).
- Core: `catalog/library-list.ts` (`libraryPages`, `libraryPath`, `libraryPageName`, `libraryPageAt`, `LIBRARY_PATHS`; `LIBRARY_PAGE_PATHS` and `LIBRARY_PAGE_NAMES` are private and stay so), `api/v1/library.ts` (`v1LibraryQuerySchema`, `v1LibraryEntrySchema`, `v1LibrarySchema`, the show `place` union by page), `tracking/messages.ts` (`libraryCopy`, `LIBRARY_LIST_FAILED_TITLE`, `LIBRARY_LIST_FAILED`, `LIBRARY_NOTES`, `GAME_DATE_LINES`, `GAME_STATUS_LABELS`), `format.ts` (`formatPersonalScore`, `formatCalculatedRating`, `formatShortDate`, `formatReleaseDate`, `formatGameReleaseDate`, `formatMonthYear`).
- Web: `app/api/v1/me/library/route.ts` and `lib/api/v1/library.ts`; `components/library/` (`library-route`, `library-section`, `library-panels` with `TabNotes` and `EmptyPanel`, `library-card`, `show-cards`, `dated-pill`, `watchlist-show-card`, `game-library-card`), `components/layout/library-nav.tsx`.
- Mobile: `(tabs)/(index,search,library,account)/library.tsx` (the placeholder), the shared tab `_layout.tsx`, `components/{poster-grid,poster-card,media-switch,centered-state,tracking-gate,glass-button,notice}.tsx`, `lib/{api,tracking,movies,catalog,query-client,session,media-type}.ts(x)`, and the screen tests in `src/__tests__/`.

## Skills used

`expo-router` (params on the library screen), `tanstack-query` (`useInfiniteQuery` for paging, private keys), `vercel-react-native-skills` and `react-native-best-practices` (the grid), `expo-design-system`, `react-native-testing`. I'll check the Expo SDK 58 docs for any API 5a and 5b didn't touch.

## Decisions and assumptions

New layout without a native precedent is marked "needs your approval here" (AGENTS.md section 3).

1. **Pages and names come from core only.** The page list for a type is `libraryPages(type)`, the route sent to the server is `libraryPath(page, type)`, and the label is `libraryPageName(page, type)`. No page name or path is written as a literal in the app, so games show Coming soon, Want to play, Playing, Finished, movies Watchlist, Coming soon, Watched, and shows Up next, Upcoming, Watched, exactly as the web. The app never sends a page key; the server resolves the route with `libraryPageAt` (AC-10).
2. **One Library screen, page chosen by params (needs your approval here).** The Library tab stays one route, `library.tsx`, with `type` and `path` search params (the `path` value is the web route, such as `/up-next`). Switching updates the params with `router.setParams`, so a pill change never pushes a new screen and Back still leaves to the previous screen, not the previous pill. I'm not adding a route file per library page: the shared tab folder would put eight extra routes into every tab's stack, and spec 0036 links no library route in v1 (AC-16). An invalid param pair falls back to the type's first page.
3. **Layout (needs your approval here).** Top to bottom:
   - The Shows, Movies, Games switch, the same `MediaSwitch` look as Home and Search, but with its own state (the library's type is not Home's type). It starts on Shows, Up next, like the web's default.
   - A row of page pills from `libraryPages(type)` (3 pills, 4 on games), the selected one lit with `accessibilityState.selected`, each at least 44 points tall. On a narrow phone the four games pills scroll sideways rather than shrink.
   - The notes from `LIBRARY_NOTES` when the server says `capped` or `failedCount > 0` (with Retry for the failed count), as the web's `TabNotes`.
   - The 3 column poster grid (`PosterGrid`'s layout), loading the next page of 24 on scroll (`nextPage`), with a footer spinner while it loads.
4. **Library card (new component).** A `LibraryCard` built from `PosterCard`'s pieces (poster or the missing poster tile at the same size, name), taking a `V1LibraryEntry`. One badge per card, by type and page, as the web's cards:
   - Movies: Watchlist shows the TMDB rating (amber, community); Coming soon a release date pill (`formatShortDate`, or Date TBA); Watched your score (cyan, `formatPersonalScore`) or nothing when unscored.
   - Shows: Up next the next episode (`S2E1`); Upcoming the next episode and its air date, or Date TBA; Watched your show rating (`formatCalculatedRating`, never 0) and Finished or Caught up.
   - Games: Coming soon the release date (`formatReleaseDate`, as the web's games Coming soon card; corrected 2026-11-21, `formatGameReleaseDate` needs IGDB's per platform precision, which a library card does not get) and the IGDB rating; Want to play the IGDB rating; Playing and Finished your score when set, else the IGDB rating, plus the month line (`GAME_DATE_LINES`, through core's `gameDateLine` and the v1 card's `startedAt` and `finishedAt`, prompts/mobile-library-review-fixes.md).
   - Dates are UTC days and never imply a local time. Personal values use `score-personal`, community ones `rating-tmdb`, never mixed (AC-14).
   - A `card: null` entry (the catalog failed for a stored title) shows the missing tile with "Couldn't load this title" and still opens the title screen; a `{ kind: "missing" }` card says "No longer on TMDB" or "No longer on IGDB", as the web.
   - Tapping a card opens the title screen inside the Library stack (`cardHref`), where every tracking control from 5b lives.
5. **No quick actions on the cards in 5c.** The web's remove, unmark and Mark next watched buttons on library cards stay out of this slice: every one of those writes is on the title screen already (5b), and adding them needs the Undo and focus handling again per card. I'll list them as a follow up. If you want them in 5c, say so and I'll update this plan first.
6. **Freshness.** Library queries live under `["me","library",type,path]`, so sign out wipes them (`clearPrivateQueries`). Every tracking write in 5b also invalidates `["me","library"]`, so after a mark the library reloads when you come back; pull to refresh reloads the current page too. No page writes on load (section 9).
7. **States.** Signed out: the existing "Sign in to see your library" panel, no `me` request. Loading: a grid of skeleton tiles under the pills. Empty: `libraryCopy(page, type).empty` with its Browse button (opens that catalog on Home). Failed read or a 502 on a date placed page: `LIBRARY_LIST_FAILED_TITLE`, `LIBRARY_LIST_FAILED` and Retry, never the empty state. Expired session: the root layout's existing notice.
8. **Core change: none planned** (as shipped: `LIBRARY_CLASSIFY_LIMIT` moved to core for the app's capped note, and the review fixes added `catalog/library-card.ts`, prompts/mobile-library-review-fixes.md). Every value comes from functions core already exports. If a pure card formatter (the `S2E1` code, the date pill text) lives only in the web, I'll move it to core with `git mv` and its test, never copy it.
9. **Tests (jest-expo, RNTL v14).** The pills match `libraryPages` and `libraryPageName` for each type (games' Coming soon and Playing included); a pill tap requests the right `type` and `path`; empty copy per page; a 502 shows the failed panel with Retry, not the empty state; a `card: null` entry still renders and links; a watched movie card shows the personal score apart from TMDB; scrolling asks for `nextPage`; signed out sends no `me` request; the notes appear for `capped` and `failedCount`.
10. **Branch and commits:** `feat/mobile-library` off `feat/mobile-title-tracking`, since PR #83 (5b) is still open and 5c reuses its invalidation and toast host. I'll rebase it onto `main` once #83 merges, before opening its PR. Small commits that each build: library data layer; library card; library screen; invalidation from 5b writes; tests; scope tick.

## Expected files

- `apps/mobile/src/lib/library.ts` (`libraryKeys`, `fetchLibraryPage`, the infinite query hook).
- `apps/mobile/src/components/library-card.tsx` (as shipped, the pills and notes stay inline in `library-screen.tsx`, each used once; the screen also has a Retry footer for a failed next page).
- `apps/mobile/src/screens/library-screen.tsx` and `apps/mobile/src/app/(tabs)/(index,search,library,account)/library.tsx` (the route renders it).
- `apps/mobile/src/lib/tracking.ts` (invalidate `["me","library"]` after writes).
- Tests in `apps/mobile/src/__tests__/library-screen.test.tsx`.
- `docs/scope/scope.md`: the 5c line. `apps/mobile/AGENTS.md` changes go through `/sync`.

## Requirements

- Every state: loading, empty, error with Retry, missing image, signed out; 44 point touch targets; VoiceOver and TalkBack labels; pills report state rather than swap names (section 3).
- Names, order and placement match the web for the same account (AC-10, section 9).
- Personal scores and calculated ratings stay visibly apart from TMDB and IGDB ratings; "Not rated", never 0 (section 9).
- The user's stored history stays visible when the catalog fails for a title (section 12).

## Security considerations

- Every read goes through `apiRequest` with the bearer token; the user ID is never sent; the server picks the page with `libraryPageAt` and RLS limits rows to the caller.
- Signed out, the screen sends no private request. The keys sit under `"me"`, so sign out and an expired session wipe them.
- No new env values, secrets, endpoints or dependencies. `security-boundary.test.ts` and `design-tokens-boundary.test.ts` cover the new files (tokens only).

## Acceptance criteria

- The Library tab lists every page of the web for each type, with the same names and order, and each page shows the same titles in the same order as the web page for the same account.
- Card badges match the web's: score, next episode, dates, Finished or Caught up, game month lines, each personal value apart from community ratings.
- A failed or 502 read shows the failed panel with Retry; an empty page shows its own copy and Browse button; a title whose catalog read failed still shows.
- After a tracking change on a title screen, going back to the library shows the new placement.
- Signed out, the tab offers Sign in and sends no `me` request.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile jest). `pnpm build` only if core or the web changes (decision 8). `pnpm test:db` is not needed (no database change). `npx expo-doctor` in `apps/mobile`.

## Manual test steps (iOS Simulator, development build)

1. Start the local stack and the web (`pnpm dev:docker`), then `npx expo start --dev-client` in `apps/mobile`, and open the development build.
2. Signed out, open Library: the Sign in panel shows.
3. Sign in as a user with tracked shows, planned and watched movies, and games in each status. Library opens on Shows, Up next.
4. Tap each pill on Shows, Movies and Games: names and order match the web's library menu; each page lists the same titles in the same order as `localhost:3000` signed in as the same user.
5. Check the badges: an Up next show shows its next episode, an Upcoming show its air date or Date TBA, a Watched show your rating and Finished or Caught up; a Watched movie your score in cyan; a Playing game your score or the IGDB rating and its Started month.
6. Open a show from Up next, mark the next episode, go back: the card moves or updates.
7. Pick a page with nothing on it: its own empty copy and Browse button.
8. Scroll a page with more than 24 titles: the next page loads.
9. Stop the web server and pull to refresh: the failed panel with Retry shows; start it again and tap Retry.
10. Sign out from Account, open Library: the Sign in panel shows and no old titles flash.
11. Turn on VoiceOver: the switch and pills read their selected state, cards read name and badge.
