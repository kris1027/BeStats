# 0035. Mobile API v1: catalog reads and tracking writes over HTTP

**Date**: 2026-11-18

## Summary

The phone can't call Server Actions and must never hold the TMDB or IGDB keys, so the web project gets a versioned HTTP API under `/api/v1`. Public catalog routes reuse the existing cached catalog reads and can be cached by Vercel's CDN. Private routes take the user's Supabase access token as a bearer header, check it on the server, and call the same command functions the web's Server Actions call, so the release day gate and every other rule stay on the server.

## Decision

Add Route Handlers under `apps/web/app/api/v1/`, with every request and response schema in `packages/core/src/api/v1/`.

### Shared command layer (how actions and routes share one core)

Today `runTrackingWrite` in `lib/tracking/write.ts` mixes the session, the cookie client and `refresh()` with the write itself. Split it into three layers:

- **Command** (`apps/web/lib/tracking/commands/<name>.ts`, `server-only`): `(deps: { supabase, userId }, input: Parsed) => Promise<Result>`. It does the catalog check and the release gate (moving the TMDB and IGDB lookup from `app/movies/[id]/load-movie.ts` and its game and show twins into `lib/`), the write through RLS, and returns the existing result union. It never reads cookies, headers or the session and never calls `refresh()`.
- **Action wrapper** (the existing Server Action): Zod parse, `getOptionalUser()`, cookie `createClient()`, call the command, then `refresh()` only when the result is ok. Behavior on the web is unchanged.
- **Route wrapper** (`withV1`): version check, bearer auth, Zod parse of path, query and body, call the command, map the result to JSON and a status code, set cache headers.

The catalog reads used by commands are the existing `use cache` reads with `cacheLife`; calling them from a Route Handler under `cacheComponents` is verified in the tracer slice with `next-dev-loop` before the other routes are built.

### `withV1` (one wrapper for every route)

Every handler under `/api/v1` is exported through `withV1({ auth: "public" | "bearer", ... })`; a test fails if a handler is not. It:

1. Reads `X-BeStats-App-Version`. A missing or malformed header (not `major.minor.patch`) answers 400 `invalid_input`; a version below `MIN_APP_VERSION` (core, compared with `compareSemver` from core) answers 426 `upgrade_required` with `Cache-Control: no-store`. `/api/v1/config` is exempt. Public routes do the check but never `Vary` on the header, and a 426 is never cached, so a cached public success is never an upgrade page.
2. For `bearer` routes, builds the user context (below) or answers 401.
3. Parses inputs with the core Zod schemas, answering 400 on failure.
4. Sets `Cache-Control` (Caching, below).
5. Logs failures through the existing log helpers, never logging the `Authorization` header, the token or request bodies (a test asserts it).

### Bearer auth

`apps/web/lib/supabase/bearer.ts` (`server-only`):
- Reads `Authorization: Bearer <jwt>`; anything else is 401.
- Creates a client with `createClient` from `@supabase/supabase-js` (not `@supabase/ssr`), using the public URL and publishable key from `getPublicEnv()`, `global.headers.Authorization` set to the bearer token, and `auth: { persistSession: false, autoRefreshToken: false }`.
- Verifies with `supabase.auth.getClaims(jwt)`. The project has no asymmetric signing keys configured today, so this falls back to a network check with Supabase Auth per request; that is accepted for v1, and moving to asymmetric keys later makes it local without code changes.
- Rejects claims whose `role` is not `authenticated` (this also rejects the publishable key itself). The user ID is the `sub` claim, never anything from the request (AGENTS.md section 5).
- An expired token, including one that expires mid request, answers 401 `unauthenticated`.

### Errors

