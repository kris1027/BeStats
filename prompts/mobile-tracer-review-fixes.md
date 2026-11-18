# Mobile tracer review fixes (feature 28, spec 0033 step 3 follow-up)

## Goal

Fix the findings from the two-axis review of `feat/mobile-tracer` against `main` (2026-11-18) before the branch goes to a PR:

- **Standards, hard:** the mobile app writes its own copy instead of taking it from core, and some exported functions have JSDoc without a reason or without an AGENTS.md section.
- **Spec (a)1:** after unmarking a movie, the app shows a message only when a score was cleared. Investigated below: the app is already right, so only a test is added.
- **Spec (a)2:** `withV1` logs only 5xx failures, with a bare `console.warn`.
- **Spec (a)3:** each v1 handler parses its own input, so `withV1` doesn't enforce parsing.
- **Spec (c)3:** the 401 retry can resend the token the server just refused.

Out of scope, on purpose: the image contract (already queued in `docs/scope/scope.md` before the API step), the `reason` field, the AGENTS.md edits already on the branch, the skills lock entry, and the judgement-call smells (`TrackingDeps` duplication, `runMovieWrite` middle man, `runMovieCommand`'s six arguments, `toV1Movie`, `bearer.ts` importing `TrackingClient`).

## Inspected code

- `apps/mobile/src/app/movies/[id].tsx`. Hardcoded copy at lines 88, 101, 117, 120 and 205. The unmark notice at lines 91-95 shows only when `cleared.rating !== null`.
- `apps/mobile/src/lib/api.ts`:
  - `OFFLINE_MESSAGE`, `SESSION_EXPIRED_MESSAGE` and two "Something went wrong." strings.
  - The retry at lines 72-79 calls `send()` again, which calls `getAccessToken()` → `getSession()` again.
- `apps/mobile/src/lib/supabase.ts`: `getAccessToken()` says the app never calls `refreshSession()`.
- `apps/mobile/src/app/sign-in.tsx:39`: the fallback "Check your details.".
- `apps/mobile/src/lib/session.tsx`, `src/theme/token-vars.ts`: JSDoc with no section.
- `apps/web/lib/api/v1/with-v1.ts`:
  - `v1Ok` and `v1Fail` have bare JSDoc.
  - `toResponse` logs only status ≥ 500 through `logV1Failure`.
  - Step 3 of the wrapper says "the handler parses its own inputs".
- The four routes under `apps/web/app/api/v1/`: three parse with `safeParse` inside the handler, and `config` reads nothing.
- `apps/web/lib/auth/log.ts` (`logAuthEvent`, `AUTH_EVENT`) and `apps/web/lib/tracking/log.ts` (`logTrackingEvent`). Both are structural: an event plus an outcome, nothing else. The movie command already logs its refusals through `logTrackingEvent` in `commands/run.ts`.
- `apps/web/lib/tracking/commands/movie.ts`: `readCleared` and `runMovieCommand` cite specs but no AGENTS.md section.
- `packages/core/src/api/v1/{errors,movie,titles}.ts`. `V1_ERROR_MESSAGES` already holds "Your session expired, sign in again." and "Something went wrong. Try again.". `movieTitleKey` and `movieErrorFromReason` cite no section.
- `packages/core/src/tracking/messages.ts`:
  - `TRACKING_MESSAGES.write_failed` and `TRACKING_READ_FAILED` already hold the two strings the screen repeats.
  - `MOVIE_CLEARED_MESSAGES` says "Unmarking a movie with no score removes nothing else, so it shows no toast."
- `packages/core/src/auth/messages.ts`: `AUTH_MESSAGES[AUTH_OUTCOME.invalidInput]`.
- Web `movie-tracking-controls.test.tsx`: the toast only shows when unmarking a scored movie, which matches core.
- Spec 0035 lines 19, 29 and 31 (`withV1` parses inputs and logs through the existing helpers), and spec 0036 lines 19, 20 and 73 (the 401 retry and the two-401s-at-once case).
- `apps/mobile/AGENTS.md:55` and `:65`.

## Skills used

- `supabase`: the `refreshSession()` and `getSession()` lock behaviour in supabase-js.
- `vitest`: web and core tests.
- `react-native-testing`: the mobile screen test.
- `tanstack-query`: the optimistic mutation stays as it is.

## Decisions and assumptions

1. **Unmark message: no behaviour change.** Core's `MOVIE_CLEARED_MESSAGES` and the web controls both show nothing when unmarking a movie with no score. The tracer plan's step 97 ("an Undo toast shows") was loose wording, so the app is right and the reviewer's (a)1 finding is not a defect. I add a mobile test that pins both cases: no notice without a score, "Score removed too." with one.
2. **Mobile copy comes from core.** The movie screen, `api.ts` and sign-in import their copy; the app keeps no message strings of its own.
   - Save failure → `TRACKING_MESSAGES.write_failed`.
   - Tracking read failure → `TRACKING_READ_FAILED`.
   - Session expired → `V1_ERROR_MESSAGES.unauthenticated`. `SESSION_EXPIRED_MESSAGE` is deleted and its callers import from core.
   - Unreadable answer → `V1_ERROR_MESSAGES.internal`. The text changes from "Something went wrong." to "Something went wrong. Try again.".
   - Offline → a new `V1_NETWORK_MESSAGE` in `packages/core/src/api/v1/errors.ts`, beside the other v1 copy. It is the only new string.
   - Movie load errors: the screen shows the `ApiError` message the server sent (server copy from core). An invalid route id and a non-`ApiError` fall back to `V1_ERROR_MESSAGES.not_found` and `.internal`. The screen's three bespoke lines go, and "We couldn't find this movie." becomes "We couldn't find that."
   - Sign-in fallback → `AUTH_MESSAGES[AUTH_OUTCOME.invalidInput]`.
   - Button labels ("Mark watched", "Sign in to track", "Retry") reuse an existing core constant where one exists (`SIGN_IN_ACTION_LABEL`), and no new label constants are added. The rule names message files, and the review flagged messages.
   - The internal `Error` in `movies.ts:28` is never shown, so it stays.
3. **JSDoc.** Each flagged export gets a reason and the governing AGENTS.md section:
   - `v1Ok`, `v1Fail`: section 11, a closed error shape.
   - `movieTitleKey`: section 8, catalog identity.
   - `movieErrorFromReason`: section 11, and the app branches on a code. It stays as a contract helper, because step 4's Undo routes use it.
   - `appVersion`: section 5, `/api/v1` only.
   - `tokenColor`: section 3, colour tokens.
   - `useSession`: section 11.
   - `readCleared`, `runMovieCommand`: section 7, movie rules.
4. **`withV1` parses inputs.** Options gain an optional `input: { params?, query?, body? }` of core Zod schemas.
   - `withV1` parses each after the version and bearer checks, answers 400 `invalid_input` on any failure, and passes typed `input` to the handler. The handler types come from the schemas through generics, so a handler cannot read an unparsed value.
   - The body is read with `request.json().catch(() => null)`. The query is read from `Object.fromEntries(searchParams)`.
   - The three routes drop their own `safeParse`. `/me/titles` uses `z.object({ ids: titleIdsParamSchema })`.
   - The JSDoc step 3 of `withV1` is updated.
5. **Logging through the existing helpers, for every failure.**
   - A refused bearer token logs `logAuthEvent(AUTH_EVENT.bearer, "refused", "unauthenticated")`, with a new `bearer: "auth.bearer"` event. The outcome value is checked against `AuthOutcome` during the build, and the closest existing outcome is used.
   - Tracking refusals are already logged by the command through `logTrackingEvent`.
   - Every other failure, 4xx included (version 400 and 426, input 400, 404, 409, 5xx), logs through `logV1Failure`. It moves to `apps/web/lib/api/v1/log.ts` and follows the same structural rule as the two existing helpers: a JSON line holding only `{ event: "api_v1.<name>", outcome: code }`, no parameter a header, token, id or body could travel through.
   - A tracking write refusal therefore writes two lines, the command's and the route's, just as the web action and its command would. This is accepted, since neither carries any identity.
6. **401 retry: single-flight refresh** (your choice, 2026-11-18). `apps/mobile/src/lib/supabase.ts` gains `refreshAfterUnauthorized(rejectedToken)`:
   - It reads `getSession()` first. If the session's token already differs from the rejected one (another request refreshed it), it returns that token without refreshing.
   - Otherwise it calls `supabase.auth.refreshSession()` behind one module-level promise, which every concurrent caller awaits. The promise is cleared when settled, and the function returns the new access token or null.
   - `apiRequest` keeps the token each `send()` used. On a 401 it calls `refreshAfterUnauthorized(token)` and retries once with the result. A null, or a second 401, runs `onSessionExpired()` and throws `unauthenticated`.
   - `refreshSession()` is called only here, only after a server 401, and never on a timer.
   - Spec 0036 lines 19-20, `apps/mobile/AGENTS.md:55` and the `getAccessToken()` comment are updated to say the same. This keeps spec 0036 line 73: "Two requests hit 401 at once: one refresh happens, both retry once."
7. **Branch and commits.** Same branch, `feat/mobile-tracer`, in small conventional commits that each build:
   - `feat(core): add the v1 network message`
   - `fix(mobile): take every message from core`
   - `fix(mobile): refresh once after a 401 and retry with the new token`
   - `refactor(api): parse v1 inputs in withV1`
   - `fix(api): log every v1 failure through the structural helpers`
   - `docs: give exported functions their reason and section`
   - `docs(specs): record the 401 refresh rule`

## Expected files

- `packages/core/src/api/v1/errors.ts` (+ test), `packages/core/src/api/v1/{movie,titles}.ts` (JSDoc).
- `apps/mobile/src/app/movies/[id].tsx`, `apps/mobile/src/app/sign-in.tsx`, `apps/mobile/src/lib/{api,supabase,session}.tsx?`, `apps/mobile/src/theme/token-vars.ts`.
- `apps/mobile/src/lib/api.test.ts`, `apps/mobile/src/__tests__/movie-screen.test.tsx`.
- `apps/web/lib/api/v1/with-v1.ts`, new `apps/web/lib/api/v1/log.ts`, `apps/web/lib/api/v1/with-v1.test.ts`.
- `apps/web/lib/auth/log.ts` (`AUTH_EVENT.bearer`).
- `apps/web/app/api/v1/{movies/[id],me/movies/[id]/watched,me/titles}/route.ts`, `apps/web/app/api/v1/routes.test.ts`.
- `apps/web/lib/tracking/commands/movie.ts` (JSDoc).
- `docs/specs/0033-mobile-app-expo/0036-mobile-auth-account-deletion.md`, `apps/mobile/AGENTS.md`.

## Requirements

1. No user-visible string literal remains in `apps/mobile/src` outside tests and accessibility labels that name a title. Every message is imported from `@bestats/core`.
2. Every exported function touched in the flagged files has JSDoc that says why and cites an AGENTS.md section.
3. Every v1 route that reads a path parameter, a query or a body declares its schema in `withV1`, and an unparseable input answers 400 `invalid_input` before the handler runs.
4. Every v1 failure writes exactly one log line from `withV1` (or one auth line for a refused bearer), holding only an event name and an outcome code.
5. On a 401 the app refreshes at most once per rejected token, however many requests failed together, then retries each request once. A second 401 signs out with the session-expired notice.
6. Web behaviour and v1 response bodies are unchanged, apart from the two copy changes in decision 2.

## Security considerations

- Log lines stay structural: the new log module accepts no free text, header, token, id or body. The existing "never log the token, header or body" test is extended to 401 and 400 cases.
- `refreshSession()` runs only after a server 401 and is single-flight, so concurrent refreshes cannot race on rotating refresh tokens. The rejected token is compared in memory only, never logged.
- Parsing moves earlier: it still happens after bearer verification, so an anonymous caller learns nothing new from a 400 compared with a 401.
- The user ID still comes only from the verified `sub` claim. RLS is unchanged.

## Acceptance criteria

1. The movie screen, sign-in and `api.ts` contain no message strings of their own (grep plus review).
2. Unmarking a movie with no score shows no notice; unmarking a scored one shows "Score removed too." (mobile test).
3. `PUT /api/v1/me/movies/abc/watched` and a malformed body answer 400 `invalid_input` without calling the command (route test).
4. A 401, 404 and 426 each log one structural line, and no log contains the token or body (`with-v1.test.ts`).
5. Two concurrent `me` requests that both get 401 cause one `refreshSession()` call and two retries with the new token. A second 401 calls the session-expired handler (`api.test.ts`).
6. A 401 whose token was already rotated by another request retries with the current token and calls no refresh.

## Automated checks

From the repo root:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` (core, web and the mobile jest suite)
- `pnpm build` (server code changes)

There is no database change, so no `pnpm test:db`. The runtime check uses `next-dev-loop` against `pnpm dev:docker`: `curl` the four v1 routes with valid input, invalid input and no token, then read the dev server log lines.

## Manual test steps

1. Run `orb start`, then `pnpm exec supabase start`, then `pnpm dev:docker`.
2. Run `curl -i -H 'X-BeStats-App-Version: 1.0.0' localhost:3000/api/v1/movies/abc`. Expect 400 `invalid_input`, and one `api_v1.movies.get` line in the dev log.
3. Run `curl -i -H 'X-BeStats-App-Version: 1.0.0' localhost:3000/api/v1/me/titles?ids=movie:603` with no token. Expect 401, and one `auth.bearer` line with no token in it.
4. Run `curl -i -X PUT -H 'X-BeStats-App-Version: 1.0.0' -H 'Authorization: Bearer <a valid local token>' -H 'Content-Type: application/json' -d '{"watched":"yes"}' localhost:3000/api/v1/me/movies/603/watched`. Expect 400.
5. In the iOS Simulator, sign in and open movie 603:
   - Mark it watched, then unmark it with no score. No notice shows.
   - Score it on the web, then unmark it in the app. "Score removed too." shows.
6. In the Simulator, turn off the network and tap Watched. The offline message from core shows and the pill reverts.
7. Revoke the session on the server (sign out everywhere from the web) and tap Watched in the app. The app signs out with "Your session expired, sign in again."
