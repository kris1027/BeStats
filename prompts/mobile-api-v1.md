# Mobile API v1 thickened (feature 28, spec 0033 Build plan step 4)

## Goal

Grow `/api/v1` from the tracer's four routes to the whole surface in spec 0035, so the app (step 5) can browse, search, track and show every library page with the web's exact rules. Every web write splits into a command that the Server Action and the v1 route both call. This step satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9** and **AC-10** (API half), and lands the image helper settled in spec 0035 on 2026-11-19.

No app screens are built here (step 5). The one mobile change is the movie screen calling the new image helper.

## Inspected code

- Spec 0033 `index.md` (Requirements, Build plan) and child 0035 (API surface, Undo, Images, Caching, Rate limits, Value sourcing, Critical test scenarios).
- The tracer: `apps/web/lib/api/v1/with-v1.ts` (+ its test, including the scan that fails on a handler not built with `withV1`), `app/api/v1/{config,movies/[id],me/titles,me/movies/[id]/watched}/route.ts`, `app/api/v1/routes.test.ts`, `lib/supabase/bearer.ts`, `lib/api/v1/log.ts`.
- Commands: `lib/tracking/commands/{run,movie,set-movie-watched,read-movie-titles}.ts`; `lib/tracking/write.ts` (`withCookieSession`, `runTrackingWrite`).
- Server Actions: `app/movies/actions.ts` (5, one already a command), `app/shows/actions.ts` (8, with its own local `runTrackingWrite`), `app/games/actions.ts` (5), `app/(auth)/actions.ts` (`claimUsername`, private), `app/account/actions.ts` (`changeUsernameAction`).
- Loaders: `lib/tmdb/load-movie.ts` (moved in the tracer); `app/shows/[id]/load-show.ts`, `app/shows/[id]/season/[number]/load-season.ts`, `app/games/[id]/load-game.ts` (still in `app/`).
- Reads: `lib/search/{read,game-read,lists}.ts`, `packages/core/src/search/params.ts`, `packages/core/src/catalog/{lists,game-lists,library-list}.ts`, `lib/tracking/{library-lists,game-library,show-grid-status,movie-state,game-state}.ts`, `lib/tmdb/genres.ts`, `lib/auth/profile.ts`.
- Core contracts: `packages/core/src/api/v1/{version,errors,config,movie,titles}.ts`.
- Images: `lib/tmdb/{images,image-loader,constants}.ts`, `lib/images/{loader,igdb-loader}.ts` and tests, `packages/core/src/igdb/constants.ts`; `apps/mobile/src/app/movies/[id].tsx`.
- `docs/deploy.md` section on the Vercel Firewall, and `security-boundary.test.ts`.

## Skills used

`supabase` (bearer client, RLS in the cross user check), `next-dev-loop` (routes in the running app), `vitest`. `supabase-postgres-best-practices` is not needed: this step has no schema change.

## Decisions and assumptions

1. **Four slices, in this order, each green on its own.** Small conventional commits inside each.
   - **4a. Movies and images**: `imageUrlForWidth` in core with the web loaders as wrappers, the mobile movie screen using it; the four remaining movie commands (`setMovieWatchlist`, `setMovieRating`, `restoreMovieWatchlist`, `restoreMovieWatched`) and their routes; the `ClearedState` union in core with its movie members.
   - **4b. Shows**: `loadShow` and `loadSeason` move to `lib/tmdb/` (`git mv` with tests); the eight show commands (episode watched, rating, undo mark; season watched, undo; track, untrack, restore); `GET /shows/{id}`, `GET /shows/{id}/seasons/{n}`, `GET /me/shows/{id}/seasons/{n}` and the write and restore routes; `/me/titles` accepts `tv:` keys. The local `runTrackingWrite` in `app/shows/actions.ts` is deleted.
   - **4c. Games and profile**: `loadGame` moves to `lib/igdb/`; the five game commands and routes; `/me/titles` accepts `game:` keys; `GET` and `PUT /me/profile` with `claimUsername` and the change username command moved out of the actions.
   - **4d. Browse and library**: `/genres`, `/search`, `/lists/{type}/{list}`, `/me/library`; the per route cache header test over every route; the cross user HTTP check; the firewall note in `docs/deploy.md`.