A JSON body `{ error: { code, message } }`: 400 `invalid_input`, 401 `unauthenticated`, 404 `not_found` (unknown title, or a type and library path pair that does not exist), 409 `not_released` (release gate; only ever on a write that adds a watch mark, a score, or a Playing or Finished status, never on one that removes a mark, score or status, since marks stored before release stay removable per `lib/tracking/AGENTS.md`), 409 `conflict` (a database check refused the write, including the BS002 weekly username limit and a taken username), 426 `upgrade_required`, 429 `rate_limited` (from the firewall), 502 `catalog_unavailable`, 500 `internal`. Messages are the English copy from `lib/tracking/messages.ts` and `lib/auth/messages.ts` in core.

### API surface

Page size is 20 everywhere a list is paged, with `page` clamped to the same maximum the web pages use.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/v1/config` | GET | none | `minAppVersion`, `apiVersion: 1` | public | none |
| `/api/v1/genres` | GET | `type` movie, tv or game | genre list | public | 400, 502 |
| `/api/v1/search` | GET | `type`, `q`, `genre`, `year`, `minRating`, `page` (the web's search params, parsed by `lib/search/params.ts`) | the web's search page shape: `results`, `page`, `total`, `totalIsExact`, `pageSize: 20`, read through the same `lib/search/read.ts` and `game-read.ts` the `/search` page uses | public | 400, 502 |
| `/api/v1/lists/{type}/{list}` | GET | `type`; `list` from `lib/catalog/lists.ts`; `page` | page of cards | public | 400, 404, 502 |
| `/api/v1/movies/{id}` | GET | `id` | movie detail, cast, `releaseDate` | public | 400, 404, 502 |
| `/api/v1/shows/{id}` | GET | `id` | show detail, seasons | public | 400, 404, 502 |
| `/api/v1/shows/{id}/seasons/{n}` | GET | `id`, `n` | season with episodes and air dates | public | 400, 404, 502 |
| `/api/v1/games/{id}` | GET | `id` | game detail, `releaseDate` | public | 400, 404, 502 |
| `/api/v1/me/profile` | GET | none | `username` (null when unclaimed), `usernameChangeableAt` | bearer | 401 |
| `/api/v1/me/profile` | PUT | `{ username }` | ok | bearer | 400, 401, 409 (taken, or the weekly change limit BS002) |
| `/api/v1/me/titles` | GET | `ids=movie:603,tv:1399,game:123` (at most 40, keys from `ids-key.ts`) | map keyed by ids key: movie `{ planned, watchedAt, rating }`; tv `{ tracked, progress, seasonRatings[], showRating }`; game `{ status, rating }`. No catalog data. | bearer | 400, 401 |
| `/api/v1/me/shows/{id}/seasons/{n}` | GET | `id`, `n` | per episode `{ episodeId, watchedAt, rating }` for that season | bearer | 400, 401 |
| `/api/v1/me/library` | GET | `type` movie, tv or game; `path`, a library route from `LIBRARY_PATHS` (`/up-next`, `/coming-soon`, …); `page` page number, as everywhere else | `LibraryEntry[]` (below), `nextPage` | bearer | 400, 401, 404 |
| `/api/v1/me/movies/{id}/watchlist` | PUT | `{ planned: boolean }` | `MovieTrackingResult`, including `cleared` when planning a watched movie dropped its mark and score | bearer | 400, 401, 404 |
| `/api/v1/me/movies/{id}/watched` | PUT | `{ watched: boolean }` | `MovieTrackingResult` including `cleared` when a mark or score was dropped | bearer | 400, 401, 404, 409 (only for `watched: true`) |
| `/api/v1/me/movies/{id}/rating` | PUT | `{ rating: 1..10 \| null }` | `MovieTrackingResult` | bearer | 400, 401, 409 (only for a score, never for `null`) |
| `/api/v1/me/movies/{id}/watchlist/restore` and `/watched/restore` | POST | the `cleared` state from the earlier result | `MovieTrackingResult` | bearer | 400, 401, 409 |
| `/api/v1/me/episodes/{episodeId}` | PUT | `{ showId, season, watched }` or `{ showId, season, rating: 1..10 \| null }`, one change per request; both members are strict, so a body with both `watched` and `rating`, or any other key, answers 400. There is no episode `number`: the path's `episodeId` names the episode and the server reads its number from TMDB | `{ ok, showTracked }`, plus `newlyMarked` and `markedAt` for a mark: `markedAt` is set only when `newlyMarked` is true (the episode was unwatched), else null. A score on an unwatched episode also marks it watched, and neither a score nor that mark has an Undo in v1, as on the web | bearer | 400, 401, 404, 409 (only for a mark or a score), 502 |
| `/api/v1/me/episodes/{episodeId}/restore` | POST | the `cleared` state `{ kind: "episode", showId, episodeId, markedAt }`, with `markedAt` exactly as the mark returned it (the database matches it by equality) | `{ ok, showTracked }` | bearer | 400 (also when `episodeId` differs from the path), 401, 409 (`conflict` when the mark changed since) |
| `/api/v1/me/shows/{id}/seasons/{n}/watched` | PUT | `{ watched: true }` (the server takes the aired episodes from TMDB) or `{ watched: false, episodeIds }` (1 to 1000 ids from `GET /me/shows/{id}/seasons/{n}`), as the web's season page sends. The server binds the ids to the show, not to season `{n}`, as the web does; RLS keeps them to the caller's own rows | `{ ok, showTracked, undo }`, where `undo` is `{ kind: "unmark", episodeIds }` after a mark, `{ kind: "restore", entries: { episodeId, watchedAt }[] }` after an unmark, null when nothing changed | bearer | 400, 401, 404, 502 |
| `/api/v1/me/shows/{id}/seasons/{n}/watched/restore` | POST | the `cleared` state `{ kind: "season", showId, seasonNumber, undo }`, with `undo` as the write returned it | `{ ok, showTracked }` | bearer | 400 (also when `showId` or `seasonNumber` differs from the path), 401, 409 (`conflict` when nothing still qualifies: a `restore` brings back only episodes still unwatched and changed within the last 10 minutes) |
| `/api/v1/me/shows/{id}/tracking` | PUT, DELETE | none | PUT `{ ok }`; DELETE `{ ok, undo }`, where `undo` is `{ trackedAt }`, or null when the show was already stopped | bearer | 400, 401, 404 |
| `/api/v1/me/shows/{id}/tracking/restore` | POST | the `cleared` state `{ kind: "show_tracking", showId, undo }`, with `undo` as DELETE returned it | `{ ok }` | bearer | 400 (also when `showId` differs from the path), 401, 409 (`conflict` when the show changed since) |
| `/api/v1/me/games/{id}` | PUT, DELETE | `{ status?, rating? }` for PUT | game result including `cleared` | bearer | 400, 401, 404, 409 (only for Playing, Finished or a score) |
| `/api/v1/me/games/{id}/restore` | POST | the `cleared` state | game result | bearer | 400, 401 |
| `/api/v1/me/account/delete` | POST | `{ confirm: "DELETE" }` | 204 | bearer | 400, 401 (child 0036) |

**Undo** (show and episode shapes settled 2026-11-19): one contract for every restore route. Core holds a single `ClearedState` Zod union, discriminated by `kind` (`movie_watchlist`, `movie_watched`, `episode`, `season`, `show_tracking`, `game_status`, `game_removed`), and every `…/restore` route takes `{ cleared: ClearedState }` and refuses a `kind` that doesn't belong to its route with 400. Each kind's fields are whatever its restore Server Action takes today (`restoreMovieWatchlist`, `restoreMovieWatched`, `undoEpisodeMark`, `undoSeasonWatched`, `restoreShowTracking`, `restoreGameStatus`, `restoreRemovedGame`): for example `movie_watchlist` carries only the movie id, because the old position is the stored `watchlisted_at` and `restore_movie_watchlist` decides in the database whether the Undo is still allowed (`undo_expired` otherwise). The one addition is the `season` member's `seasonNumber`: the web's Undo never leaves its season page, but a v1 restore route has `{n}` in its path, and it can only bind the Undo to that season if the state names it. Every restore route answers 400 when the state names something other than its path: the movie or show id, the season too on the season restore, and the episode id alone on the episode restore (its path has no show id). The client builds the state from the write's own result plus the ids it sent, using the same names the web actions return: `cleared` for movies as returned; `{ kind: "episode", showId, episodeId, markedAt }` only when the mark answered `newlyMarked: true`; `{ kind: "season", showId, seasonNumber, undo }`; `{ kind: "show_tracking", showId, undo }`. A null `undo` (or `markedAt`) means the write changed nothing, and the app offers no Undo. The build reads each action and writes its member of the union, used by both the action and the route. The routes stay separate, one per resource, so each maps to exactly one command. The rules for which writes return a `cleared` state are the ones in `lib/tracking/AGENTS.md`.

**Mapping to actions**: each write route maps one to one to an existing Server Action through its command (`setMovieWatchlist`, `setMovieWatched`, `setMovieRating`, the restores above, `setEpisodeWatched`, `setEpisodeRating`, `setSeasonWatched`, `trackShow`, `untrackShow`, `setGameStatus`, `setGameRating`, `removeGame`, and the username: `PUT /me/profile` runs `claimUsername` (from `signUpAction`) when the user has no `profiles` row yet and `changeUsernameAction`'s command when they do, so one route owns every username write). Password change, sign in, sign out and reset requests are not v1 routes: mobile calls Supabase Auth directly (`updateUser`, `signInWithPassword`, `signOut`, `resetPasswordForEmail`), since no project rule runs around them on the server today.

**Sign up on mobile** follows the web action's steps (prompts/account-username.md) without sending the password through BeStats' server: (1) validate with `signUpSchema` from core; (2) call `rpc("username_available", { p_username })` as anon, which `supabase/AGENTS.md` already allows; (3) `supabase.auth.signUp` directly; (4) `PUT /api/v1/me/profile` with the username, which runs the same `claimUsername` command as the web. If step 4 answers 409 because someone took the name in between, the account exists and the app opens the account screen with the "username taken" notice, exactly as the web sends you to `/account?notice=…`. While `GET /me/profile` returns a null username, the app shows the account screen's username field first.

**`LibraryEntry`**: `{ type, id, path, user: <the type's state from /me/titles>, card: Card | null }`, ordered exactly as the web page orders it. `card: null` alone means the catalog read failed for that title; there is no second flag that could disagree with it. Entries come from the same server loader the web library pages use (`lib/tracking/library-lists.ts` and `game-library.ts`), which already does placement per request and reads cards through the cached per title reads with the existing concurrency cap. When the catalog fails for a title, its `card` is null, so the user's history still shows (AGENTS.md section 12). A `type` and `path` pair is valid only when `libraryPageAt(path, type)` in core returns a page key (`lib/catalog/AGENTS.md`); the route uses that key internally and never takes a key from the client. The shared routes (`/watched`, `/coming-soon`) need the `type` to be unambiguous: `/coming-soon` is movies' `upcoming` key and games' `coming-soon` key. A pair with no page, such as `/playing` with `type=tv` or `/up-next` with `type=game`, answers 404.

**Images** (settled 2026-11-19): catalog responses return full TMDB and IGDB CDN URLs, exactly the ones the shared normalizers already build for the web, each at its ceiling size (`POSTER_SIZE` `w500`, `BACKDROP_SIZE` `w1280`, `PROFILE_SIZE` `w185`, `STILL_SIZE` `w300`; IGDB covers at `t_cover_big_2x`, art and screenshots at `t_1080p`, the hero cover at `t_original`). A field is `…Url: string | null`, and null means the title has no image, so the app shows its missing image state. No v1 schema carries a path or size token. The size a screen loads is picked by one pure helper in core, `imageUrlForWidth(url, width)`, built by moving the step down logic of the web's `tmdbImageLoader` and `igdbImageLoader` (with `splitImageUrl`, `TMDB_IMAGE_WIDTHS` and `TMDB_IMAGE_BASE`) into `packages/core/src/images/`. It returns the smallest ladder rung at or above `width`, never above the URL's own size, and returns any URL it does not recognize unchanged. The web loaders become thin wrappers around it (keeping their `#same-size` fragment, which only `next/image` needs), and the app calls it with the rendered width in points times `PixelRatio.get()` before handing the URL to `expo-image`. No secret, proxy or Vercel image quota is involved.

### Caching

- Public routes read no cookie, session or bearer header, and answer `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` on success, matching `app/api/search/route.ts`. Season and show routes use `s-maxage=60` because air dates and status are time sensitive (AGENTS.md section 12). `/api/v1/config` uses `public, s-maxage=60`. `/api/v1/genres` uses `public, s-maxage=86400`. Errors and 426 answers are `no-store`.
- A cached `releaseDate` can lag by a few minutes around midnight UTC; the app may briefly show a movie as unreleased or released, but the server gate on write is the authority.
- Every `/api/v1/me/*` route answers `Cache-Control: private, no-store` (AGENTS.md section 11); a test asserts it for every `me` route.
- `proxy.ts` keeps skipping `api/`, so no session refresh adds a `Set-Cookie`.

### Versioning

`/api/v1` is frozen once the first store build ships; a breaking change creates `/api/v2` and v1 stays until no supported app uses it. The app sends `X-BeStats-App-Version` from `Constants.expoConfig.version` (the user facing version, not the build number). `MIN_APP_VERSION` starts at `1.0.0` in core; raising it is a core change plus a web deploy, and that deploy goes out only after the store build that meets it is live on both stores.

### Rate limits

Vercel Firewall rate limit rules, per IP, kept generous because mobile carriers put many users behind one IP. The exact rules are recorded in `docs/deploy.md` so the dashboard state can be rebuilt:

| Path | Limit | Window | Action |
|---|---|---|---|
| `/api/v1/search` | 60 requests | 60 seconds | 429 |
| `/api/v1/lists/*`, `/api/v1/genres` | 120 requests | 60 seconds | 429 |
| `/api/v1/me/*` and other `/api/v1/*` | 300 requests | 60 seconds | 429 |

Search is the tightest because a filtered query can scan several upstream pages. A per user limit keyed by `sub` is not built now; add it only if the per IP rules prove too blunt.

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| Any `me` route | the user ID | verified `sub` claim from `getClaims`, never the request |
| Movie watched, rating | "released today or earlier" | `releaseDate` read on the server through `lib/tmdb`, compared with `todayUtc()` from core (AGENTS.md section 7, UTC days) |
| Game status Playing or Finished, rating | game released | IGDB release date read on the server, `isGameReleased` from core |
| Season watched | which episodes are aired | season episodes from `lib/tmdb`, `todayUtc()`, `lib/tv/season-watch.ts` in core |
| Library page placement | which page a title sits on | user rows plus catalog dates, worked out per request by the existing loaders (AGENTS.md section 9) |
| Season and show ratings, progress | calculated means and counts | `lib/tv/ratings.ts` and `progress.ts` in core, full precision; the app rounds to one decimal for display and shows "Not rated" when there is none |
| Undo restore | the previous state | the earlier write's own result (`cleared`, `markedAt` or `undo`) plus the ids the client sent, posted back as `ClearedState` and validated by its core schema; it only ever touches the caller's own rows, so RLS bounds it |
| Search genres filter | genre names and IDs | `/api/v1/genres`, from the same TMDB and IGDB genre reads the web uses |
| Account screen | current username and when it may change | `/api/v1/me/profile` (the `profiles` row and the weekly limit) |
| Update screen | minimum supported version | `MIN_APP_VERSION` in core, served by `/api/v1/config` |
| Poster, backdrop, profile, still, cover, art | image URL at the size the screen needs | the full URL in the catalog response (built by the shared normalizers at the ceiling size), stepped down by `imageUrlForWidth` in core with the rendered width times the pixel ratio |

### Key invariants

- No v1 route reads a secret outside `lib/tmdb/env.ts` and `lib/igdb/env.ts`.
- A write route never trusts a client sent date, status or release flag; the command re-reads the catalog.
- A write route's behavior equals the matching Server Action's for the same input (same command, same result union).
- Response bodies are parsed against their core Zod schemas in each route's tests, so the app and the API cannot drift.

### Security model

Public routes return catalog data only. `me` routes return and change only the caller's rows, enforced twice: the command receives the verified user ID, and RLS refuses anything else. A restore body is user owned data for the caller's own rows, so a forged one can only set the caller's own state to values the table checks already allow. After an account is deleted, an old access token can still pass verification until it expires (up to an hour), but every write fails on the foreign key to `auth.users` and every read returns nothing. The cross user tests (AGENTS.md section 11) gain direct HTTP cases: user B's token cannot read or change user A's rows through any v1 route.

### Critical test scenarios

- Happy path: a signed in user `PUT`s `watched: true` on a released movie and gets the same result the Server Action returns; the web shows the mark after a reload.
- Release gate: the same request on an unreleased movie answers 409 `not_released` and writes nothing; `watched: false` and `rating: null` on an unreleased movie with a mark stored earlier succeed.
- Undo: removing a watched mark returns `cleared`; posting it to `/watched/restore` brings back the mark and score. Planning a watched movie returns `cleared` and its restore brings both back. A `cleared` of the wrong `kind` for a route answers 400, and so does a season Undo posted to another season's restore path.
- Episode body: `{ showId, season, watched: true, rating: 7 }` answers 400 and writes nothing, never a 200 that drops the score; the old `seasonNumber` name answers 400.
- Auth: no token, an expired token, the publishable key as a token, or a token for user B answers 401 or changes nothing of user A's.
- Version: no header answers 400; `0.9.0` answers 426 with `no-store`; `/config` answers without the header.
- Caching: a public route's success carries `s-maxage`; every `me` route carries `private, no-store`; an upstream failure carries `no-store`.
- Library: `?type=movie&path=/watched` and `?type=tv&path=/watched` return different entries; `?type=game&path=/playing` returns games' Playing page and `?type=movie&path=/coming-soon` movies' Coming soon page; `?type=tv&path=/playing` answers 404; with TMDB failing, entries come back with `card: null`.
- Images: `imageUrlForWidth` gives the same URL the web loaders give today for every rung of each ladder (the existing loader tests move to core and keep passing), never goes above the source size, and returns an unknown host's URL unchanged; a title with no poster returns `posterUrl: null`.
- Sign up: after `signUp`, `PUT /me/profile` creates the `profiles` row; when the name was taken in between it answers 409, the account stays, and `GET /me/profile` returns a null username, matching the web action.

**Rationale (short)**: Route Handlers on the existing Vercel project reuse the cached catalog modules and keep one deploy; Supabase Edge Functions would mean rewriting those modules for Deno and losing the Next.js cache. Bearer auth with a per request client keeps the AGENTS.md section 5 rule that the user ID comes from the verified session while RLS still applies. Writing directly from the phone to Supabase was rejected because the release gate needs catalog dates only the server can be trusted to read. Images use full URLs rather than paths plus size tokens (the first draft of this spec) because the shared types and normalizers already produce full URLs at a ceiling size for the web, and the web's loaders already step them down; returning paths would add a second image shape to every v1 schema and a second set of normalizers to keep in step. Moving the step down logic into core gives both apps one sizing rule, so the phone never loads a `w500` poster for a small tile. The tracer's `posterUrl` and `backdropUrl` already follow this contract. The show and episode writes keep the web actions' result names (`markedAt`, `undo`) rather than a new `cleared: { previous }` shape, because the route calls the same command and returns its result union unchanged (Key invariants); a second shape would need a translation layer in both directions. The episode body drops `number` because a client sent number could only disagree with the one TMDB gives for the path's `episodeId`, and the body is strict so a combined change can never pass as a partial success (AGENTS.md section 11).
