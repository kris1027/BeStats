# Mobile 5a: app shell, home and search (feature 28, spec 0033 Build plan step 5, first slice)

## Goal

Turn the tracer app into a real catalog app you can browse: a native tab bar, a home screen per media type built from the same lists as the web landings, "See all" list screens, and search with filters. It works signed out, like the web. This is the first of five slices of step 5 (agreed 2026-11-19):

- **5a (this plan)**: shell, home, list screens, search. Part of **AC-10** (library tab placeholder only) and **AC-14** (catalog notice wherever catalog data shows, community ratings labelled).
- 5b: title pages and tracking (full movie, show, season and episodes, game, Undo toasts).
- 5c: library tabs (every page from core), the rest of **AC-10**.
- 5d: sign up, account screen, account deletion on web and mobile with its migration, offline cache and its wipe, About and attribution: **AC-12**, **AC-13**, the rest of **AC-14**.
- 5e: deep links: **AC-16**.

## Inspected code

- Spec 0033 `index.md`, child 0035 (API surface, caching) and child 0036 (session, offline cache).
- `apps/mobile`: `src/app/_layout.tsx` (one Stack, providers), `src/app/index.tsx` (tracer home, redirects signed out visitors to Sign in), `src/app/movies/[id].tsx` (query and mutation pattern, `Centered` states), `src/lib/api.ts` (`apiRequest`, `ApiError`), `src/lib/movies.ts` (query keys, `PRIVATE_QUERY_ROOT`), `src/lib/query-client.ts`, `src/lib/images.ts` (`sizedImageUri`), `src/components/{glass-button,notice}.tsx`.
- Web landing: `components/catalog/catalog-landing.tsx` and its sections (hero, trending pin, popular grid, now columns, upcoming rows, top rated list), `components/catalog/landing/landing-items.ts` (one failed list shows Try again for that section only).
- Web search: `app/search/page.tsx`, `components/search/filter-bar.tsx`, `search-results.tsx`, `result-count.tsx`, `filtered-paging.tsx`.
- Web shell: `components/layout/{navbar,media-type-tabs,account-slot,mobile-menu-sheet,library-nav}.tsx`.
- `/api/v1` public routes: `genres`, `search`, `lists/{type}/{list}`, `movies/{id}`, `shows/{id}`, `games/{id}`, and their schemas in `packages/core/src/api/v1/{browse,movie,show,game}.ts`.
- Core: `catalog/landing.ts` (`landingSlots`, `LANDING_COUNTS`, `nowBlurb`), `catalog/lists.ts` (`catalogListsFor`, `listPath`), `catalog/media-type.ts` (`CATALOG_PATHS`, `titleHref`, `gameHref`), `catalog/library-list.ts`, `search/{params,constants,count,mode}.ts`, `images/image-url.ts`, `legal/attribution.ts`.

## Skills used

`expo-router` (NativeTabs, stacks inside tabs, `references/tabs.md` and `search.md`), `expo-design-system`, `vercel-react-native-skills` and `react-native-best-practices` (lists, images, re-renders), `tanstack-query` (infinite queries), `react-native-testing`. I'll check the Expo SDK 58 docs for NativeTabs before writing the layout, since it is still under `unstable-native-tabs`.

## Decisions and assumptions

Your answers on 2026-11-19 are decisions 1 to 3.

1. **Browse signed out.** Home, list screens, search and title pages work without a session, like the web. The root no longer redirects to Sign in. Tracking controls show only when signed in (the movie screen already gates its state read on the session); signed out, the movie screen shows a "Sign in to track" button instead of the toggle.
2. **Game search has no Platforms filter in 5a.** Games get title, genre, year and minimum IGDB rating. Platforms come later with a separate, small `/genres` change you approve on its own.
3. **Shell (new layout, needs your approval here).** Native bottom tabs through Expo Router `NativeTabs`: **Home**, **Search**, **Library**, **Account**. Each tab holds its own Stack, so a title opened from Search keeps Search's back stack. Icons: SF Symbols on iOS, Material on Android.
   - Home and Search carry a segmented **Shows · Movies · Games** switch at the top, in that order, matching the web's media tabs. The choice is shared by the two tabs and kept for the session (default Shows, since the web's `/` opens `/shows`).
   - Library in 5a, as you chose: signed out shows "Sign in to see your library" with a Sign in button. Signed in shows an empty state, "Your library pages are on their way", with no fake rows or counts (5a reads no library data). 5c replaces it with the real pages from `libraryPages` and `libraryPageName`. 5a and 5c ship in the same app release, so no store build ever shows this placeholder; it only lives in development builds between the two PRs.
   - Account in 5a: signed in shows "Signed in as …" and Sign out (moved from the tracer home); signed out shows Sign in. The full account screen is 5d.
   - Sign in opens as a modal over the tabs and closes back to where you were.