2. **Response shapes mirror the shared normalized types**, as the tracer's `v1MovieSchema` does: show, season and game detail schemas list the fields of the core types the web pages already render (no new catalog field, no invented data). Image fields are full URLs or null (spec 0035, Images).
3. **Library loaders take deps.** `getShowLibraryTab`, `getMovieLibraryTab`, `getWatchedMoviesPage`, `readCountedPage` and the game library reads create the cookie client inside today. They gain a `{ userId, supabase }` parameter; the web pages pass the cookie pair, `/me/library` the bearer pair. Their React `cache()` wrapping stays on the web side only. Placement code does not change.
4. **`/me/titles` for TV** returns `{ tracked, progress, seasonRatings, showRating }` from the core `progress.ts` and `ratings.ts` over the cached show details read, full precision (spec 0035 Value sourcing). It stays capped at 40 keys.
5. **`/me/account/delete` is not in this step.** The spec's Build plan puts account deletion and its migration in step 5.
6. **Cross user proof runs on the local stack.** Mocked bearer tests cannot prove RLS. A new opt in suite, `app/api/v1/cross-user.local.ts` with its own `vitest.api-local.mts` and a `pnpm api:local` script (the `tmdb:live` pattern), signs in two seeded users against local Supabase, calls the route handlers with each token, and asserts user B can neither read nor change user A's rows, plus 401 for no token, an expired token and the publishable key. It is not part of `pnpm test`, since it needs Docker.
7. **No new dependency.**

## Decided at approval (2026-11-19)

- **Two PRs for step 4** (changed mid build on 2026-11-19): 4a and 4b on `feat/mobile-api`, then 4c and 4d on `feat/mobile-api-games-browse`, branched from the first; small commits in each.
- **Rate limits: widen the one rule.** Hobby allows one rate limit rule and `/api/search` holds it, so `docs/deploy.md` records that rule widened to `/api/search` and `/api/v1/*` with one shared per IP limit. Changing the dashboard rule is a step you take (or approve) at deploy time. Spec 0035's Rate limits table still names three rules, so it owes a short `/architect` update.

## Expected files

- Core: `packages/core/src/images/{image-url,image-url.test}.ts` (helper plus the moved loader tests), `TMDB_IMAGE_BASE` and `TMDB_IMAGE_WIDTHS` moved into core; `packages/core/src/api/v1/{cleared,show,season,game,profile,search,lists,genres,library}.ts` with tests; `titles.ts` widened.
- Web commands: `apps/web/lib/tracking/commands/{movie-*,episode-*,season-*,show-tracking,game-*}.ts` (exact file split follows the movie precedent), `lib/auth/commands/username.ts`, each with a test.
- Web actions rewired: `app/movies/actions.ts`, `app/shows/actions.ts`, `app/games/actions.ts`, `app/(auth)/actions.ts`, `app/account/actions.ts`.
- Loaders moved: `lib/tmdb/load-show.ts`, `lib/tmdb/load-season.ts`, `lib/igdb/load-game.ts`.
- Routes under `app/api/v1/`: `genres`, `search`, `lists/[type]/[list]`, `shows/[id]`, `shows/[id]/seasons/[n]`, `games/[id]`, `me/profile`, `me/library`, `me/shows/[id]/seasons/[n]` (GET), `me/movies/[id]/{watchlist,rating,watchlist/restore,watched/restore}`, `me/episodes/[episodeId]{,/restore}`, `me/shows/[id]/seasons/[n]/watched{,/restore}`, `me/shows/[id]/tracking{,/restore}`, `me/games/[id]{,/restore}`, with route tests split per resource.
- `apps/web/lib/images/loader.ts`, `lib/tmdb/image-loader.ts`, `lib/images/igdb-loader.ts` as thin wrappers; `apps/mobile/src/app/movies/[id].tsx` sizing its two images.
- `apps/web/app/api/v1/cross-user.local.ts`, `apps/web/vitest.api-local.mts`, scripts in both `package.json` files.
- Docs: `docs/deploy.md` (firewall), `apps/web/lib/tracking/AGENTS.md` "Split so far" line, spec 0033 Build plan tick, scope milestone tick.

