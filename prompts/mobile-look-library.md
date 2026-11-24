# Mobile look, slice 6: Library

## Goal

The Library tab on the phone gets slice 4's cards and slice 5's header. You get an iOS large title "Library" that collapses into the bar as you scroll, library cards that carry the same long press menu and title preview as catalog cards, with their visible quick action button kept, and the foundation's pulsing skeleton while a page loads. Feature 29, slice 6 in [docs/scope/scope.md](../docs/scope/scope.md); decisions of the whole feature in [prompts/mobile-web-parity-foundation.md](mobile-web-parity-foundation.md) (Roadmap item 5).

## Inspected

- `apps/mobile/src/screens/library-screen.tsx`: a `FlatList` of 3 columns with its own `COLUMNS`, `GUTTER`, `GAP` copies of `GRID`; the header holds `MediaSwitchView`, the page pills and the capped and failed notes; the skeleton (`LibrarySkeleton`) is still flat tiles with no pulse. Signed out and the session load return a `StatePanel` and `LoadingState` outside any scroll view.
- `apps/mobile/src/components/library-card.tsx`: already the glass look (`PosterFrame`, `GlassPill` badge and pill, `CardActionButton` on a `PlateSolid` beside the link). It is a plain `Link asChild` around a `Pressable`: no long press, no preview, no pressed state, and its title and meta lines have no width of their own and no `CARD_FONT_SCALE_CAP`, the two faults slice 5 fixed on `PosterCard` (a long title widened the card past its column).
- `apps/mobile/src/components/poster-card.tsx`: slice 4's menu wiring lives inside `PosterCardView` (`Link.Trigger`, `Link.Menu`, `Link.Preview` with `HEADER_BACKGROUND`, `accessibilityActions`, the Android `openAlertMenu`, `wire`, `MenuEntry`), and `MovieCard`, `ShowCard`, `GameCard` bind `useMovieWrite`, `useShowTrackingWrite`, `useGameWrite`.
- `apps/mobile/src/lib/catalog-card-actions.ts`: `movieCardMenu(state, releaseDate, today)`, `showCardMenu(state)`, `gameCardMenu(state, releaseDate, today)`, pure, from core's rules.
- `packages/core/src/api/v1/library.ts`: every `V1LibraryEntry` already carries `user` (the v1 title state for its type) and, when the catalog answered, the release date (movies, games). So the menu needs no extra read.
- `apps/mobile/src/lib/tracking.ts`: every `useTrackingWrite` invalidates `libraryKeys.all`, so a menu write moves the card to its new page after the refetch, as the quick action does.
- `apps/mobile/src/theme/stack-options.tsx` (`SEARCH_SCREEN_OPTIONS`, `tabScreenLayout`) and `src/app/(tabs)/(index,search,library,account)/_layout.tsx` (`tabScreenLayout(["search"])`).
- `apps/mobile/src/components/skeleton.tsx` (`PosterCardSkeleton`) and `grid-layout.ts` (`GRID`, `gridCardWidth`).
- Tests: `screens/library-screen.test.tsx`, `lib/library-actions.test.tsx`, `components/poster-card-actions.test.tsx`.

## Skills used

`expo-router` (large title, `Link.Menu`, `Link.Preview`), `expo-design-system` (reuse plates, pills and skeletons, no new tokens), `react-native-testing` (RNTL v14). Before writing the header and link code, read the SDK 58 docs for `headerLargeTitle` and `Link.Menu` (`https://docs.expo.dev/versions/v58.0.0/`), as `apps/mobile/AGENTS.md` asks.

## Decisions

