# Mobile look, slice 4: catalog card actions

Feature 29 (Mobile look), slice 4. Branch `feat/mobile-look-card-actions` off `main`, one PR.

## Goal

On the app's catalog cards (See all lists, Search results, Home rows and More like this), you can long press a card to see its page in a preview and act on it in place: plan or mark a movie watched, track a show, put a game on Want to play. The card itself shows your own state the way the web's cards do. The web does not change, apart from reading its card labels from core.

## Inspected code

- Scope: `docs/scope/scope.md` feature 29, slice 4 (`confirm or fold into Search`), and decision list item 3 in `prompts/mobile-web-parity-foundation.md`.
- App: `components/poster-card.tsx` (`PosterCard`, `PosterFrame`, a `Link asChild` around a `Pressable`), `poster-grid.tsx` (already 3 columns, `GRID.columns`), `landing-section.tsx` (Home rows), `title-extras.tsx` (More like this), `screens/search-screen.tsx`, `screens/catalog-list-screen.tsx`; `lib/tracking.ts` (`trackingKeys.title`, `fetchTitleState`, `useTrackingWrite`, `useUndoToast`), `lib/library-actions.ts` and `components/card-action-button.tsx` (the library card pattern), `lib/movies.ts`, `shows.ts`, `games.ts` (writes, restores, `writeMovieIntent`, `writeGameIntent`).
- API: `GET /api/v1/me/titles?ids=movie:1,tv:2,game:3` (up to `MAX_TITLE_KEYS`, 40) answers every key; the v1 movie state is `planned`, `watchedAt`, `rating`; the show state `tracked`, `progress`, ratings; the game state `status`, `rating`. Catalog items carry `releaseDate`.
- Web: `components/tracking/movie-card-slots.tsx`, `show-card-slots.tsx`, `game-card-slots.tsx`, `card-bookmark-button.tsx` (`Plan ${title}`), `card-watched-button.tsx` (`Unmark ${title} as watched`), `show-card-bookmark-button.tsx` (`Track` / `Stop tracking ${name}`), `game-card-bookmark-button.tsx` (`Want to play: ${name}`). Core rules `movieCardStatus` (`catalog/movie-page.ts`) and `gameCardStatus` (`catalog/game-page.ts`).
- Expo Router 58 (`expo-router` ~58.0.32): `Link.Trigger`, `Link.Menu`, `Link.MenuAction` (`title`, `icon` as an SF Symbol, `isOn`, `destructive`, `disabled`, `onPress`) and `Link.Preview`. In `build/link/elements.js` both render nothing unless `EXPO_OS === "ios"`, so Android gets neither.

## Skills used

`expo-router` (Link menus and previews), `tanstack-query` (seeding per title keys from one batch read), `react-native-testing` (RNTL v14), `vercel-react-native-skills` (list rendering cost). Before writing against `Link.Menu` and `Link.Preview`, read the SDK 58 Expo Router docs.

## Decisions (yours, 2026-11-24)

1. **Own slice, own PR**; Search (slice 5) stays separate.
2. **The menu matches the web per type**: a movie offers Plan or Remove from plan and Mark watched or Remove watched mark; a show Track or Stop tracking; a game Want to play or Remove. Each removal offers Undo like the web.
3. **Cards show your own state, as the web's do.**
4. **Surfaces**: See all grids, Search results, Home rows and More like this.

## Decisions and assumptions (mine, tell me if any is wrong)