## Requirements

- Each write route calls the same command as its Server Action and returns the same result union; the web actions behave exactly as before (AC-5).
- The release gate refuses watching or scoring a movie, and Playing, Finished or a score on a game, before release day (UTC) with 409 `not_released`, and never gates a removal (AC-6).
- Every write with a web Undo returns its `cleared` state; each `…/restore` route takes `{ cleared }`, refuses a `kind` of another route with 400, and restores only the caller's rows (AC-7).
- Public routes answer `public, s-maxage=…` (60 for shows, seasons and config, 86400 for genres, 300 otherwise), errors and 426 `no-store`, every `me` route `private, no-store` (AC-8).
- No token, an expired token or the publishable key answers 401; user B's token reads and changes nothing of user A's (AC-9).
- `/me/library` accepts only a type and path pair `libraryPageAt` resolves and answers 404 otherwise; entries come in the web's order with `card: null` when the catalog read fails (AC-10).
- `imageUrlForWidth` matches today's web loader output on every ladder rung, never upsizes, and leaves unknown URLs alone (spec 0035, Images).

## Security considerations

- The user ID always comes from the verified `sub` claim; no route takes a user ID, page key, date or release flag from the client.
- Restore bodies are user owned data parsed by the `ClearedState` schema and written through RLS, so a forged one can only touch the caller's own rows.
- No route reads a secret outside `lib/tmdb/env.ts` and `lib/igdb/env.ts`; `security-boundary.test.ts` keeps proving it.
- `me` answers never reach a shared cache; logs never carry the token or bodies (the existing `withV1` log test).
- Moving loaders and commands into `lib/` keeps `server-only` on each moved file.

## Acceptance criteria

- AC-5, AC-6, AC-7, AC-8, AC-9 and the API half of AC-10 pass as written in spec 0033.
- Every new handler is exported through `withV1` (the existing scan test).
- Every response body in the route tests parses with its core schema.
- The web's movie, show, game and account pages behave exactly as before (existing tests stay green, and a manual pass below).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` after every slice; `pnpm api:local` (local stack) in slice 4d; `pnpm test:db` once at the end (`supabase db reset` first, per the clean seed rule). No schema change, so no migration and no `db:types` change.

## Manual test steps

1. `orb start`, `pnpm exec supabase start`, then `pnpm dev:docker`.
2. With header `X-BeStats-App-Version: 1.0.0`: `curl -i localhost:3000/api/v1/shows/1399` → 200 and `s-maxage=60`; `/api/v1/games/1942` → 200; `/api/v1/search?type=movie&q=matrix` → results; `/api/v1/lists/movie/popular` → a page; `/api/v1/genres?type=tv` → genres.
3. Sign in a seeded user with `supabase.auth.signInWithPassword` (a one line Node script) and copy the access token. With `Authorization: Bearer …`: `PUT /api/v1/me/movies/603/watchlist {"planned":true}` → ok; `GET /api/v1/me/library?type=movie&path=/watchlist` → 603 listed; `/me/library?type=tv&path=/playing` → 404.
4. `PUT /api/v1/me/movies/603/watched {"watched":true}`, then `{"watched":false}` → `cleared`; post it to `/watched/restore` → mark and score back. Post it to `/watchlist/restore` → 400.
5. Mark season 1 of 1399 watched through `PUT /me/shows/1399/seasons/1/watched` → `/me/titles?ids=tv:1399` shows progress; restore with the returned `cleared` → back to before.
6. `PUT /me/games/{an unreleased game}` with `Playing` → 409 `not_released`; with `Want to play` → ok.
7. On the web signed in as the same user, open `/movies/603`, `/shows/1399` and the library pages: they match what the API wrote, and every web toggle and Undo still works.
8. In the iOS Simulator, open a movie in the app: poster and backdrop load at the smaller size (check the URL in the Metro log or network inspector).

## Not in this step

App screens, Undo toasts, the offline cache, account deletion (API and migration), deep links and the release (steps 5 and 6).
