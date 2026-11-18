# Mobile tracer: sign in, open a movie, mark it watched (feature 28, spec 0033 Build plan step 3)

## Goal

Run one thin thread through every layer of the mobile stack: a signed in user opens a movie in the Expo app and marks it watched, through a new `/api/v1` on the web project, with the release gate on the server. This is step 3 of spec 0033 and satisfies **AC-4**, **AC-5**, **AC-6** (movies) and **AC-11**. It also proves the two risky assumptions the spec names: a `use cache` catalog read works from a Route Handler, and a `postgres` owned security definer function can delete from `auth.users`.

Steps 1 and 2 (monorepo move, shared core) are merged. Nothing from step 4 onward lands here, apart from the one small read in decision 6.

## Inspected code

- Spec 0033 `index.md`, child 0035 (API v1) and child 0036 (mobile auth and deletion). Child 0034 is already built.
- `apps/web/lib/tracking/write.ts`: `runTrackingWrite` mixes the cookie session (`getOptionalUser`), the cookie client and `refresh()` with the write itself. This is the split the spec asks for.
- `apps/web/app/movies/actions.ts`: `setMovieWatched` runs Zod parse, session, TMDB check plus release gate (`checkTmdb` through `loadMovie`), then `mark_movie_watched` or `unmark_movie_watched`, and returns `MovieTrackingResult` with `cleared` on unmark.
- `apps/web/app/movies/[id]/load-movie.ts`: the movie lookup the command needs; the spec moves it into `lib/`.
- `apps/web/app/api/search/route.ts`: the existing Route Handler pattern (cache header constant, `no-store` on errors, `proxy.ts` skips `api/`).
- `apps/web/lib/supabase/server.ts`, `lib/auth/user.ts` (`getClaims` verification), `lib/env.ts` (`getPublicEnv`).
- `apps/web/lib/tracking/movie-state.ts` (`getMovieTracking`), `log.ts`, `supabase-error.ts`.
- `packages/core/src/tracking/{schemas,types,messages}.ts`, `tv/air-status.ts` (`todayUtc`), `catalog/movie-page.ts` (`isMovieReleased`). There is no semver helper and no `api/` folder in core yet.
- `supabase/schemas/05-functions.sql` (`username_available`, the one security definer function today) and `supabase/tests/`.
- Tooling on this Mac, checked 2026-11-18: Node 24, Xcode 27.2, EAS CLI installed but not logged in, no Android SDK and no `adb`.
- Current versions, checked 2026-11-18: Expo SDK 58.0.26, React Native 0.88.1 (needs React `^19.3.0`), Expo Router 58.0.32, NativeWind `5.0.0-rc.1` (still a release candidate; `latest` is 4.2.7), Uniwind 1.14.0.

## Skills used