1. **Library cards get the long press menu and the preview** (your call, 2026-11-24). The menu is the catalog card's menu for the type: Plan or Remove from watchlist and Mark watched or Unmark on a movie, Track or Stop tracking on a show, Want to play or Remove on a game, from `movieCardMenu`, `showCardMenu`, `gameCardMenu`. iOS gets the native `Link.Menu` with `Link.Preview`; Android gets the same `Alert`; both get `accessibilityActions`. A tap still opens the title.
2. **The visible quick action stays** exactly as today (place, look, label, 44 point tap area, its own pressable beside the link). The menu may offer the same write as the button (Remove from watchlist on Watchlist); that is fine, a long press menu lists every action.
3. **The menu reads `entry.user`**, the state the library page already returned, and the release date from `entry.card`. No `/me/titles` read and no `useCardStates` on Library. Writes go through `useMovieWrite`, `useShowTrackingWrite`, `useGameWrite` (`lib/title-writes.ts`), the same writes and Undo toasts the catalog cards and title screens use; their invalidation of `libraryKeys.all` refetches the page, so the card moves page or leaves only on the server's confirmed answer.
4. **One menu wrapper for both cards.** The `Link.Trigger`, `Link.Menu`, `Link.Preview`, accessibility actions and Android alert move out of `PosterCardView` into a new `components/card-link.tsx` (`CardLink`), which `PosterCard` and `LibraryCard` both use, so the two never drift. `PosterCard` behaves exactly as today.
5. **Which cards get what.** A card with catalog data (`kind: "title"`) gets menu and preview. A card whose catalog read failed (`kind: "failed"`) still opens (AGENTS.md section 12), gets the preview, and no menu, since its release date is unknown and the gate could not be shown honestly. A title the catalog no longer has (`kind: "missing"`) stays as today: no link, no preview, no menu.
6. **Card text fixes from slice 5.** The title and meta lines sit in a block with the card's own width and take `CARD_FONT_SCALE_CAP`; the card dims slightly while pressed, as `PosterCard` does.
7. **Large title on Library**, the same header as Search: `headerLargeTitle`, translucent (`headerTransparent`, clear when expanded, the bar colour when collapsed), Inter bold. `SEARCH_SCREEN_OPTIONS` becomes `largeTitleScreenOptions(title)` used by both, and the tab stack's layout becomes `tabScreenLayout(["search", "library"])`. Android keeps its plain bar.
8. **Every Library state scrolls under the header.** With a translucent bar, a state drawn outside a scroll view would sit under it. The session load, signed out, empty and failed states all render inside the one `FlatList` (`contentInsetAdjustmentBehavior="automatic"`), as the empty and failed states already do, so UIKit insets them and the title still collapses.
9. **The pulsing skeleton.** `LibrarySkeleton` draws two rows of `PosterCardSkeleton` (pulse off under Reduce Motion) at the grid's width, and the screen takes `GRID` and `gridCardWidth` instead of its own copies, so loading and loaded grids have one shape. The skeleton keeps one accessible "Loading <page>" label.

## Assumptions

- The large title collapses on Library with the fix slice 5 found for Search (bare screen plus translucent header). If the page pills' horizontal `ScrollView` inside the list header confuses UIKit's scroll tracking, it is the `FlatList` that is first in the view chain, so it should not; if it does, the fix is recorded in the PR.
- A user can long press a card while its quick action write is in flight. The menu's write and the button's write both go through `useTrackingWrite`, and the page refetch settles both; no extra lock is added.

## Expected files

New:
- `apps/mobile/src/components/card-link.tsx` (`CardLink`, `MenuEntry`, `wire`, the Android alert) and its test.
- `apps/mobile/src/components/library-card.test.tsx` (menu per type, failed and missing cards, quick action still separate, text width).

Changed:
- `apps/mobile/src/components/poster-card.tsx` (uses `CardLink`; no behaviour change).
- `apps/mobile/src/components/library-card.tsx` (`CardLink`, per type menus from `entry.user`, text block, pressed state).
- `apps/mobile/src/screens/library-screen.tsx` (states inside the list, `GRID`, `PosterCardSkeleton`) and `library-screen.test.tsx`.
- `apps/mobile/src/theme/stack-options.tsx` (`largeTitleScreenOptions`) and `src/app/(tabs)/(index,search,library,account)/_layout.tsx`.
- `apps/mobile/AGENTS.md` (Library header, `CardLink`), `docs/scope/scope.md` (slice 6 ticks).

