# Mobile: card quick actions on library cards (feature 28, last build slice)

## Goal

Give the app's library cards the same quick actions the web's library cards have, so you can clear or advance a title without opening it. This is the follow up 5c left open (prompts/mobile-library-tabs.md, decision 5). After it lands, feature 28 is marked `done`, with the store release (6b) and change password on the phone moved to the scope's Deferred list (your call, 2026-11-22).

The web's actions, page by page (the source of truth for this slice):

| Type | Page | Web action | Undo |
| --- | --- | --- | --- |
| Movies | Watchlist, Coming soon | Planned bookmark: unplan | Plan again |
| Movies | Watched | Watched mark: unmark (drops the score too) | Put mark and score back from the write's `cleared` answer; no Undo when it cleared nothing |
| Shows | Up next | Mark next watched (`S2E1`) | Undo the episode mark |
| Shows | Up next, missing show | Stop tracking | Track again |
| Shows | Upcoming, Watched | none | |
| Games | Want to play | Bookmark: remove | Restore the row |
| Games | Coming soon, Playing, Finished | X: remove from your games | Restore the row |

## Inspected code

- Web: `components/library/library-card.tsx`, `library-grid.tsx` (movie removal, its toasts and Undo), `mark-next-watched-button.tsx`, `watchlist-show-controls.tsx` (the next episode's id comes from a cached season read), `missing-show-card.tsx`, `game-library-card.tsx`, `game-library-grid.tsx`, `show-cards.tsx`.
- Core: `api/v1/library.ts` (the Up next `place.next` is a season and episode number, no episode id), `tracking/messages.ts` (`LIBRARY_MESSAGES`, `UNDO_EXPIRED_MESSAGES`, `MARK_NEXT_MESSAGES`, `SHOW_TRACKING_COPY`, `MISSING_SHOW_COPY`, the games copy with "Removed from your games.", `UNDO_ACTION_LABEL`).
- Mobile: `components/library-card.tsx`, `screens/library-screen.tsx`, `lib/library.ts`, `lib/tracking.ts` (`useTrackingWrite`, `useUndoToast`, `postRestore`, invalidation of `libraryKeys.all`), `lib/movies.ts`, `lib/shows.ts` (`putEpisodeWatched`, `restoreEpisode`, `untrackShow`, `restoreShowTracking`), `lib/games.ts` (`removeGame`, `restoreGame`), `lib/catalog.ts` (`fetchSeason`, `catalogKeys.season`), `screens/game-screen.tsx` (its remove and Undo), `__tests__/library-screen.test.tsx`, `test-utils/title-harness.tsx`.

## Skills used

`tanstack-query` (optimistic hide on an infinite query, `fetchQuery` for the season), `react-native-testing` (RNTL v14), `vercel-react-native-skills` (the grid stays a flat list with stable keys), `expo-design-system` (tokens only).

## Decisions and assumptions

1. **Same actions, same words as the web.** Exactly the table above, no more. Every label, toast and Undo line comes from core's message files, so both apps say the same thing (mobile AGENTS.md, BeStats rules). Upcoming and Watched show cards keep no button, as on the web.
2. **Where the Up next episode id comes from (needs your approval).** `/me/library` sends the next episode's season and number, but the mark route takes the TMDB episode id. I recommend the web's own source: on tap, the app reads that season through the public, cached `GET /api/v1/shows/{id}/seasons/{n}` (`queryClient.fetchQuery(catalogKeys.season(...))`, so a season you already opened costs nothing) and picks the episode by number, then marks it. If the read fails or the episode isn't listed, nothing is marked and a toast says `MARK_NEXT_MESSAGES.unavailable`, as the web never offers a number from a failed read. The alternative, adding `episodeId` to the v1 `place.next`, changes the API contract (spec 0035) and only works once the web deploys, so I'm leaving it out. Say so if you prefer it.
3. **How it looks (needs your approval, no native precedent).** A round 44 point button in the poster's corner, the same spot as the web: the Planned bookmark (green, `status-planned`) top right on movie Watchlist and Coming soon and on game Want to play; the filled Watched mark bottom right on movie Watched; an X bottom right on games Coming soon, Playing and Finished; a ✓ `S2E1` button bottom right on Up next shows; Stop tracking (bookmark) top right on a missing show. The card itself stays a link to the title screen; the button is its own pressable beside it, never nested inside the link, so VoiceOver reads them as two elements. Each button's accessibility label is the web's (`Remove Dune from Watchlist`, `Unmark Dune as watched`, `MARK_NEXT_MESSAGES.markLabel(...)`, `Remove Hades from your games`, `MISSING_SHOW_COPY.stopLabel`). Symbols are plain text glyphs, as the rest of the app uses; no new icon dependency.
4. **The card hides at once, then the server decides.** A removal (movie unplan or unmark, game remove, stop tracking) takes the card out of the cached library page optimistically (`setQueryData` on the infinite query), and the write then invalidates `libraryKeys.all` like every tracking write does. On failure the card comes back in its place and the toast shows the server's reason, with Retry when offline (`useTrackingWrite`'s existing behaviour). Mark next watched does not hide the card: the refetch decides whether the show stays on Up next with its next episode or moves to Upcoming or Watched (placement is the server's, section 9).
5. **Undo through what exists.** Every toast goes through `useUndoToast` and `postRestore` with the write's own `cleared` answer, as the title screens do (5b). A movie unmark that cleared nothing gets no Undo; a cleared score adds `LIBRARY_MESSAGES.watched.scoreRemoved`. Each card's control keeps its own toast id (`library-<type>-<page>-<id>`), so several removals in a row each keep their Undo (at most three stacked, the toast rule).
6. **Title screen state stays right.** Each write also invalidates that title's `trackingKeys` state, so opening the title afterwards shows the new marks.
7. **Code shape.** A new `src/lib/library-actions.ts` holds one hook, `useLibraryCardAction(type, path)`, which picks the write, the optimistic hide and the Undo per entry, built from the existing `useTrackingWrite` and `useUndoToast`. A new `src/components/card-action-button.tsx` draws the round button. `LibraryCard` gets an optional `action` slot; `library-screen.tsx` wires them. No core change and no web change are planned; if a pure piece (which action a page offers) is useful to both apps, it moves to core's `catalog/library-card.ts` with a test, never copied.
8. **Scope update after the build (your call).** In `docs/scope/scope.md`: tick this follow up under step 5, tick step 5 itself (every sub slice is done), move 6b (store release) and change password on the phone to `## Deferred` with today's date, tick `Build it`, and set feature 28 to `done`. Spec 0033's status line moves to `Accepted`. Verify it, Test it and Document it stay open boxes; I won't tick those.
9. **Branch and commits:** `feat/mobile-card-actions` off `main`. Small commits that each build: the action hook and button; movie and game actions; show actions; tests; scope and spec status.

## Expected files

- `apps/mobile/src/lib/library-actions.ts` (new)
- `apps/mobile/src/components/card-action-button.tsx` (new)
- `apps/mobile/src/components/library-card.tsx` (the action slot)
- `apps/mobile/src/screens/library-screen.tsx` (wiring)
- `apps/mobile/src/__tests__/library-actions.test.tsx` (new)
- `docs/scope/scope.md`, `docs/specs/0033-mobile-app-expo/index.md` (status line only)
- `apps/mobile/AGENTS.md` changes go through `/sync` afterwards.

## Requirements

- Signed out: no card shows (the existing Sign in panel), so no action can fire.
- Every action: 44 point touch target, an accessibility label, a disabled state while its write is in flight so a double tap sends one write.
- A failed write never leaves a false success: the card comes back and the toast says why (section 11).
- Unmarking a watched movie drops its score, with Undo putting both back (section 7). Mark next watched marks only that aired episode (the server checks the air date too).
- Personal and community colours stay apart; the planned green is only on the bookmark.

## Security considerations

- Every write goes through `apiRequest` with the bearer token; the user ID is never sent; the server rechecks the session and RLS limits the rows.
- The season read is the public catalog route, no key on the phone.
- No new env value, dependency, route or secret.

## Acceptance criteria

1. Each page in the table shows exactly its web action, and Upcoming and Watched show cards show none.
2. Each action works signed in, shows the web's toast, and its Undo puts the title back on the same page after the refetch.
3. Mark next watched on an Up next card marks that episode; the card then shows the next episode, or leaves Up next when the show moves.
4. A refused or offline write brings the card back with the reason (and Retry offline).
5. A missing show card's Stop tracking clears it, with Undo.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test`. `npx expo-doctor` in `apps/mobile`. No `pnpm build` or `pnpm test:db` (no web, core or database change).

Jest tests: each page renders the right button and label (and none on Upcoming and Watched shows); each tap sends the exact route and body (title harness); the optimistic hide and the rollback on refusal; Undo posts the `cleared` answer to the right restore route; no Undo when an unmark cleared nothing; Mark next watched reads the season and marks the matching episode id, and shows the unavailable toast when the season read fails; a double tap sends one write.

## Manual test steps (iOS Simulator, development build)

1. `pnpm dev:docker`, then `npx expo start --dev-client` in `apps/mobile`, open the development build, sign in as a user with planned and watched movies, tracked shows and games in each status.
2. Library, Movies, Watchlist: tap a card's bookmark. The card goes, the toast says "Removed from Watchlist". Tap Undo: it comes back.
3. Movies, Watched: tap the watched mark on a scored movie. Toast with "Your score was removed too." Undo brings back the mark and the score.
4. Shows, Up next: tap ✓ `S1E3`. The card shows `S1E4` (or leaves for Upcoming or Watched). Undo puts `S1E3` back.
5. Games, Want to play: tap the bookmark; Playing: tap the X. Each toast says "Removed from your games." and Undo restores it.
6. Turn off Wi-Fi on the Mac and tap an action: the card comes back with an offline toast and Retry.
7. VoiceOver: each card reads as a link, then its button with the web's label.
8. Open a title you changed from the library: its screen shows the new state.
