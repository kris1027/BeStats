# Mobile: the movie screen hangs after a forced sign out

## Goal

Fix the bug found in simulator step 7 (prompts/mobile-tracer-review-fixes.md). After the app signs the user out because their session expired, the open movie screen spins forever, and the "Your session expired, sign in again." notice only shows once the user taps Back. The screen must recover on its own: it should keep showing the movie, with "Sign in to track" in place of the controls.

## Inspected code

- `apps/mobile/src/lib/session.tsx`: a forced sign out calls `queryClient.clear()` twice.
  - The expired-session handler runs `signOut({ scope: "local" })` and then `queryClient.clear()`.
  - `signOut` fires `onAuthStateChange(null)`, which calls `queryClient.clear()` again.
  - A user-chosen `signOut()` also clears twice: once in the listener, once itself.
- `apps/mobile/src/lib/movies.ts`: the private query keys start with `"me"` (`["me", "titles", ...]`), and the catalog keys start with `"catalog"`. `apps/mobile/AGENTS.md` says the `"me"` prefix exists "so they can be cleared together".
- `apps/mobile/src/app/movies/[id].tsx`: the movie query is public and enabled whatever the session.
- TanStack Query v5 `clear()` removes every query and cancels any fetch in flight.

## Reproduction (done, test since reverted)

A movie-screen test with a reactive session mock:

1. Load movie 603.
2. Set the session to null and `clear()`. The screen starts reloading the movie, so `fetchMovie` is called a second time.
3. `clear()` again while that reload is in flight.

The screen stays on "Loading the movie" with no further fetch, matching the simulator. With a single `clear()`, the screen recovers.

Root cause: the second `clear()` cancels the in-flight catalog reload of a query the mounted screen is still observing, and nothing starts it again. The catalog query never needed wiping: it holds no private data.

## Skills used

`tanstack-query` (`removeQueries` vs `clear`, cancellation on removal), `react-native-testing`.

## Decisions

1. **Wipe only private data on sign out.**
   - A new `clearPrivateQueries()` in `apps/mobile/src/lib/query-client.ts` calls `queryClient.removeQueries({ queryKey: ["me"] })` and `queryClient.getMutationCache().clear()`. Mutations can carry private input.
   - The public catalog cache stays, so the open screen keeps its movie and only the private state goes. That still meets AC-13 ("no private data stays on the phone"), since every private key starts with `"me"` (`apps/mobile/AGENTS.md`).
2. **One place clears.**
   - The `onAuthStateChange(null)` listener is the single caller for every sign out path.
   - The expired-session handler and `signOut()` keep calling it only after a local sign out fails, since the listener would not fire then. Calling it twice is harmless anyway, because it never touches a query the open screen still observes.
3. **The notice stays on the sign-in screen,** as today. The movie screen already shows "Sign in to track" once the session is null, which leads there. No navigation is forced, so this changes no UI.

## Expected files

- `apps/mobile/src/lib/query-client.ts` (+ a new `query-client.test.ts`).
- `apps/mobile/src/lib/session.tsx`.
- `apps/mobile/src/__tests__/movie-screen.test.tsx`: the reactive session mock and the regression test.
- `apps/mobile/AGENTS.md`: one line on the sign-out wipe.

## Requirements and acceptance criteria

1. **The screen recovers after a sign out with a reload in flight.** After a forced sign out (session null, cache wiped, and a second wipe while the movie reloads), the movie screen shows the movie and "Sign in to track" (regression test).
2. **Only private data is wiped.** `clearPrivateQueries()` removes every `"me"` query and every mutation, and keeps `"catalog"` queries (unit test).
3. **No private state is shown after sign out.** The tracking state query is gone, so nothing private renders.

## Security considerations

The private cache is still wiped on every sign out, so nothing the next person could read stays in memory. Only public TMDB data, which any visitor can fetch, is kept.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. No web or database change, so no `pnpm build` or `pnpm test:db`.

## Manual test steps

1. Run `pnpm dev:docker`, then `npx expo start --dev-client` in `apps/mobile`.
2. In the iOS Simulator, sign in as the seed user and open movie 603.
3. Revoke the user's sessions (`POST /auth/v1/logout?scope=global` on the local stack) and wait for the 10-minute token to expire.
4. Tap Watched. The screen keeps the movie and shows "Sign in to track". Tapping it shows "Your session expired, sign in again."
