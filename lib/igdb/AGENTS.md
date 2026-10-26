# AGENTS.md · lib/igdb

The server only module every IGDB request goes through, the games catalog's
one trusted source. Decided in
[spec 0023](../../docs/specs/0023-igdb-integration-module/index.md); games
scope feature G1. It mirrors `lib/tmdb/` in shape but shares no code with it.

## What lives where

- `index.ts` is the only entry point a page may import. It exports the seven
  cached reads (`getGame`, `getGamesByIds`, `searchGames`, `discoverGames`,
  `getPopularGames`, `getGameGenres`, `getGamePlatforms`), `isIgdbNotFound`,
  `IgdbError`, `IgdbValidationError` and the types in the spec's design
  section, plus `PopularGamesKind` (spec 0028).
  `surface.test.ts` fails on any other export, runtime or type.
- `reads.ts` holds every `use cache` wrapper and is the only file that imports
  `next/cache`.
- `client.ts` is the only `fetch` to IGDB: headers, the limiter, deadlines,
  retries, the 401 refresh, status mapping and failure logging.
- `token.ts` is the only `fetch` to Twitch: the app token, its memo and the
  single flight request.
- `env.ts` is the only file that names `IGDB_CLIENT_ID` and
  `IGDB_CLIENT_SECRET` (`security-boundary.test.ts`). The live check loads
  `.env.local` with Node's `process.loadEnvFile`, which names neither.
- `query.ts` is the only builder of Apicalypse bodies; `catalog-filter.ts`
  holds the catalog rule; `limiter.ts`, `log.ts`, `constants.ts`,
  `schemas.ts`, `normalize.ts`, `types.ts`, `validation.ts`, `errors.ts`,
  `result.ts`, then the reads in `games.ts`, `batch.ts`, `search.ts`,
  `discover.ts` (both paging through `summary-page.ts`), `popularity.ts`
  (Trending and Popular: the `popularity_primitives` ranks, then the batch
  read, spec 0028) and `reference.ts`.
- Pure code outside this folder (`lib/catalog/game-lists.ts`,
  `lib/catalog/media-type.ts`, `lib/catalog-list-read.ts`, `lib/images/`
  and `lib/search/`) may import `constants.ts` and `types.ts` directly,
  since `index.ts` is server only; a page or component never does, and
  reads search's IGDB limits through `SEARCH_CATALOGS`
  (`lib/search/catalogs.ts`). Nothing outside imports `query.ts`; a rule it
  shares, like the control character pattern, moves to `constants.ts`.
- Pure files (no `server-only`, so tests and the live check read them):
  `catalog-filter.ts`, `constants.ts`, `errors.ts`, `query.ts`, `types.ts`,
  `validation.ts`. Every other file starts with `import "server-only";`.

## Conventions this module holds to

- **Every read is a pair.** An inner uncached function in its own file does
  the request and normalization; a thin wrapper in `reads.ts` carries
  `use cache` and calls `cacheLife` in its own scope (through `settle`). Tests
  call the inner half.
- **Validate once, before the cache.** A wrapper validates its input first,
  outside any cached scope, so a bad value throws `IgdbValidationError` and is
  never sent or cached. The validated form is canonical (ids deduped and
  sorted, absent options dropped), is the cache key, and is branded `Valid<T>`:
  inner reads take only branded values, so they never re-check, and a test
  hands them input through the same validator.
- **A failure crosses the cache boundary as a plain `IgdbResult`**, and the
  wrapper rebuilds the `IgdbError`, so `kind` and `isIgdbNotFound` survive.
  Never throw an `IgdbError` out of a cached scope.
- **Lifetimes**: `hours` for `getGame`, `getGamesByIds` and
  `getPopularGames`, `minutes` for search and discover, `max` for the
  reference lists. A failure takes
  `failureProfile(kind)`: `seconds` for `timeout`, `rate_limited` and
  `upstream`, `minutes` for the rest.
