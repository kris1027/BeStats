# 0023. IGDB integration module

**Date**: 2026-10-17
**Status**: Accepted

Scope feature: [G1. IGDB integration module](../../scope/games.md#g1-igdb-integration-module) · Beta tier

## Summary

This decides how BeStats talks to IGDB, the games database that will supply every game title, cover, date and rating the app shows. One server only module, `lib/igdb/`, does all of it, built the same way as the TMDB module (spec 0002): it signs in to Twitch with app credentials the browser never sees, keeps that sign in token in memory, spaces its requests to stay under IGDB's limit, checks every response, and hands back the app's own clean types. Results are cached by Next.js for hours (a game) or minutes (a search), and a failure comes back as a plain typed result so a page can show an honest error. Nothing here touches the database or the UI; later games features (G3 to G10) build on it.

## Requirements

**User stories**:
- As a visitor, I want game pages and game search to load fast and consistently, so that browsing games feels like browsing movies and shows.
- As a visitor, I want a game with missing IGDB data to show only what IGDB knows, so that I never see an invented date, cover or rating.
- As a signed in user, I want a game's release date to refresh within hours, so that Playing and Finished unlock soon after a game comes out.
- As a signed in user, I want a game IGDB later reclassified (for example as a DLC) to stay visible and removable in my list, not vanish as if it were deleted.
- As a developer, I want one module that owns every IGDB request, token and rate limit, so that G3 to G10 never repeat that work or leak a credential.

**Acceptance criteria**:

- **AC-1**: The credentials are read from the server only variables `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `lib/igdb/env.ts` and nowhere else, through a lazy, memoized Zod check whose error names the missing variable and never its value. `pnpm build` and `pnpm test` pass with neither variable set. `.env.example` lists both with placeholders and a description under the server only block.
- **AC-2**: Every file in `lib/igdb/` except pure helpers imports `server-only`. `security-boundary.test.ts` fails if any file other than `lib/igdb/env.ts` (and `.env.example`) names either variable, or if either appears with a `NEXT_PUBLIC_` prefix. Neither value appears in the client output of a production build.
- **AC-3**: The app access token comes from `POST https://id.twitch.tv/oauth2/token` with `client_id`, `client_secret` and `grant_type=client_credentials` in a form body (never in the URL). Its response is checked by a Zod schema (`access_token` a non empty string, `expires_in` a positive integer); anything else is `upstream`. It is kept in process memory until 10 minutes before `Date.now()` at fetch plus `expires_in`, and concurrent callers that find no valid token share one in flight token request. That request has its own 8 second timeout, and the shared promise is cleared in `finally` whether it succeeds or fails, so a hung or failed Twitch call never blocks the next caller. The token never enters a `use cache` scope's return value, a URL, a log line or an error message.
- **AC-4**: When IGDB answers 401, the module drops the memoized token, fetches a new one, and repeats the request once. A second 401, or a token request refused with 400, 401 or 403, raises kind `unauthorized`. A token request answered 429 raises `rate_limited`, a 5xx or network failure `upstream`, its timeout `timeout`. A missing or empty `IGDB_CLIENT_ID` or `IGDB_CLIENT_SECRET` also raises an `IgdbError` of kind `unauthorized` whose message names the variable, so it crosses the cache boundary as a result and a page shows its error state instead of crashing.
- **AC-5**: Every IGDB request is a `POST` to `https://api.igdb.com/v4/{endpoint}` with headers `Client-ID` and `Authorization: Bearer {token}` and an Apicalypse text body (IGDB's query language, for example `fields name; where id = 1942;`). Bodies are built only by `query.ts`, which accepts validated integers only and handles search text in this order: trim, reject if empty, strip control characters (newlines included), check 1 to 100 characters, then escape backslash and double quote. User text can never end the string and add its own clauses.
- **AC-6**: Per server process, at most 4 requests are open at once and request starts are at least 250 ms apart (one mechanism: a slot pool of 4 plus a minimum spacing, which satisfies both "4 a second" and "4 open"). A request waits at most 5 seconds for a slot, then fails as `rate_limited` without being sent. The 8 second attempt timeout starts only once a slot is held and covers reading the body too; a timeout raises `timeout` and is not retried. A 429 or 5xx is retried, at most 3 attempts in total, honouring `Retry-After` (in seconds or as an HTTP date) capped at 10 seconds when present and otherwise backing off 250 ms then 750 ms with jitter; every retry goes back through the limiter. One read, token fetch and retries included, gives up as `timeout` after 20 seconds in total.
- **AC-7**: Failures raise an `IgdbError` with a `kind` from `not_found`, `unauthorized`, `rate_limited`, `timeout`, `upstream`, `bad_response`, plus `status` and `endpoint` (never the body). Cached reads return an `IgdbResult` (a plain object) and the uncached wrapper rebuilds the error outside the cache scope. A cached failure lives `seconds` for `timeout`, `rate_limited` and `upstream`, and `minutes` for the rest. `isIgdbNotFound(error)` is the one way a page tests for not found. IGDB statuses map as 401 and 403 `unauthorized`, 404 `not_found`, 429 `rate_limited`, 5xx `upstream`, and any other 4xx `bad_response`, which is not retried because it means IGDB could not read the query this module built; a 200 whose body is not JSON is `upstream` and retried, since it reads as a cut off response.
- **AC-8**: Every exported read is a `use cache` function that calls `cacheLife` in its own scope: `hours` for `getGame` and `getGamesByIds`, `minutes` for `searchGames` and `discoverGames`, `max` for `getGameGenres` and `getGamePlatforms`. No cached scope reads cookies, headers, search params or any user value.
- **AC-9**: `getGame(id)` makes exactly one IGDB request and returns a normalized `Game`. An empty response raises `not_found`. A game that fails the catalog filter is returned, with `hidden: true`, not refused.
- **AC-10**: The catalog filter is one rule in `catalog-filter.ts`, used two ways. A game is visible when its game type is main game, standalone expansion, remake, remaster or expanded game, it has no `version_parent` (so editions such as Deluxe or GOTY are hidden), and it does not carry the Erotic theme. A game with no `game_type` or no themes is visible on those counts. `searchGames` and `discoverGames` put that rule in the query `where` clause, written so a missing value passes, as in `(game_type = (0,4,8,9,10) | game_type = null) & version_parent = null & (themes = null | themes != (42))` (exact syntax confirmed live, build step 3). `getGame` and `getGamesByIds` compute `hidden` from the same rule on the returned record instead. Both forms live in `catalog-filter.ts`, and a parity test runs the same fixture records through both, so a game is never visible in one path and hidden in the other.
- **AC-11**: `getGamesByIds(ids)` accepts 0 to 500 positive integer ids, dedupes and sorts them, and makes one IGDB request with `limit 500` (none at all for an empty list). The cache key is that sorted list. Ids IGDB does not return, or returns without a valid `id` and `name`, land in `missingIds`. A systemic failure (`unauthorized`, exhausted `rate_limited`, `timeout`, `upstream`) raises instead of returning a short list. More than 500 ids, or an invalid id, throws an `IgdbValidationError` before any request. `found` comes in no promised order; callers look games up by id.
- **AC-12**: `searchGames({ query, genreIds?, platformIds?, year?, minRating?, page? })` matches the title query in IGDB's relevance order and adds every given filter to the same query, so every returned game meets every filter. Within one list a game matches when it has any of the given genres (or platforms); different filters combine with AND. `year` is the UTC year of `first_release_date`; `minRating` is on the 0 to 10 scale and matches against IGDB `rating` times 10. Pages hold 20 results: the read asks IGDB for 21 and returns 20, so `hasNextPage` is always known. `totalResults` comes from IGDB's count header when the response carries one and is `null` when it does not, never a guess. An empty query is not a search: G7 sends a filters only browse to `discoverGames`.
- **AC-12b**: Inputs are validated before any request, and a bad one throws `IgdbValidationError` (exported, never sent to IGDB, never cached): `genreIds` and `platformIds` each at most 20 positive integers; `year` an integer from 1950 to the current UTC year plus 5; `minRating` 0 to 10; `minRatingCount` and `minHypes` non negative integers; `releasedFrom` and `releasedTo` valid `YYYY-MM-DD` with from not after to; `page` an integer from 1 to 50 (outside that range throws, never clamps); the query as AC-5.
- **AC-13**: `discoverGames({ genreIds?, platformIds?, releasedFrom?, releasedTo?, minRating?, minRatingCount?, minHypes?, sort, page? })` applies the same filter, paging and `hasNextPage` rules as AC-12 with an explicit `sort` from `rating_desc`, `rating_count_desc`, `release_desc`, `release_asc`, `hypes_desc`. A sort by date, rating or hypes also requires that field to be present, so undated or unrated games never sort to the top. `releasedFrom` and `releasedTo` are UTC days (`YYYY-MM-DD`), both inclusive. IGDB takes one sort key, so ties can repeat or skip an item across pages; that is accepted. This covers G6's rows: recently released is `release_desc` with `releasedTo` today; coming soon is `hypes_desc` with `releasedFrom` tomorrow; top rated is `rating_desc` with `minRatingCount`.
- **AC-14**: `getGameGenres()` and `getGamePlatforms()` return `{ id, name }[]` sorted by name, each in one request.
- **AC-15**: Only the normalized camelCase types in the design section leave `index.ts`; no raw IGDB object or snake case field crosses it. Missing stays missing: an absent cover, date, summary or rating, and a rating or rating count of 0, become `null`, never zero, placeholder text or today's date. `releaseDate` is the UTC calendar day of `first_release_date` (unix seconds) as `YYYY-MM-DD`, and `releaseYear` its UTC year. G4's release gate reads it as released when `releaseDate` is on or before today's UTC day; IGDB's earliest date can be a placeholder (a year only, or a quarter), and that inaccuracy is accepted rather than modelled. `communityRating` is IGDB `rating` divided by 10 at full precision; rounding is the page's job.
- **AC-16**: Zod schemas cover only fields the app reads and never use `.strict()`. In `getGame` a missing `id` or `name` raises `bad_response` with nothing partial. Inside arrays, a platform, genre or theme without a name is dropped and the read succeeds; in a list or search, a game without `id` or `name` is dropped.
- **AC-17**: Only failures and retries are logged, as one JSON line with `event` (`igdb_request_failed` or `igdb_request_retry`, plus `igdb_token_failed`), `endpoint`, `status`, `kind`, `attempt`, `elapsedMs`. No token, client id, secret or request body (which can hold a visitor's search text) is logged.
- **AC-18**: `pnpm igdb:live` runs `lib/igdb/igdb.live.ts` against real IGDB and skips without credentials. It proves: a token is issued; `getGame` parses a known game; the pinned game type ids and the Erotic theme id match their names on IGDB's `game_types` and `themes` endpoints; a known hidden game (an edition, an Erotic themed game) is excluded by the query filter; a game with no themes and one with no `game_type` pass both the query filter and the `hidden` rule; the any of syntax for a genre list; `search` combined with a `where` filter returns only matching games; a `;` inside the quoted search text stays literal; whether the count header is present; and a built cover URL answers 200. It also reports any `game_type` id it sees that is not pinned. It has its own config, `vitest.igdb-live.mts`, and `vitest.live.mts` is narrowed to `lib/tmdb`, so the two never run or label each other.
- **AC-19**: `pnpm test` covers the module with fixtures under `lib/igdb/__fixtures__/` and no network: token memo and expiry, single flight, 401 refresh, retry and timeout, the limiter, query escaping, the filter rule, normalization of missing values, batch `missingIds`, and the failure cache profile.
- **AC-20**: `lib/igdb/index.ts` is the only entry point and exports exactly the reads, `isIgdbNotFound`, `IgdbError`, `IgdbValidationError` and the types in the design section (every row but the internal `IgdbResult`); a surface test fails on anything else, runtime export or type.
- **AC-21**: `lib/igdb/AGENTS.md` records this module's conventions, and root `AGENTS.md` gains a pointer to it plus the settled games rules from [games.md](../../scope/games.md), as the scope's G1 row asks.

## Decision

**Chosen option**: Option 1: A separate `lib/igdb/` module mirroring `lib/tmdb/`, with an in memory token and an in process rate limiter.

`lib/igdb/` copies the TMDB module's proven shape (read pairs, plain results across the cache boundary, explicit lifetimes, fixture plus live tests) and adds only what IGDB needs on top: a Twitch token kept in memory, a request limiter, and an escaped query builder. It shares no code with `lib/tmdb/`.

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`), only for the `use cache` and `cacheLife` rules every read follows.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no database table. The only stored state is in process memory: the token (`accessToken`, `expiresAt`), the single flight promise, and the limiter's start times and open count. The normalized types are the module's data model:

| Type | Fields | Notes |
|---|---|---|
| `Game` | `id: number`, `name: string`, `slug: string \| null`, `coverUrl: string \| null`, `releaseDate: string \| null`, `releaseYear: number \| null`, `platforms: GameRef[]`, `genres: GameRef[]`, `themes: GameRef[]`, `summary: string \| null`, `gameType: GameType \| null`, `communityRating: number \| null`, `communityRatingCount: number \| null`, `hidden: boolean` | from `getGame`. G9 adds companies, screenshots, videos, similar games, modes, perspectives and franchise later (a change in `schemas.ts`, `types.ts`, `normalize.ts`) |
| `GameSummary` | `id`, `name`, `coverUrl`, `releaseDate`, `releaseYear`, `communityRating`, `communityRatingCount`, `genreIds: number[]`, `platformIds: number[]`, `hidden` | cards, batch, search, discover |
| `GameRef` | `id: number`, `name: string` | platforms, genres, themes, and the reference lists |
| `GameType` | `'main_game' \| 'standalone_expansion' \| 'remake' \| 'remaster' \| 'expanded_game' \| 'other'` | `other` covers every id outside the visible set, so the union stays closed |
| `BatchResult<GameSummary>` | `found: GameSummary[]`, `missingIds: number[]` | |
| `Paged<GameSummary>` | `page: number`, `results: GameSummary[]`, `hasNextPage: boolean`, `totalResults: number \| null` | `null` when IGDB sends no count |
| `SearchGamesOptions` | `query`, `genreIds?`, `platformIds?`, `year?`, `minRating?`, `page?` | the input of `searchGames` (AC-12) |
| `DiscoverGamesOptions`, `DiscoverSort` | the filters of AC-13 and `sort` from its five values | the input of `discoverGames` |
| `IgdbErrorKind` | `'not_found' \| 'unauthorized' \| 'rate_limited' \| 'timeout' \| 'upstream' \| 'bad_response'` | the `kind` a page branches on (AC-7) |
| `IgdbError` | `kind`, `status: number \| null`, `endpoint: string` | class extending `Error` |
| `IgdbValidationError` | `field: string` | class extending `Error`; a caller bug or a bad URL value, thrown before any request |
| `IgdbResult<T>` | `{ ok: true, value } \| { ok: false, failure }` | internal, crosses the cache boundary |

**Files** (mirroring `lib/tmdb/`): `index.ts` (entry), `reads.ts` (every `use cache` wrapper, the only `next/cache` import), `client.ts` (the only `fetch` to IGDB: headers, deadline, retries, status mapping, logging), `token.ts` (the only `fetch` to Twitch, memo and single flight), `limiter.ts`, `query.ts` (Apicalypse builder and escaping), `catalog-filter.ts`, `constants.ts`, `env.ts`, `errors.ts`, `result.ts`, `schemas.ts`, `normalize.ts`, `types.ts`, `validation.ts`, `games.ts`, `batch.ts`, `search.ts`, `discover.ts`, `summary-page.ts` (the paging and filters those two share), `reference.ts`, `igdb.live.ts`, `__fixtures__/`.

**Pinned constants** (`constants.ts`, each confirmed by the live check before release, AC-18):

| Constant | Value | Why pinned |
|---|---|---|
| `IGDB_API_BASE` | `https://api.igdb.com/v4` | |
| `TWITCH_TOKEN_URL` | `https://id.twitch.tv/oauth2/token` | |
| `IGDB_IMAGE_BASE` | `https://images.igdb.com/igdb/image/upload` | cover URL is `{base}/t_cover_big/{image_id}.jpg` |
| `IGDB_VISIBLE_GAME_TYPES` | main game 0, standalone expansion 4, remake 8, remaster 9, expanded game 10 | settled filter (games.md), ids from IGDB's `game_types` |
| `IGDB_EROTIC_THEME_ID` | 42 | settled filter |
| `IGDB_RATE_PER_SECOND` / `IGDB_MAX_OPEN` | 4 / 4 | conservative reading of IGDB's limit (see rationale) |
| `IGDB_TIMEOUT_MS`, `IGDB_MAX_ATTEMPTS`, `IGDB_RETRY_DELAYS_MS` | 8000, 3, [250, 750] | same budget as TMDB |
| `IGDB_TOKEN_REFRESH_MARGIN_MS` | 600000 (10 minutes) | |
| `IGDB_SLOT_WAIT_MS` / `IGDB_READ_DEADLINE_MS` / `IGDB_RETRY_AFTER_CAP_MS` | 5000 / 20000 / 10000 | bound a queued, retried read |
| `IGDB_BATCH_LIMIT` / `IGDB_PAGE_SIZE` / `IGDB_MAX_PAGE` | 500 / 20 / 50 | 500 is IGDB's per query maximum |

**State transitions**: the token only. `none → fetching → valid → (within 10 minutes of expiry, or a 401) → fetching`. A failed fetch returns to `none` and raises; the next caller tries again.

**API surface** (server only functions exported from `lib/igdb/index.ts`; no HTTP routes):

| Function | IGDB call | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getGame` | `POST /games` `where id = {id}; limit 1;` | `id: number` (req, positive int) | `Game` | Twitch app token, server only | `not_found` on empty, `bad_response` on missing `id`/`name` |
| `getGamesByIds` | `POST /games` `where id = (…); limit 500;` | `ids: number[]` (req, 0 to 500) | `BatchResult<GameSummary>` | same | raises on systemic failure; validation error over 500 |
| `searchGames` | `POST /games` `search "…"; where {filter & options}; limit 20; offset …;` | `query: string` (req, trimmed, 1 to 100 chars), `genreIds`, `platformIds`, `year`, `minRating`, `page` (opt) | `Paged<GameSummary>` | same | `rate_limited`, `upstream`, `timeout` |
| `discoverGames` | `POST /games` `where {filter & options}; sort …; limit 20; offset …;` | filters as AC-13, `sort` (req), `page` (opt) | `Paged<GameSummary>` | same | as above |
| `getGameGenres` | `POST /genres` `fields name; sort name asc; limit 500;` | none | `GameRef[]` | same | `upstream` |
| `getGamePlatforms` | `POST /platforms` same shape | none | `GameRef[]` | same | `upstream` |
| `isIgdbNotFound` | none, pure | `error: unknown` | `boolean` | n/a | none |

**Fields per read** (the `fields` clause; nested names use IGDB's dot expansion):
- `getGame`: `name, slug, cover.image_id, first_release_date, platforms.name, genres.name, themes.name, summary, game_type, version_parent, rating, rating_count`
- summaries (batch, search, discover): `name, cover.image_id, first_release_date, rating, rating_count, genres, platforms, themes, game_type, version_parent` (ids only for genres, platforms, themes; names come from the reference lists)
- reference lists: `name`

**Memory state and caching**: the token and the limiter are module level state, so each server instance (and each build or dev worker) has its own. That is harmless: on Vercel's Fluid compute one instance serves many concurrent requests, so the limiter still spaces them, and a cache hit skips both because no request is made. Neither is ever an argument to, or a value returned from, a cached scope.

Every cached read is a pair, as in TMDB: an inner uncached function (request, validation, normalization) the tests call, and a thin exported wrapper in `reads.ts` with `use cache` and `cacheLife`. `getGamesByIds` dedupes and sorts before calling its cached inner function, so `[3, 1]` and `[1, 3, 3]` share one entry.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| any read | client id, secret | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` via `env.ts` |
| any read | bearer token, its expiry | Twitch token response `access_token`, `expires_in` (seconds from fetch time) |
| `getGame` | `coverUrl` | `cover.image_id` + `IGDB_IMAGE_BASE` + size `t_cover_big` |
| `getGame` | `releaseDate`, `releaseYear` | `first_release_date` (unix seconds), UTC day and year |
| `getGame` | `communityRating`, `communityRatingCount` | `rating` / 10, `rating_count`; 0 or absent → `null` |
| `getGame` | `gameType` | `game_type` id mapped through `IGDB_VISIBLE_GAME_TYPES`, else `other`; absent → `null` |
| `getGame`, batch | `hidden` | `catalog-filter.ts` over `game_type`, `version_parent`, `themes` (AC-10). An absent `game_type` alone does not hide a game |
| `searchGames` | relevance order | IGDB `search` clause (no `sort` added) |
| search, discover | `year` window | UTC `Jan 1 00:00` to next `Jan 1 00:00` as unix seconds on `first_release_date` |
| search, discover | `minRating` | input × 10 against `rating` |
| search, discover | `offset` | `(page − 1) × 20` |
| search, discover | `totalResults` | IGDB count response header when present, else `null` |
| search, discover | `hasNextPage` | IGDB returned 21 results for a `limit 21` query |
| discover (G6 rows) | "today", "tomorrow" | the caller passes UTC days; the module never reads the clock for a filter |
| batch | `missingIds` | requested ids minus valid returned ids |
| failure cache | lifetime | `failureProfile(kind)` in `result.ts` |

**Key invariants**:
- The secret and the token exist only in `env.ts`, `token.ts` memory and the outgoing request headers or token form body.
- A hidden game never appears in `searchGames` or `discoverGames`; a hidden game read by id always says `hidden: true`.
- No cached scope holds user data or request state; the batch key holds only catalog ids.
- No query body contains unescaped caller text or a non integer id.

**Security model**: everything here is public catalog data, so no user data and no ownership rules. The two assets are the Twitch client secret and the derived token: both are server only (`server-only`, no `NEXT_PUBLIC_`, boundary test), never logged, never cached in Next's store. The query builder is the injection boundary for visitor search text (AC-5). IGDB and Twitch receive no user data, which is why games.md lists them as credits, not processors.

**Configuration required**:
- `IGDB_CLIENT_ID`: the Twitch application's client id (server only).
- `IGDB_CLIENT_SECRET`: the Twitch application's client secret (server only).
- Prerequisite: register an application at the Twitch developer console (client type Confidential) and paste both into `.env.local`. Vercel values are set in G10.

**Critical test scenarios**:
- Happy path: with fixtures, `getGame` returns a normalized `Game` with `hidden: false` from one stubbed request carrying both headers, verifies **AC-5**, **AC-9**, **AC-15**.
- Token: two concurrent cold reads trigger one token fetch; a stubbed 401 triggers one refresh and one repeat, then succeeds, verifies **AC-3**, **AC-4**.
- Failure: a 429 then 200 succeeds on attempt 2; three 503s raise `upstream`; a hang raises `timeout` after 8 s with no retry; the cached failure profile is `seconds`, verifies **AC-6**, **AC-7**.
- Injection: a search for `zelda"; where id = 1;` produces a body whose search string contains the escaped text and no extra clause, verifies **AC-5**.
- Batch: 3 ids where IGDB returns 2 gives one `missingIds`; 501 ids throws before fetch; `[]` makes no request, verifies **AC-11**.
- Filter: a fixture DLC by id returns `hidden: true`; the built search query contains the filter clause; the parity test agrees on every fixture record, including one with no themes and one with no `game_type`, verifies **AC-10**.
- Limits: a queued request with no slot after 5 s fails `rate_limited` unsent; a `Retry-After: 60` waits 10 s; `page: 51` and a 21 id genre list throw `IgdbValidationError` before fetch; missing credentials yield an `unauthorized` result, not a crash, verifies **AC-4**, **AC-6**, **AC-12b**.
- Boundary: a temp file naming `IGDB_CLIENT_SECRET` outside `env.ts` fails `security-boundary.test.ts`, verifies **AC-2**.

## Build plan

Tracer Bullet: the first slice is one real request end to end (credentials → token → IGDB → normalized `Game`, proven live), then each strand thickens.

1. Add `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` to `.env.example`, write `lib/igdb/env.ts`, and extend `security-boundary.test.ts` for both names, satisfies **AC-1**, **AC-2**.
2. Thin thread: `constants.ts`, `token.ts` (memo plus single flight), a minimal `client.ts` (headers, POST, timeout), a minimal `query.ts`, the `getGame` pair with a schema for `id` and `name`, and `igdb.live.ts` with `vitest.igdb-live.mts` and the `igdb:live` script (narrow `vitest.live.mts` to `lib/tmdb`). Run it against real IGDB, satisfies **AC-3**, **AC-5**, **AC-9**, **AC-18**.
3. Facts gate, inside the live check: confirm the game type ids, the Erotic theme id, `version_parent = null` and `themes != (42)` exclusion, `search` plus `where`, the count header, and the cover URL. If `search` cannot take a `where`, stop and return to `/architect` before step 7, because AC-12 then needs a different design, satisfies **AC-18**.
4. Harden the client: `errors.ts`, `result.ts` with `failureProfile`, retries with `Retry-After`, the 401 refresh, `limiter.ts`, and failure logging, satisfies **AC-4**, **AC-6**, **AC-7**, **AC-17**.
5. Full `Game`: `schemas.ts`, `types.ts`, `normalize.ts`, `catalog-filter.ts` and the `hidden` flag, satisfies **AC-9**, **AC-10**, **AC-15**, **AC-16**.
6. `getGamesByIds` with canonical keys and `missingIds`, satisfies **AC-11**.
7. `searchGames` and `discoverGames` with escaping, validation, filters, paging, `hasNextPage` and the count, satisfies **AC-5**, **AC-10**, **AC-12**, **AC-12b**, **AC-13**.
8. `getGameGenres` and `getGamePlatforms`, satisfies **AC-14**.
9. `reads.ts` lifetimes, `index.ts` and the surface test, satisfies **AC-8**, **AC-20**.
10. Complete the fixture suite and capture fixtures, satisfies **AC-19**.
11. Write `lib/igdb/AGENTS.md` and add the root `AGENTS.md` pointer and games rules, satisfies **AC-21**.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (with no IGDB variables, proving AC-1), `pnpm igdb:live` with real credentials. No migration, no UI, no deploy.

## Consequences

**Positive**:
- G3 to G10 get one trusted source: a page imports a read and never thinks about tokens, limits or IGDB's query language.
- The TMDB module is untouched, so this PR cannot regress movies or shows.
- Missing data, hidden games and unknown counts are explicit in the types, so later features cannot fake them by accident.

**Negative / tradeoffs**:
- About a dozen files duplicate TMDB patterns (result, retry, logging). A fix to one is not a fix to the other.
- The rate limit is per server instance. Several busy Vercel instances can together exceed IGDB's limit; 429 retries absorb it, and a burst can still show an error state. The same gap TMDB has.
- Each server instance fetches its own token on a cold start, so Twitch issues more tokens than strictly needed.
- A library batch is cached as a whole: adding one game makes the next library load one fresh IGDB request for all ids.
- Several IGDB facts are pinned from knowledge, not confirmed docs (the docs site refused automated reads). Step 3 confirms them; until then they are assumptions.

**Neutral**:
- Two new server variables, a new live script, and a Twitch developer application to register.
- IGDB names and summaries are English only; there is no translation fallback as with TMDB.

## Follow-up

- [ ] Before G10, recheck IGDB's and Twitch's terms (attribution wording, non commercial use) in a browser, as games.md already plans.
- [ ] If production logs show repeated `igdb_request_retry` with kind `rate_limited`, revisit a shared limiter (recorded as an option in rationale.md).
- [ ] G6's "Popular right now" row needs IGDB's `popularity_primitives` endpoint; that read is G6's to add.
- [ ] G3 owns `next/image` for `images.igdb.com` (its loader and remote pattern, resizing the `t_cover_big` URL like the TMDB loader does); this module only builds the URL. G3 also keeps every IGDB read behind Suspense, so a build with no credentials still prerenders its shell.
- [ ] G4 records the release gate rule (released when `releaseDate` is on or before today's UTC day) in its spec and in `AGENTS.md`.