## Requirements

1. Every write from the menu goes through `useTrackingWrite`: optimistic by core's intent rule, reverted with the server's message on refusal, Undo where the catalog card offers it; the UI never shows a false success (AGENTS.md section 11).
2. Library placement stays the server's: the app never moves a card by itself; the page refetch does (AGENTS.md section 9).
3. Movie rules hold: planned or watched, never both; Mark watched off before the release day (UTC) unless a mark is stored; Plan on a watched movie drops mark and score with Undo (AGENTS.md section 7). Stop tracking keeps every mark and rating.
4. The quick action and the card link stay separate accessibility elements; the card's label is unchanged; screen readers reach every menu action through `accessibilityActions`.
5. No colour literal, no new token, no `BlurView` outside `components/glass/`, `Text` only from `@/components/text` (the boundary tests keep passing).
6. Loading, empty, error, signed out and missing image states stay; none hides under the header.

## Security considerations

No new route, no new read and no new secret. Library stays private: signed out it sends no private request, and every write still rechecks the session on the server, which also enforces the release gate and ownership (AGENTS.md section 11). The preview opens the public title screen only.

## Acceptance criteria

- **AC-1**: On iOS, Library shows a large "Library" title that collapses into the bar as the grid scrolls and grows back; Android shows its plain bar.
- **AC-2**: Signed out, the session load, empty, failed and loading states all sit below the header, never under it.
- **AC-3**: While a page loads, two rows of pulsing poster skeletons show at the cards' size; under Reduce Motion they do not pulse.
- **AC-4**: Long pressing a library card on iOS shows the title preview and the type's menu; on Android an alert with the same enabled actions and Cancel. A screen reader lists the same actions.
- **AC-5**: A menu write updates the card and moves it between pages as the server places it, with the same toast and Undo as on a catalog card; a refused write reverts with the server's message.
- **AC-6**: A failed catalog card opens and previews with no menu; a missing card does neither.
- **AC-7**: The quick action button works as before, beside the menu.
- **AC-8**: A long title stays inside its column at every text size; card text is capped at `CARD_FONT_SCALE_CAP`.
- **AC-9**: Catalog cards on Home, Search, lists and More like this behave exactly as before (`poster-card-actions.test.tsx` passes unchanged).
- **AC-10**: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `npx expo-doctor` pass.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (the new `card-link` and `library-card` tests, the library screen test, the unchanged poster card tests). From `apps/mobile`: `npx expo-doctor`. No route, server or database change, so no `pnpm build` and no `pnpm test:db`.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root; from `apps/mobile`, `npx expo start --dev-client --clear` (move `apps/mobile/.env.development.local` aside for the simulator).
2. Signed out, open Library: a large "Library" title, and the Sign in panel below it.
3. Sign in with a seed user that has planned movies, tracked shows and listed games. Open Library: the skeleton pulses briefly, then the cards. Scroll: the title collapses into the bar; scroll back: it grows.
4. On Movies, Watchlist, long press a card: the preview and Remove from watchlist, Mark watched (off for an unreleased movie). Choose Remove from watchlist: the card leaves, the toast offers Undo; Undo brings it back.
5. On Shows, long press a card and choose Stop tracking: the card leaves with Undo; the title's marks are kept.
6. On Games, long press a card: Remove; on a page with a quick action, the button still works.
7. Press a card's quick action button: it behaves as before.
8. Set Larger Text to the maximum: long titles stay inside their columns, the large title and pills read in full.
9. Turn on Reduce Motion and pull to refresh on an empty cache: the skeleton does not pulse.
10. Optional: on Android, long press shows the alert with the same actions.