- **The token and the limiter live in process memory**, never in a cache entry,
  a URL, a log line or an error. Each server instance has its own.
- **One limiter**: at most 4 requests open, starts 250 ms apart, a 5 s wait for
  a slot (then `rate_limited`, unsent), 8 s per attempt, 3 attempts for a 429
  or 5xx, one repeat after a 401, 20 s for the whole read. Any other 4xx is
  `bad_response` and is not retried.
- **The catalog filter is one rule, `CATALOG_RULE`**, written into every search
  and discover query and evaluated as `hidden` on a game read by id. Reads by
  id never drop a hidden game, so a reclassified game stays removable from a
  list. Change the rule only there; `catalog-filter.test.ts` checks both forms
  agree.
- **Search text only enters a body through `buildQuery`**, cleaned (trim,
  reject empty, strip control characters, 1 to 100 characters) and then
  escaped. Numbers go through `int` and `intList`, and every `where`
  condition is a branded `Condition` from `cond` (with `Sort` for an order),
  so no raw clause text reaches a body.
- **Missing stays missing**: an absent value, a blank string, and a rating or
  rating count of 0 become `null`. `communityRating` is IGDB's `rating` / 10 at
  full precision, and always labelled as the community rating on a page.
- **Every filter is in the query**, so every result meets it and IGDB's
  `X-Count` header is a truthful `totalResults` (null when absent). A page asks
  for one more than its size and returns the size to know `hasNextPage`.
  Discover and search accept `pageSize` 20 (the default) or
  `IGDB_LIST_PAGE_SIZE` 24, the games grid (spec 0028, AC-5; spec 0029,
  AC-19); the size is in the cache key.
- **Several genres mean all of, several platforms any of** (`cond.allOf`
  writes `genres = [ids]`, `cond.anyOf` writes `platforms = (ids)`, spec 0029,
  AC-7). `minRatingCount` is a shared `GameFilters` field, written once in
  `sharedConditions`, so search and discover both take it. Discover adds
  `{sort field} != null` unless `requireSortField: false`; game search's
  discover mode turns it off, so unrated games follow rated ones and are
  counted.
- **The module never reads the clock for a filter.** Discover callers pass UTC
  days; only the year bound of a filter reads the current year.
- **Covers are built at `t_cover_big_2x` (528px), the ceiling, not the size
  every image loads.** `lib/images/igdb-loader.ts` steps a `next/image` width
  down `IGDB_COVER_LADDER` in `constants.ts` and never past the URL's own size
  (spec 0025, AC-12). A game's wide art (`artUrl`, built at `t_1080p`) steps
  down `IGDB_ART_LADDER` the same way (spec 0028, AC-6). The loader lives
  outside this folder because it runs in the browser; `lib/images/loader.ts`,
  the `loaderFile`, sends it every IGDB URL.
- Adding a field is a three place change: `schemas.ts`, `types.ts`,
  `normalize.ts`, plus the field list in `constants.ts`.

## Commands

- `pnpm test` runs the fixture suite with no network and no credentials;
  `__fixtures__/helpers.ts` stubs Twitch, IGDB and the variables, and fake
  timers run every wait.
- `pnpm igdb:live` runs `igdb.live.ts` against real Twitch and IGDB (its own
  config, `vitest.igdb-live.mts`) and skips without credentials. It is the
  facts gate: the pinned game type ids, the Erotic theme id, the filter syntax,
  `search` with `where`, the count header, the cover URL and every cover
  ladder rung's real pixel width. Run it after any
  change to `constants.ts`, `catalog-filter.ts` or `query.ts`.
- Fixtures under `__fixtures__/` are IGDB responses captured on 2026-10-17.

## Known gaps

- The limiter bounds one server instance, not the fleet; several busy
  instances can exceed IGDB's limit and lean on 429 retries.
- A library batch is cached as a whole, so adding one game refetches every id.
- IGDB metadata is English only; there is no translation fallback.