4. **Home layout (new layout, needs your approval here).** A vertical scroll per media type, sections in the web landing's order, titles and list choices from `landingSlots` and counts from `LANDING_COUNTS`:
   1. Trending: a horizontal carousel of large posters (9).
   2. Popular: a horizontal carousel of posters (14).
   3. The "now" section (In cinemas / On TV today / New releases): its small label, heading and `nowBlurb` line, then a horizontal carousel (12).
   4. Upcoming / On the air / Coming soon: a horizontal carousel of the first 20 titles, with the release date on each card for movies and games, as the web's dated cards show.
   5. Top rated: a numbered vertical list (8), like the web's list.
   Each section header has **See all**, opening that list's screen. The web's hero is left out: v1 list items carry no backdrop, genres or overview, and adding them is an API change this slice does not need. The parallax and moving rows are web effects and stay on the web.
   - Each section loads on its own query, so one failed list shows "Couldn't load this list" with Try again in that section only (as `landing-items.ts` does), and the rest of the page stays.
   - The page ends with the web's catalog notice line (TMDB or IGDB, from core's attribution text), so AC-14's notice is on every screen showing catalog data.
5. **Cards.** One `PosterCard` component: poster through `expo-image` sized with `sizedImageUri`, title, year, the community rating labelled "TMDB" or "IGDB" (never a bare number, so it can never be mistaken for a personal rating). Missing poster shows the web's placeholder (title on the glass plate). Cards link with `titleHref` and `gameHref` from core. No tracking badge on cards in 5a (that needs `/me/titles` batching on lists, which belongs with 5b and 5c).
6. **List screens.** `/shows/[list]`, `/movies/[list]`, `/games/[list]` paths, as `listPath` builds them, using a 3 column grid with infinite scroll over `/api/v1/lists/{type}/{list}?page=`. A 404 past the end ends the list quietly; any other error shows Try again under what already loaded.
7. **Search screen.** Mirrors the web's `/search`:
   - A title field (debounced 400 ms, `MAX_QUERY_LENGTH`), then **Filters** opening a sheet with Genres (multi select from `/api/v1/genres`), Year (any, or a year within the type's range from core), and minimum rating (Any, or `RATING_STEPS`, labelled TMDB or IGDB), plus Clear filters. If `/genres` fails, the genre picker says it is unavailable and the rest still works, as the web does.
   - Params are built and validated with core's search param helpers, so the app sends exactly what the web would.
   - Results: the count line from core's `formatResultCount`, `formatPartialCount` or the browse line ("Popular shows on TMDB"), a grid of `PosterCard`s, infinite scroll following `nextPage` (a cursor, not a page number, for filtered title searches).
   - States: skeleton while loading; "No matches" empty state; filtered search with no match in its scanned range shows the web's "No matches in TMDB results a–b" with Load more; a catalog failure shows "TMDB didn't respond. Try again in a moment." with Try again.
   - The query and filters stay when you open a title and come back (the Stack keeps the screen mounted; no URL needed in the app).
8. **Show and game screens in 5a.** Cards on Home and Search open shows and games, and 5b builds their full pages. So taps never lead nowhere, 5a adds read only `/shows/[id]` and `/games/[id]` screens: poster, title, year or air span, community rating labelled, genres, overview, every missing data fallback, loading and error with Retry, and the catalog notice. 5b adds tracking, seasons, episodes, cast and the rest.
9. **Data layer.** New `src/lib/catalog.ts` with public query keys under `"catalog"` (never under `"me"`, so sign out keeps them) and fetchers for lists, search, genres, show and game, each parsed with its core schema through `apiRequest`. Lists and search use `useInfiniteQuery`. The cache stays in memory (the persisted cache is 5d).
10. **No new API routes, no database change, no new dependencies** beyond what Expo Router already ships for NativeTabs (I'll confirm with `npx expo install --check`; if NativeTabs needs a package the app doesn't have, I add it with `npx expo install` and say so in the report).
11. **Tests (jest-expo, RNTL v14).** Home renders every section and one failed section shows its own Try again; search sends the core built params, shows the partial count copy and the empty and failure states; the list screen stops at a 404; signed out, the movie screen shows Sign in to track and reads no `me` query; the tabs render signed out.
12. **Branch and commits**: `feat/mobile-app-shell` off `main`; small commits that each build: catalog data layer; cards and section components; tabs shell and signed out browsing; home; list screens; search; show and game read only screens; tests; scope tick.

## Expected files

- `apps/mobile/src/app/_layout.tsx` (root Stack holding the tabs and the Sign in modal)
- `apps/mobile/src/app/(tabs)/_layout.tsx` (NativeTabs), `(tabs)/(home)/_layout.tsx` and `index.tsx`, `(tabs)/(search)/_layout.tsx` and `search.tsx`, `(tabs)/(library)/_layout.tsx` and `library.tsx`, `(tabs)/(account)/_layout.tsx` and `account.tsx`
- Shared title routes inside the tab stacks: `movies/[id].tsx` (moved, signed out state added), `shows/[id].tsx`, `games/[id].tsx`, and the list routes `movies/list/[list].tsx` style paths matching `listPath` (exact file names follow Expo Router's shared route rules)
- `apps/mobile/src/app/sign-in.tsx` (presented as a modal)
- `apps/mobile/src/components/{poster-card,section,media-switch,catalog-notice,filters-sheet,poster-grid,centered-state}.tsx`
- `apps/mobile/src/lib/catalog.ts`, `src/lib/media-type.tsx` (the shared Shows, Movies, Games choice)
- Tests in `apps/mobile/src/__tests__/`
- `docs/scope/scope.md`: the 5a line under step 5. `apps/mobile/AGENTS.md` changes go through `/sync`.

## Requirements

- Every screen covers loading, empty, error with Retry, missing image and signed out states; 44 point touch targets; VoiceOver and TalkBack labels; real metadata only (AGENTS.md section 3).
- Section names, list slugs, counts, paths and search params come from core, never copied.
- Community ratings always say TMDB or IGDB; personal ratings never appear on a card in 5a.
- The catalog notice shows on every screen with catalog data (AC-14).
- Public catalog queries live outside `"me"`; nothing private is fetched signed out.

## Security considerations

- Only public v1 routes are called signed out; `me` reads run only with a session, as today.
- No new env values, keys or endpoints. `security-boundary.test.ts` and `design-tokens-boundary.test.ts` keep running over the new files (no colour literal; tokens only).
- Search input is length limited and validated with core's schema before it is sent.

## Acceptance criteria

- The app opens on Home (Shows) without signing in, with all five sections from core's slots and their counts.
- The media switch changes Home and Search together between Shows, Movies and Games.
- See all opens each list and scrolls to its end without an error.
- Search by title, genre, year and minimum rating gives the same results and count copy as the web's `/search` for the same filters (games without platforms).
- Opening a title from Search and going back keeps the query, filters and scroll.
- One failed home list shows Try again in its section only.
- Signed out: no `me` request is sent; the movie screen offers Sign in to track; Sign in opens as a modal and returns to the same screen.
- Show and game cards open read only pages with every fallback.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (mobile jest included). `pnpm build` is not needed (no web change). `pnpm test:db` is not needed (no database change). `npx expo-doctor` in `apps/mobile`.

## Manual test steps (iOS Simulator, development build)

1. Start the local stack and the web (`pnpm dev:docker`), then `npx expo start --dev-client` in `apps/mobile`, and open the development build in the simulator.
2. Signed out, the app opens on Home with Shows selected: Trending, Popular, On TV today (with its blurb), On the air, Top rated, and the TMDB notice at the bottom.
3. Switch to Movies, then Games: sections and labels change (In cinemas, Upcoming; New releases, Coming soon with dates; the IGDB notice).
4. Tap See all on Popular: scroll to the end; no error appears.
5. Search tab: type "dune"; results and count appear. Open Filters, pick a genre and 7+; the partial count copy shows. Open a result, go back: query, filters and scroll stay.
6. Turn off the web server and pull to refresh Home: each section shows Try again; turn it back on and tap Try again.
7. Open a movie signed out: Sign in to track shows. Tap it, sign in in the modal, land back on the movie with the Watched toggle.
8. Open a show and a game: read only pages with poster, rating labelled TMDB or IGDB, overview, and the notice.
9. Library tab: signed out it offers Sign in; signed in it shows the "on their way" empty state.
10. Account tab: Signed in as …, Sign out; after sign out, Home still shows its lists.
11. Turn on VoiceOver and move through Home and Search: every card and control reads a label.