5. **One state read per screen, seeded into per title keys.** A new `useCardStates(type, ids)` reads `/me/titles` for the loaded cards in chunks of 40 (one chunk per loaded grid page of 24, so scrolling adds one read per page) and writes each answer into `trackingKeys.title(type, id)`, the key the title screens already use. Every card write then uses that same key as its `stateKey`, so a card and its title page always agree, and `useTrackingWrite`'s refetch keeps both honest. The batch query sits under `PRIVATE_QUERY_ROOT`, so sign out wipes it.
6. **Signed out, loading or a failed read: the plain catalog card and no menu**, as the web's visitors and failed reads get the plain card (web AC-2, AC-17). A long press still shows the preview on iOS. No error is shown on twenty cards; the failure is quieter than an error.
7. **Android has no native `Link.Menu`.** There a long press opens a native `Alert` with the same actions and Cancel (at most two actions plus Cancel per type, which Android's alert allows). On both platforms the card also carries `accessibilityActions` with the same actions, so VoiceOver and TalkBack reach them from the card without a long press.
8. **Movie Watched follows the release gate from core** (watched only from the release day, UTC, AGENTS.md section 7): before it, the Mark watched action is shown disabled on iOS and left out on Android and in the screen reader actions. The server still refuses it on its own.
9. **What the card shows** (core's `movieCardStatus` and `gameCardStatus`, never a copy):
   - Movie: the green Planned bookmark at the top right when planned; the Watched mark at the bottom right when watched; the cyan personal score replaces the amber pill at the top left on a scored watched movie.
   - Game: the Planned bookmark for Want to play; the cyan score replaces the IGDB pill on a scored Playing or Finished game; the game status pill (Playing, Finished) at the bottom, as the web's.
   - Show: the green bookmark when tracked. The web's show rating badge, Upcoming pill and Finished or Caught up line need the library page placement, which the v1 title state does not carry and the app may not work out itself (apps/mobile/AGENTS.md: placement is the server's). They stay off the app's show cards in this slice; a later slice can add placement to the v1 read if you want them.
   - These marks are drawn, not pressable: the action lives in the menu, so a card has one tap target (open the title) and no small buttons to miss.
10. **Copy from core.** The web's card labels (`Plan ${title}`, `Unmark ${title} as watched`, `Track ${name}`, `Stop tracking ${name}`, `Want to play: ${name}`) move to a new `CATALOG_CARD_ACTION_LABELS` in core's `tracking/messages.ts`, which the web buttons read (no visible change on the web). The short menu titles reuse the title page control labels already in core's messages; any that do not exist yet are added there.
11. **Toasts and Undo** use the same `useTrackingWrite` and `useUndoToast` paths the title screens use, with the same core messages, so a card action and the same action on the title page say the same thing. Haptics come from `useTrackingWrite` as everywhere else.

## Expected files

- `packages/core/src/tracking/messages.ts` (+ test): `CATALOG_CARD_ACTION_LABELS`.
- `apps/web/components/tracking/card-bookmark-button.tsx`, `card-watched-button.tsx`, `show-card-bookmark-button.tsx`, `game-card-bookmark-button.tsx`: read the core labels.
- `apps/mobile/src/lib/card-states.ts` (new): `useCardStates`, the batch read and seeding.
- `apps/mobile/src/lib/catalog-card-actions.ts` (new): `catalogCardActions` (pure: the actions a card offers from its type, state and release date) and `useCatalogCardActions` (the writes and Undos).
- `apps/mobile/src/components/poster-card.tsx`: the state marks, `Link.Trigger`, `Link.Menu`, `Link.Preview`, the Android long press and `accessibilityActions`.
- `apps/mobile/src/components/poster-grid.tsx`, `landing-section.tsx`, `title-extras.tsx`: pass the screen's ids to `useCardStates` and the state to each card.
- Tests: `src/lib/catalog-card-actions.test.ts`, `src/lib/card-states.test.tsx`, `src/__tests__/poster-card-actions.test.tsx`; the existing screen tests get `/me/titles` answers where a session is present.
- `apps/mobile/AGENTS.md` and `docs/scope/scope.md` (slice 4 box and pointer).

## Requirements

- R1. A signed in user sees, on every listed surface, each card's own state as in decision 9, matching the title page and the Library tab.
- R2. Long press on iOS shows the title's preview with the type's menu; tapping an action writes, updates the card at once, and shows the outcome toast; tapping the preview opens the title.
- R3. On Android a long press opens the alert with the same actions; on both platforms a screen reader reaches the actions as card actions.
- R4. Each removal (Remove from plan, Remove watched mark, Stop tracking, Remove a game, and Plan on a watched movie, which drops its mark and score) shows Undo, which restores through `postRestore`.
- R5. A refused write puts the card back and shows the server's message; offline offers Retry; after a 401 nothing is put back.
- R6. One `/me/titles` request per loaded page of cards (at most 40 keys), never one per card.
- R7. Signed out, while loading, or after a failed state read, the card is the plain catalog card with no menu, and taps still open the title.
- R8. A tap still opens the title; the card keeps one 44 point target or larger.

## Security considerations

- The state read and every write go through `apiRequest` with the bearer session; the server takes the user from the token and RLS bounds the rows (AGENTS.md section 11). The app sends only media type and id.
- The batch query lives under `PRIVATE_QUERY_ROOT`, so sign out, an expired session and account deletion wipe it from memory and the persisted cache.
- No new route, no schema change, no new dependency.

## Acceptance criteria

- AC-1: On See all, Search, a Home row and More like this, a planned movie shows the green bookmark, a watched scored movie its cyan score and the Watched mark, a tracked show the bookmark, a Want to play game the bookmark, a scored Finished game its cyan score and Finished pill.
- AC-2: Long press a movie card on iOS: the preview shows, the menu offers Plan and Mark watched (Mark watched disabled for an unreleased movie); Plan turns the bookmark on at once and the toast confirms; the title page then shows it planned.
- AC-3: Remove watched mark from the menu shows Undo; Undo brings the mark and score back.
- AC-4: Track a show and Stop tracking from the menu; Stop tracking shows Undo and keeps every episode mark and rating.
- AC-5: Want to play and Remove on a game card; Remove shows Undo.
- AC-6: Signed out, no card shows a mark and a long press shows no actions.
- AC-7: A scrolled See all grid sends one `/me/titles` request per loaded page.
- AC-8: A refused write reverts the card with the server's message; offline offers Retry.
- AC-9: VoiceOver on a card offers the actions; the web cards' accessible names are unchanged.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile), `pnpm build` (the web reads new core exports), `npx expo-doctor` in `apps/mobile`.

## Manual test steps (iOS Simulator, local stack)

1. `orb start`, then `pnpm exec supabase start`, then `pnpm dev:docker`; start Metro with `npx expo start --dev-client` in `apps/mobile` (move `apps/mobile/.env.development.local` aside if its LAN address is stale).
2. Sign in as a local test account. Open Home: on the Movies tab, long press a released movie in a row. Expect the preview and the menu with Plan and Mark watched.
3. Tap Plan. Expect the green bookmark on the card at once and the confirmation toast. Open the movie: it shows Planned.
4. Back on the card, long press, tap Mark watched. Expect the Watched mark, the bookmark gone. Rate it on the title page, come back: the card shows the cyan score.
5. Long press, tap Remove watched mark. Expect the Undo toast; tap Undo: mark and score return.
6. Long press an unreleased movie (Upcoming row): Mark watched is greyed out.
7. Switch to Shows, open See all, long press a show, tap Track: the bookmark shows. Long press, Stop tracking, then Undo.
8. Switch to Games, Search for a game, long press, Want to play, then Remove and Undo.
9. Open a title, scroll to More like this, long press a card: the same menu.
10. Turn on VoiceOver, focus a card, swipe up or down for actions: the same actions are read.
11. Sign out: cards show no marks and a long press shows only the preview.
12. Turn on airplane mode, try Plan: the card reverts and the toast offers Retry.
