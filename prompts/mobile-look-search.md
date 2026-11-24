# Mobile look, slice 5: Search

## Goal

Search on the phone gets the platform's own header and the one web filter it still lacks. You get an iOS large title "Search" with the native search bar under it (Material's header search on Android), the catalog cards from slice 4, and the games **Platforms** filter the web's filter bar already has (spec 0029, AC-10). Feature 29, slice 5 in [docs/scope/scope.md](../docs/scope/scope.md); decisions of the whole feature in [prompts/mobile-web-parity-foundation.md](mobile-web-parity-foundation.md) (Roadmap item 4).

## Inspected

- `apps/mobile/src/screens/search-screen.tsx`: the title field is a `TextInput` inside the list header, below `MediaSwitch`; a 400 ms pause (`FILTER_DEBOUNCE_MS`) turns the text into `params.q`; Filters and Clear filters sit under the field; `filterCount` counts genres, year and rating only.
- `apps/mobile/src/components/filters-sheet.tsx`: Genres, Year, Rating as glass chips in a page sheet; its comment says a games search has no Platforms filter "in this slice" (mobile app decision 2). Genres come from `/api/v1/genres`.
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/_layout.tsx` and `src/theme/stack-options.tsx`: one solid header colour (`HEADER_BACKGROUND`) on every stack, no large titles anywhere yet; `screenLayout` draws `PageBackground` under every screen.
- `apps/mobile/src/components/poster-grid.tsx`: already `contentInsetAdjustmentBehavior="automatic"`, and its cards are slice 4's `PosterCard` (marks, long press menu and preview). So "the new cards" are already on Search; this slice only checks them there.
- `apps/web/app/api/v1/search/route.ts`: already takes repeated `platform` ids and parses them against `readGameLists()`. The gap is the list itself: no `/api/v1` read returns IGDB's platforms.
- `apps/web/app/api/v1/genres/route.ts` and core `api/v1/browse.ts` (`v1GenresSchema`): the model for the new read.
- `apps/web/components/search/filter-bar.tsx` (`PlatformPicker`, `PlatformList`): about 220 platforms, a filter box, ticked rows stay ticked when the filter hides them, `Platforms unavailable` when IGDB's list fails, `maxFilterIds` cap from `SEARCH_CATALOGS`.
- `.claude/skills/expo-router/references/search.md`: `headerSearchBarOptions` (no `maxLength` option, so the cap is applied in `onChangeText`).

## Skills used

`expo-router` (header search bar, large title), `expo-design-system` (reuse the glass chips and plates, no new tokens), `react-native-testing` (RNTL v14). Before writing the header code, read the SDK 58 docs for `headerSearchBarOptions` and `headerLargeTitle` (`https://docs.expo.dev/versions/v58.0.0/`), as `apps/mobile/AGENTS.md` asks.

## Decisions

1. **Native search bar in the header** (your call, 2026-11-24). Search's stack screen sets `headerLargeTitle` and `headerSearchBarOptions` (placement `stacked` on iOS so it sits under the large title, `hideWhenScrolling: false` so the field is always reachable, `autoCapitalize: "none"`, placeholder `Search <noun> by title` from core's `mediaNoun`). The in page `TextInput` goes. Its text feeds the same `text` state and the same 400 ms pause, so `params.q` behaves as today. Text past `MAX_QUERY_LENGTH` is cut in `onChangeText`, since the native bar has no `maxLength`. Android has no large title; it gets Material's header search icon and field.
2. **Media switch and Filters stay in the page**, at the top of the grid header, so the layout below the header is today's minus the text field.
3. **Platforms in the filters sheet, games only.** A `Platforms` row in the sheet (glass `ChevronRow` style, showing the ticked count) opens a second view inside the same sheet: a filter text field and the platforms as checkbox rows, with a Back control. Same rules as the web: ticked rows stay ticked when the filter hides them, the cap from `SEARCH_CATALOGS.game.maxFilterIds` disables unticked rows once reached, `No platforms match` when the filter keeps none, `Platforms unavailable` (and the rest of the sheet working) when the list fails. Inside one sheet rather than a pushed screen because the sheet is a `Modal` outside the stack.
4. **A new public read, `GET /api/v1/platforms`** (games only, no query), answering `{ platforms: { id, name }[] }` from the same cached `getGamePlatforms` the web's filter bar and the search parser read, so every id the app sends is one the parser accepts. `public, s-maxage=86400` like `/genres`; a catalog failure is 502 `no-store` through `catalogFailure`. Contract `v1PlatformsSchema` in core `api/v1/browse.ts`. A separate route rather than a field on `/genres`, so the genres contract stays as the app already reads it.
5. **Platform toggles apply at once**, like genre toggles do in the sheet today. The web waits 400 ms after a games toggle because each change is a navigation; in the app, TanStack Query keys each params set and drops answers for params you moved past, so no pause is added.
6. **Counts and clearing include platforms**: `filterCount`, the sheet's Clear filters, the screen's Clear filters and the "That filter isn't valid" panel's action. Switching catalog already drops every filter (`emptySearchParams`), platforms included.
7. **Large title on Search only.** The other tab roots get theirs in their own slices (Library in slice 6, Account in slice 7). The large title uses Inter bold through `headerLargeTitleStyle` and the foreground token; the bar keeps `HEADER_BACKGROUND`.

