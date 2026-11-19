# Mobile 5b: title pages and tracking (feature 28, spec 0033 Build plan step 5, second slice)

## Goal

Turn the read only title screens from 5a into the real title pages, with every tracking control the web has: movies (Plan, Mark watched, Your score), shows (Plan to watch or Tracking, progress, calculated ratings, seasons), a new season screen (episodes with marks and scores, Mark season watched), and games (Want to play, Playing, Finished, score, Remove). Every write the web offers Undo for shows an Undo toast here too. This is slice 5b of five (agreed 2026-11-19):

- 5a (shipped, PR #82): shell, home, list screens, search, read only title pages.
- **5b (this plan)**: title pages and tracking. Part of **AC-14** (personal ratings visibly apart from TMDB and IGDB on every title screen; the catalog notice stays). It uses the write and restore routes that **AC-5**, **AC-6** and **AC-7** already proved on the server.
- 5c: library tabs (every page from core), card tracking badges.
- 5d: sign up, account, deletion, offline cache, About.
- 5e: deep links.

## Inspected code

- Spec 0033 `index.md` and child 0035 (API surface, the Undo contract, Value sourcing). No spec change is needed: every route and schema 5b calls is built (step 4).
- `apps/mobile`: `screens/movie-screen.tsx` (the tracer's optimistic Watched pill), `show-screen.tsx`, `game-screen.tsx`, `title-states.tsx`; `components/{detail-header,glass-button,notice,centered-state,filters-sheet,catalog-notice,poster-card}.tsx`; `lib/{api,movies,catalog,session,query-client,images}.ts`; the tab stack layout (`(tabs)/(index,search,library,account)/_layout.tsx`).
- Web: `components/tracking/movie-tracking-controls.tsx`, `score-picker.tsx`, `tracking-toast.ts` (`UNDO_TOAST_MS` 10 s, one toast per control), `use-movie-cleared-undo.ts`, `game-status-control.tsx`, `use-game-undo.ts`, `use-show-tracking.ts`, `show-tracking-control.tsx`, `show-progress-slot.tsx`, `show-rating-slot.tsx`, `season-tracking-store.tsx`, `season-watched-control.tsx`, `episode-tracking-controls.tsx`; pages `app/shows/[id]/page.tsx` and `app/shows/[id]/season/[number]/page.tsx`; `components/movie/cast-row.tsx`, `components/game/{game-facts,screenshot-gallery}.tsx`.
- Core: `api/v1/{movie,show,game,titles,cleared}.ts`, `tracking/{intent,episode-intent,game-intent,messages,types}.ts`, `tv/{season-watch,ratings,progress,air-status}.ts`, `format.ts` (`formatPersonalScore`, `formatCalculatedRating`, `seasonMetaParts`, `formatGameReleaseDate`), `catalog/movie-page.ts` (`isMovieReleased`, `movieReleaseNote`).
- `apps/web/lib/tracking/AGENTS.md` (every rule below).

## Skills used

`expo-router` (the season route inside the tab stacks), `tanstack-query` (mutations with optimistic updates and rollback), `vercel-react-native-skills` and `react-native-best-practices` (episode list, horizontal galleries, images), `expo-design-system`, `react-native-testing`. I'll check the Expo SDK 58 docs for any API I touch that 5a didn't (for example `Modal` sheet presentation, `AccessibilityInfo.announceForAccessibility`).

## Decisions and assumptions

New screens and controls without a native precedent are marked "needs your approval here" (AGENTS.md section 3).

1. **Rules come from core only.** Every optimistic state is computed with core's intents (`applyTrackingIntent`, `applyEpisodeIntent(s)`, `applyGameIntent`, `canHoldScore`); release and air gates use `isMovieReleased`, `isGameReleased`, `airStatus` and `todayUtc`; season and show ratings, progress and the season summary come from the server's `/me/titles` and `seasonWatchSummary`; copy from `tracking/messages.ts`. The server's gate stays the authority (AC-6): a 409 rolls back with its message.
2. **One write pattern for every control.** A small `useTrackingMutation` helper in `src/lib/tracking.ts` wraps TanStack `useMutation`: cancel the private query, apply the core intent to the cached state, roll back on error with the server's message (never after a 401, since that already wiped the private cache), and invalidate the state on settle. It generalizes the tracer's movie mutation, which moves onto it. Each toggle reads its target from the cached (optimistic) state, so a double tap sends true then false, as on the web.
3. **Undo toast (new component, needs your approval here).** A `ToastHost` in the root layout and a `useToast()` hook, built with React Native views (no new dependency):
   - A glass plate pinned above the tab bar, one line of text and an **Undo** button (44 point target), with a close button.
   - It stays 10 seconds (`UNDO_TOAST_MS`, the web's value, moved to core so both apps read it) and is replaced, not stacked, by the next toast for the same control, as the web keys its toasts.
   - VoiceOver and TalkBack announce it (`accessibilityLiveRegion` and `AccessibilityInfo.announceForAccessibility`).
   - Undo posts the `ClearedState` built exactly as spec 0035 says (movie `cleared` as returned; `episode` only when `newlyMarked`; `season` with its `seasonNumber`; `show_tracking`; `game_status` and `game_removed`), shows the restored state at once, and on a 409 says the core `UNDO_EXPIRED_MESSAGES` text.
   - Errors use the same host without Undo (instead of the tracer's inline `Notice`), so a failed write is always visible. A session expired error keeps today's behaviour: the root layout's notice opens Sign in.
4. **Score picker (new component, needs your approval here).** The web's popover becomes a bottom sheet (`Modal` with a slide up glass plate, like the 5a Filters sheet): a "Your score" heading, a 5 by 2 grid of 1 to 10 buttons (the current one pressed), and Clear score. Before release it can clear but not score, with the release line, as the web's picker does. Used by movies, episodes and games.
5. **Movie screen.** Keeps the 5a/tracer hero and adds:
   - The three pills in the web's order: **Plan / Planned**, **Mark watched / Watched**, and **Your score** (only on a watched movie, with the personal star colour `score-personal`, never mixed with the TMDB line). Mark watched opens the score sheet at once. Before release only Plan shows, with the release line, unless a mark or score is stored (then they can be removed, not added).
   - Undo toasts: planning a watched movie and unmarking a watched movie with a score both offer Undo (core `MOVIE_CLEARED_MESSAGES`), restoring through the matching `…/restore` route.
   - Below the overview: **Directed by**, and a horizontal **Cast** row (profile photo or the missing photo placeholder, name, character), as the web's cast row shows, with its empty message when TMDB has no cast.
6. **Show screen.**
   - Under the header: the **Plan to watch / Tracking** toggle (`SHOW_TRACKING_COPY`); Stop tracking keeps every mark and rating and offers Undo (`show_tracking`); an already stopped show is a quiet success with no Undo.
   - The progress line from `/me/titles` (`progress`: "N of M episodes", the next episode, or the none aired copy from `SHOW_PROGRESS_MESSAGES`) and **Your show rating** (`formatCalculatedRating`, "Not rated" when none), visibly apart from the TMDB line.
   - A **Seasons** list: each row shows the season poster (or placeholder), name, `seasonMetaParts`, and its calculated season rating from `seasonRatings` when it has one. Specials (season 0) are listed last, as on the web, and never feed the show rating. A row opens the season screen.
   - Signed out: "Sign in to track" in place of the toggle; no `me` request.
   - Not in 5b: cast, trailer, where to watch and more like this for shows, since the v1 show answer has none of them; adding them is an API change. I'll note it as a follow up rather than invent data.
7. **Season screen (new route, needs your approval here).** `shows/[id]/season/[number].tsx` inside the tab stacks, matching the web path `/shows/[id]/season/[number]`:
   - Header: season name, show name, air year and episode count, the season's calculated rating (personal, labelled "Your season rating").
   - **Mark season watched** (marks only aired regular episodes, from the server) or **Unmark season** when all aired are watched, with the summary line from `seasonWatchSummary`. Both offer Undo (`season`).
   - A list of episode rows: number and name, air date (or "Airs Mar 3" / "Date TBA" for future and undated ones, never a local time), runtime, a still (or placeholder), a **Watched** toggle and a **score** button opening the score sheet. Future and undated episodes cannot be marked or scored, but a stored mark or score can be removed. Unmarking keeps the score. A score on an unwatched episode also marks it (server rule; no Undo, as on the web). A newly made mark offers Undo (`episode`).
   - Previous season and Next season buttons at the bottom when they exist.
   - States: loading skeleton, empty season ("No episodes listed yet"), catalog failure with Retry, and a failed state read that keeps the episode list readable and says `TRACKING_READ_FAILED` with Retry.
8. **Game screen.**
   - Three status pills in one group, **Want to play**, **Playing**, **Finished** (`GAME_STATUS_LABELS`): tapping an unpressed pill sets it, tapping the pressed one removes the game. Remove offers Undo (`game_removed`); moving to Want to play from a scored status clears the score and offers Undo (`game_status`).
   - **Your score** pill only on Playing or Finished (`canHoldScore`); a move into Finished with no score opens the sheet, a move into Playing does not.
   - Before release, Playing, Finished and scoring are disabled unless pressed, with the release line (`formatGameReleaseDate`).
   - Below: summary and storyline (left out when IGDB has none), a horizontal **Screenshots** row (tap opens a full screen pager), and **Facts** (developers, publishers, platforms, genres, themes, modes, perspectives, franchise, series, engines), each row left out when empty.
   - Not in 5b: the trailer and More like this. The trailer is a YouTube key, and playing it needs either a new dependency or sending the user out to YouTube; More like this has only ids in v1. Both are follow ups if you want them.
9. **Query keys.** Every private key stays under `PRIVATE_QUERY_ROOT` (`"me"`): `["me","titles",key]` for movie, show and game state and `["me","season",showId,n]` for a season's episodes, so sign out wipes them all. Public season data goes under `catalogKeys.season(id, n)`. After an episode or season write, the season state and the show's title state are invalidated together (progress and ratings move).
10. **No new API routes, no database change, no new dependencies.** If the full screen screenshot pager needs a package Expo ships, I'll install it with `npx expo install` and say so; my default is a `Modal` with a paging horizontal `FlatList`.
11. **Tests (jest-expo, RNTL v14).** Movie: Plan on a watched movie shows Undo and the restore call sends the right `ClearedState`; unreleased shows Plan only. Show: Stop tracking offers Undo; the show rating reads "Not rated" with no ratings. Season: Mark season watched sends `{ watched: true }`; unmark sends the shown ids; a future episode's toggle is disabled; a failed write rolls back and shows the message. Game: pressed pill removes with Undo; Finished opens the score sheet; before release Playing is disabled. Signed out: no `me` request on any title screen. Toast: replaces per control and disappears after 10 seconds (fake timers).
12. **Branch and commits:** `feat/mobile-title-tracking` off `main`; small commits that each build: `UNDO_TOAST_MS` to core; tracking data layer and mutation helper; toast host; score sheet; movie screen; show screen; season route and screen; game screen; tests; scope tick.

## Expected files

- `packages/core/src/tracking/messages.ts` or a small `tracking/undo.ts` (`UNDO_TOAST_MS`), and the web's `tracking-toast.ts` importing it.
- `apps/mobile/src/lib/tracking.ts` (writes, restores, `useTrackingMutation`), `src/lib/movies.ts` (plan, rating, restores), `src/lib/catalog.ts` (`fetchSeason`, `catalogKeys.season`).
- `apps/mobile/src/components/{toast,score-sheet,tracking-pill,cast-row,season-row,episode-row,screenshot-row,facts-list}.tsx`.
- `apps/mobile/src/screens/{movie,show,season,game}-screen.tsx`.
- `apps/mobile/src/app/(tabs)/(index,search,library,account)/shows/[id]/season/[number].tsx` (exact file layout follows Expo Router's rule for a nested path next to `shows/[id].tsx`), the tab stack layout, and `src/app/_layout.tsx` (the toast host).
- Tests in `apps/mobile/src/__tests__/`.
- `docs/scope/scope.md`: the 5b line. `apps/mobile/AGENTS.md` changes go through `/sync`.

## Requirements

- Every screen covers loading, empty, error with Retry, missing image and signed out states; 44 point touch targets; VoiceOver and TalkBack labels; toggles report state (`accessibilityState.selected`) rather than swapping names (AGENTS.md section 3).
- Personal scores and calculated ratings are always labelled as yours and drawn apart from TMDB and IGDB ratings; full precision is kept and rounded to one decimal only for display; no rating reads "Not rated", never 0 (section 9).
- Air dates are UTC days; never imply a local release time (section 9).
- The UI shows only the server's confirmed state or an optimistic one it rolls back with the error; never a false success (section 11).

## Security considerations

- Every write goes through `/api/v1/me/*` with the bearer token; the user ID is never sent. A forged Undo body can only touch the caller's own rows (RLS), and it is built from the server's own answer.
- `me` queries run only with a session; signed out screens send no private request.
- No new env values, secrets or endpoints. `security-boundary.test.ts` and `design-tokens-boundary.test.ts` keep covering the new files (tokens only, no colour literal).
- Undo and error toasts carry no token or private data beyond the title the user is looking at.

## Acceptance criteria

- Movie: Plan, Mark watched and Your score behave as on the web, including the planned or watched rule, the score sheet opening on Mark watched, the release gate and both Undo toasts.
- Show: Plan to watch / Tracking toggles; Stop tracking keeps marks and offers Undo; progress and show rating match the web for the same account.
- Season: marking the season marks only aired regular episodes; unmarking offers Undo that restores them; episode marks and scores are independent; future episodes cannot be marked.
- Game: status pills, Remove with Undo, score only on Playing or Finished, Want to play clears the score with Undo, release gate.
- A refused write (for example an unreleased movie forced through) rolls back and shows the server's message.
- Signed out, every title screen offers Sign in to track and sends no `me` request.
- The same account shows the same state on the web after a reload.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile jest). `pnpm build` because core and one web file change (`UNDO_TOAST_MS`). `pnpm test:db` is not needed (no database change). `npx expo-doctor` in `apps/mobile`.

## Manual test steps (iOS Simulator, development build)

1. Start the local stack and the web (`pnpm dev:docker`), then `npx expo start --dev-client` in `apps/mobile`, and open the development build.
2. Signed out, open a movie, a show, a season and a game: each shows Sign in to track and its full read only content (cast on the movie, screenshots and facts on the game).
3. Sign in. Open a released movie: tap Mark watched, the score sheet opens; pick 8. Tap Plan: the mark and score go and a toast offers Undo; tap Undo, both come back.
4. Tap Watched to unmark: Undo toast; let it time out after 10 seconds.
5. Open an unreleased movie: only Plan and the release line show.
6. Open a show you don't track: tap Plan to watch, it reads Tracking. Open season 1, tap Mark season watched: aired episodes mark, the show screen's progress and season list update. Tap Unmark season, then Undo.
7. On an episode, set a score, then unmark it: the score stays. Open a season with a future episode: its toggle is disabled.
8. On the show, tap Tracking to stop: Undo toast; marks stay.
9. Open a released game: Playing, then Finished (the score sheet opens), pick 9; tap Want to play: score clears with Undo; tap Undo. Tap the pressed pill to remove: Undo.
10. Open an unreleased game: Playing and Finished are disabled with the release line.
11. Open the same titles on the web at `localhost:3000` signed in as the same user: the state matches.
12. Stop the web server, tap Mark watched: it rolls back with the error toast.
13. Turn on VoiceOver: pills read their state, the toast is announced, the score sheet is reachable.