`expo-router`, `expo-dev-client`, `expo-design-system`, `vercel-react-native-skills`, `react-native-best-practices`, `tanstack-query`, `react-native-testing` (from the spec's Implementation skills), `supabase` and `supabase-postgres-best-practices` (bearer client, pgTAP proof), `next-dev-loop` (the `use cache` from a Route Handler check). I read each one's `SKILL.md` before writing the code it governs.

## Decisions and assumptions

1. **Command split, movies watched only.** New `apps/web/lib/tracking/commands/set-movie-watched.ts` (`server-only`): `(deps: { supabase, userId }, input) => Promise<MovieTrackingResult>`. It holds the TMDB check, the release gate and the write. `runTrackingWrite` splits into a framework free runner (takes `deps`, no cookies, no `refresh()`) and the action wrapper (cookie session and client, then `refresh()` on ok). The web's `setMovieWatched` action calls the command; its behavior stays exactly the same. The other movie, show and game actions keep using the old path until step 4 splits them (the spec's order), so only the shared runner changes shape for them, not their behavior.
2. **`loadMovie` moves** from `app/movies/[id]/load-movie.ts` to `apps/web/lib/tmdb/load-movie.ts` (with `git mv` and its test), since a command in `lib/` now needs it. The page imports it from there.
3. **Bearer auth** in `apps/web/lib/supabase/bearer.ts` exactly as child 0035 says: `@supabase/supabase-js` `createClient` with the publishable key, the bearer token in `global.headers.Authorization`, no session persistence, `getClaims(jwt)`, `role` must be `authenticated`, user ID from `sub`.
4. **`withV1`** in `apps/web/lib/api/v1/with-v1.ts`: version header check (400 missing or malformed, 426 below `MIN_APP_VERSION` with `no-store`, `/config` exempt), bearer auth for `me` routes, Zod parse, `{ error: { code, message } }`, cache headers, and logging that never touches the `Authorization` header, token or body. A test walks `app/api/v1/**/route.ts` and fails when a handler is not exported through `withV1`.
5. **Three routes**: `GET /api/v1/config`, `GET /api/v1/movies/{id}`, `PUT /api/v1/me/movies/{id}/watched`. Schemas live in `packages/core/src/api/v1/` (`errors.ts`, `config.ts`, `movie.ts`, `version.ts` with `MIN_APP_VERSION = "1.0.0"` and `compareSemver`). Result to status mapping: ok 200, `invalid_input` 400, `session_expired` 401, `not_found` 404, `not_released` 409, `tmdb_unavailable` 502, `write_failed` 500.
6. **One small read pulled forward (needs your yes).** The movie screen must show whether the movie is already watched, or the button would claim a state it doesn't know (AGENTS.md section 11, no false state). `/me/titles` belongs to step 4. I recommend shipping a movie only slice of it now: `GET /api/v1/me/titles?ids=movie:603` returning `{ "movie:603": { planned, watchedAt, rating } }` for movie keys, through `getMovieTracking`, with show and game keys answering 400 until step 4 adds them. The alternative is no read and a button that starts from "unknown", which I don't recommend.
7. **The app** in `apps/mobile` (`@bestats/mobile`), scaffolded with `create-expo-app` on SDK 58 and Expo Router. Screens for the tracer: Sign in, a movie screen at `/movies/[id]` (poster, title, release date, TMDB rating labelled as TMDB, the Watched toggle with a visible error and the Undo toast for an unmark), and a minimal home with a field to open a movie by ID (catalog browsing is step 5). Styled after the shipped movie page in the glass system, with tokens from `@bestats/core/tokens.generated`.
8. **Session store** per child 0036: `supabase-js` with an AES encrypted session in AsyncStorage and its random key in `expo-secure-store`; `AppState` drives `startAutoRefresh` and `stopAutoRefresh`; one `getAccessToken()`; on a 401, retry once after `getSession()`, then sign out with "Your session expired, sign in again".
9. **Data layer**: TanStack Query v5 for the movie read, the titles read and the watched mutation (optimistic, reverts on error). The persisted offline cache is step 5; the tracer keeps the cache in memory only, so no private data is written to disk yet.
10. **React versions.** React Native 0.88 needs React 19.3, the web stays on 19.2.8. `apps/mobile` pins its own `react` and `@types/react`; core imports no React, so the two never meet. I'll check that the hoisted `@types/react` at the root doesn't break either typecheck, and pin the mobile copy locally if it does.
11. **Styling: NativeWind v5 first, Uniwind as fallback**, as the spec decides. `5.0.0-rc.1` is pinned exactly. If it fails to build or render on the simulator, I stop and tell you before switching to Uniwind, since the spec says the weakened token story is a known cost.
12. **Metro in the monorepo**: `metro.config.js` watches the workspace root and resolves `@bestats/core` TypeScript source; `.npmrc` or `node-linker` changes only if Expo's monorepo guide requires them for pnpm.
13. **Mobile tests**: `jest-expo` plus React Native Testing Library for the movie screen's toggle states and the 401 retry. Root `pnpm test` already runs every package.
14. **pgTAP proof only, no migration.** `supabase/tests/200-delete-own-account-proof.test.sql` creates a `postgres` owned security definer function inside the test transaction, calls it as a seeded user, and asserts the `auth.users` row and the cascaded rows are gone. Everything rolls back. The real `delete_own_account()` migration ships in step 5.
15. **Biome** lints `apps/mobile` like the rest of the repo (no ESLint, even though `create-expo-app` adds one; I remove it).
16. **Env**: `apps/mobile/.env.example` with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY`, read only through `apps/mobile/lib/env.ts`. `security-boundary.test.ts` gains the `EXPO_PUBLIC_` prefix check for the TMDB, IGDB and service role names (AC-3).
17. **Branch and commits**: `feat/mobile-tracer` off `main`, small conventional commits that each build: core v1 schemas; runner split and command; bearer and `withV1`; the routes and their tests; the pgTAP proof; the Expo scaffold; session store; screens; docs.

## Expected files

- Core: `packages/core/src/api/v1/{errors,config,movie,titles,version}.ts` with tests.
- Web: `apps/web/lib/tracking/commands/set-movie-watched.ts` (+ test), `apps/web/lib/tracking/write.ts` (split), `apps/web/app/movies/actions.ts` (calls the command), `apps/web/lib/tmdb/load-movie.ts` (moved, + test), `apps/web/app/movies/[id]/page.tsx` (import), `apps/web/lib/supabase/bearer.ts` (+ test), `apps/web/lib/api/v1/with-v1.ts` (+ test), `apps/web/app/api/v1/config/route.ts`, `apps/web/app/api/v1/movies/[id]/route.ts`, `apps/web/app/api/v1/me/movies/[id]/watched/route.ts`, `apps/web/app/api/v1/me/titles/route.ts`, route tests, the `withV1` coverage test, `security-boundary.test.ts`.
- Database: `supabase/tests/200-delete-own-account-proof.test.sql`.
- Mobile: `apps/mobile/` (`package.json`, `app.json`, `metro.config.js`, `tsconfig.json`, `babel` and NativeWind config, `global.css`, `app/_layout.tsx`, `app/index.tsx`, `app/sign-in.tsx`, `app/movies/[id].tsx`, `lib/{env,supabase,session-storage,api,query}.ts`, `components/*`, tests, `.env.example`).
- Root: `pnpm-lock.yaml`, `biome.json` (mobile globs), `pnpm-workspace.yaml` (only if a native build needs `allowBuilds`).
- Docs: `docs/scope/scope.md` (tracer milestone tick), the spec 0033 Build plan task tick. `apps/mobile/AGENTS.md` and root AGENTS.md changes are left for `/sync`.

## Requirements

- AC-4: every v1 handler goes through `withV1`; 400 without a valid version header, 426 below `MIN_APP_VERSION`, `/config` exempt; bearer auth on `me` routes with the user ID from `sub`; core Zod parsing; `{ error: { code, message } }`.
- AC-5: `PUT /api/v1/me/movies/{id}/watched` calls the same command as `setMovieWatched` and returns the same result union; the web action behaves exactly as before.
- AC-6 (movies): `watched: true` before release day (UTC) answers 409 `not_released` and writes nothing; `watched: false` is never gated.
- AC-11: the app signs in with email and password, stores the session encrypted at rest with its key in `expo-secure-store`, refreshes only through `supabase-js`, and signs out with a visible notice on a second 401.
- Proof: a `use cache` catalog read returns real data from a Route Handler under `cacheComponents`; a `postgres` owned security definer function can delete from `auth.users`.

## Security considerations

- No secret moves: the TMDB token stays read only in `lib/tmdb/env.ts`; the app gets only public Supabase values and the API base URL.
- The user ID comes only from the verified `sub` claim; RLS still applies because the bearer client uses the publishable key with the user's token.
- The publishable key used as a bearer token is refused (`role` is `anon`).
- `me` routes answer `private, no-store`; public routes `public, s-maxage=…`; errors and 426 `no-store`.
- Logs never carry the `Authorization` header, the token or a request body; a test asserts it.
- The pgTAP proof creates nothing that survives the test transaction.
- The tracer keeps no private data on disk apart from the encrypted session.

## Acceptance criteria

1. `GET /api/v1/config` answers `{ minAppVersion: "1.0.0", apiVersion: 1 }` without a version header.
2. `GET /api/v1/movies/603` with `X-BeStats-App-Version: 1.0.0` answers the movie with `s-maxage`; without the header 400; with `0.9.0` 426 and `no-store`; an unknown ID 404.
3. `PUT /api/v1/me/movies/603/watched` with a valid token answers `{ ok: true }` and the web movie page shows the mark after reload; no token, a garbage token or the publishable key answers 401; every answer carries `private, no-store`.
4. The same PUT on a movie released after today (UTC) answers 409 `not_released` and writes nothing; `watched: false` on it succeeds.
5. Unmarking returns `cleared` with the earlier date and score, exactly as the Server Action does.
6. The web's watched toggle works exactly as before (manual check plus the existing tests).
7. In the iOS Simulator: sign in, open movie 603, see its current watched state, mark it watched, see it on the web; kill and reopen the app and stay signed in.
8. The pgTAP proof passes.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (core, web and mobile), `pnpm build`, `pnpm test:db` after `supabase db reset` (memory: a clean seed is needed). Targeted tests: `withV1` (version, auth, errors, headers, no token in logs, every handler wrapped), `bearer.ts` (no header, malformed, anon role, valid), the command (released, unreleased, not found, TMDB down, unmark returns cleared), each route's response parsed by its core schema, the mobile movie screen and 401 retry.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`, then `pnpm dev:docker` for the web on the local stack.
2. `curl -i http://localhost:3000/api/v1/config` → 200 with the config body.
3. `curl -i -H "X-BeStats-App-Version: 1.0.0" http://localhost:3000/api/v1/movies/603` → 200, `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Repeat without the header → 400; with `0.9.0` → 426.
4. In `apps/mobile`, copy `.env.example` to `.env.local` with the local Supabase URL and key and `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`, then run `pnpm --filter @bestats/mobile ios` (a local development build in the iOS Simulator).
5. Sign in with a seeded test user, type `603`, open it, tap Watched → the toggle turns on.
6. Open `http://localhost:3000/movies/603` signed in as the same user → it shows watched.
7. Tap Watched again → the mark goes and an Undo toast shows; tap Undo is step 4, so the tracer toast shows only the message.
8. Open an unreleased movie and tap Watched → the "not released" message shows and nothing is written.
9. Kill the app and reopen → still signed in.

## Not in this step (and blocked items)

- EAS development builds on a real iPhone and Android phone (named in spec step 3) need an Expo account login, and for iOS an Apple Developer Program membership; this Mac has no Android SDK. I'll run the local iOS Simulator build and report the real device builds as blocked until you set those up.
- Every other route, the restore routes, the offline cache, Undo restore, account deletion, deep links and the store release stay in steps 4 to 6.