## Assumptions

- The large title collapses on scroll even though `screenLayout` puts `PageBackground` before the grid. react-native-screens looks for the first scroll view in the screen; if the simulator shows it never collapses, the fix is to render the background with `pointerEvents="none"` after the content with a negative `zIndex`, or to give Search its own layout with the background behind. Recorded in the PR either way.
- Keeping focus in the native field while results reload works without the "one tree for every state" trick the in page field needed; the grid header no longer holds the input.

## Expected files

New:
- `apps/web/app/api/v1/platforms/route.ts`.
- `apps/mobile/src/components/platform-picker.tsx` (the second view of the sheet) and its test.

Changed:
- `packages/core/src/api/v1/browse.ts` (`v1PlatformsSchema`, `V1Platforms`) and its schema test.
- `apps/web/app/api/v1/browse.test.ts` (the platforms route) and `routes.test.ts` if it lists every route.
- `apps/mobile/src/lib/catalog.ts` (`fetchPlatforms`, `catalogKeys.platforms`).
- `apps/mobile/src/components/filters-sheet.tsx` (Platforms row and view, `Filters` gains `platformIds`) and its test.
- `apps/mobile/src/screens/search-screen.tsx` (header search bar through `navigation.setOptions`, count and clear include platforms) and its test.
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/_layout.tsx` (Search's large title options).
- `apps/mobile/AGENTS.md` (Search's header and the platforms read), `docs/scope/scope.md` (slice 5 ticks).

## Requirements

1. Every result shown meets every filter, platforms included (AGENTS.md section 10); the app sends platforms as repeated `platform` params through core's `searchHref`, the same URL shape the web shares.
2. The query, filters and platforms survive opening a title and coming back (the tab's stack keeps the screen mounted, and the native bar keeps its text).
3. A platform list failure never blocks Genres, Year or Rating, and never shows as an empty list.
4. Platforms is offered only on a games search; a movie or TV search never sends `platform` (the API would answer 400).
5. Every control in the picker is at least 44pt tall, checkbox rows announce their checked and disabled state, the filter field and Back have labels, and the views work at the largest text size.
6. No colour literal, no new token, no `BlurView` outside `components/glass/` (the boundary tests keep passing).
7. Loading, empty, error and signed out states stay as they are; the grid's skeleton shows while results load.

## Build deviations (2026-11-24)

Found in the simulator pass (iPhone 18 Pro, iOS 27.2, local stack) and fixed on the branch:

- The large title never collapsed, as the Assumptions section feared. Two causes. UIKit tracks only a scroll view that is first in the screen's view chain, and `screenLayout` puts `PageBackground` before it (`zIndex` cannot help: React Native reorders native subviews by it). And on iOS 26 and later react-native-screens lays a screen with an opaque header out under the bar and insets it itself, which hid the expanded title. The fix: the tab stacks draw `PageBackground` once behind their screens with a transparent theme background, `tabScreenLayout(["search"])` leaves Search bare, and Search's header is translucent (`headerTransparent`, clear when expanded, the bar colour when collapsed). Decision 7's "the bar keeps `HEADER_BACKGROUND`" now holds only when collapsed; expanded, the page shows through with no seam.
- A long game title (Cadence of Hyrule) widened its card past the grid column and broke the row. The card's width sits in a function `style` on the Pressable inside `Link asChild`, which did not reach layout; the title block now takes the card width too (`poster-card.tsx`). Slice 4's cards had the same fault wherever a long title showed.
- The empty platform checkboxes were too faint on the sheet; their border is `muted-foreground`.
- The "That filter isn't valid" panel's Clear filters keeps the title query (decision 6 asked only that it drop platforms). The header bar still shows the text, so dropping `q` would leave the bar and the results disagreeing.

## Review fixes (2026-11-24)

From `/code-review` against `main`: the platforms filter and cap check moved to core's `search/picker.ts` (`filterByName`, `isPickerFull`) and the pickers' words to `search/messages.ts` (`PICKER_COPY`, `pickerUnavailable`, `pickerCapHint`), both read by the web's filter bar and the phone's sheet, since they had been copied (packages/core/AGENTS.md, a rule lives in one package). Added the missing tests: `filters-sheet.test.tsx` (Clear filters drops platforms, a failed platform list leaves the rest working, no Platforms on a movie search) and `__tests__/search-header.test.tsx` (AC-2: the pause, the `MAX_QUERY_LENGTH` cut, Cancel). `npx expo-doctor` passes (20 of 20).

Simulator pass after the fixes (iPhone 18 Pro, local stack, signed out): collapsed, Search's bar is opaque in the page colour with the grid passing under it, so the inherited `headerStyle` does paint it (decision 7). At the largest accessibility text size the header, search field, Filters sheet and platform rows read in full, but the Platforms title pushed Done off the sheet; the sheet's title now shrinks to fit beside Done (requirement 5). Still not checked: VoiceOver on the picker and Android (no emulator on this Mac). Seen at that text size and outside this slice: Home's section titles and the poster cards' titles break mid-word.

## Security considerations

The new route is public, read only, and takes no input, so there is nothing to validate beyond the method. It reads IGDB through `lib/igdb/` only (credentials stay in `lib/igdb/env.ts`), and its answer holds catalog data only, so a shared CDN cache for a day is safe (AGENTS.md section 11). No user state, no new secret, no change to `/privacy` or `PROCESSORS`.

## Acceptance criteria

- **AC-1**: On iOS, Search shows a large "Search" title with the native search bar under it; the title collapses into the bar as the grid scrolls; on Android the header shows Material's search.
- **AC-2**: Typing in the header field runs the same title search as before, after the same pause; the field accepts at most `MAX_QUERY_LENGTH` characters; Cancel or clearing it shows browse results again.
- **AC-3**: On a games search, Filters shows Platforms; ticking platforms narrows the results to games on any ticked platform, the Filters button count includes them, and Clear filters removes them.
- **AC-4**: The platforms view filters the list by name, keeps hidden ticked rows ticked, disables unticked rows at the cap, and says `No platforms match` or `Platforms unavailable` as the web does.
- **AC-5**: Movie and TV searches show no Platforms row and never send `platform`.
- **AC-6**: `GET /api/v1/platforms` answers IGDB's list with `public, s-maxage=86400`, and 502 `no-store` when IGDB fails.
- **AC-7**: Search's cards are slice 4's cards (marks, long press menu with preview).
- **AC-8**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `npx expo-doctor` pass.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core schema test, the route test, the sheet, picker and screen tests), `pnpm build` (a new route). From `apps/mobile`: `npx expo-doctor`. No database change, so no `pnpm test:db`.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root; from `apps/mobile`, `npx expo start --dev-client --clear` (move `apps/mobile/.env.development.local` aside for the simulator).
2. Open the Search tab: a large "Search" title with the search bar under it. Scroll the grid: the title collapses into the bar; scroll back: it grows again.
3. Type `zelda` on Shows, Movies and Games: results follow after the pause. Clear the field and press Cancel: browse results return.
4. On Games, open Filters: Platforms is there. Open it, type `switch`, tick Nintendo Switch, clear the filter text (still ticked), press Back, then Done. Results narrow and the button reads `Filters (1)`.
5. Open a game, go back: the query, the ticked platform and the scroll position are kept.
6. Switch to Movies: Filters shows no Platforms row and the platform filter is gone.
7. Long press a card: the menu and preview from slice 4 show.
8. Set Larger Text to the maximum: the platforms view and the header bar labels are not clipped. Turn VoiceOver on and tick a platform: it reads as a checkbox with its state.
9. Optional: on an Android emulator, Search's header shows the search icon and field, and Platforms works.
