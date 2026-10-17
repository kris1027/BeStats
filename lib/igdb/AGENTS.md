# AGENTS.md · lib/igdb

The server only module every IGDB request goes through, the games catalog's
one trusted source. Decided in
[spec 0023](../../docs/specs/0023-igdb-integration-module/index.md); games
scope feature G1. It mirrors `lib/tmdb/` in shape but shares no code with it.

## What lives where

- `index.ts` is the only entry point a page may import. It exports the six
  cached reads (`getGame`, `getGamesByIds`, `searchGames`, `discoverGames`,
  `getGameGenres`, `getGamePlatforms`), `isIgdbNotFound`, `IgdbError`,
  `IgdbValidationError` and the types in the spec's design section.
  `surface.test.ts` fails on any other export, runtime or type.
- `reads.ts` holds every `use cache` wrapper and is the only file that imports
  `next/cache`.
- `client.ts` is the only `fetch` to IGDB: headers, the limiter, deadlines,
  retries, the 401 refresh, status mapping and failure logging.
- `token.ts` is the only `fetch` to Twitch: the app token, its memo and the
  single flight request.
- `env.ts` is the only file that names `IGDB_CLIENT_ID` and
  `IGDB_CLIENT_SECRET` (`security-boundary.test.ts`). The live check loads
  them through `loadIgdbCredentialsFromFile` for that reason.
- `query.ts` is the only builder of Apicalypse bodies; `catalog-filter.ts`
  holds the catalog rule; `limiter.ts`, `log.ts`, `constants.ts`,
  `schemas.ts`, `normalize.ts`, `types.ts`, `validation.ts`, `errors.ts`,
  `result.ts`, then the reads in `games.ts`, `batch.ts`, `search.ts`,
  `discover.ts` (both paging through `summary-page.ts`) and `reference.ts`.
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
- **Lifetimes**: `hours` for `getGame` and `getGamesByIds`, `minutes` for
  search and discover, `max` for the reference lists. A failure takes
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
  escaped. Numbers go through `int` and `intList`.
- **Missing stays missing**: an absent value, a blank string, and a rating or
  rating count of 0 become `null`. `communityRating` is IGDB's `rating` / 10 at
  full precision, and always labelled as the community rating on a page.
- **Every filter is in the query**, so every result meets it and IGDB's
  `X-Count` header is a truthful `totalResults` (null when absent). A page asks
  for 21 and returns 20 to know `hasNextPage`.
- **The module never reads the clock for a filter.** Discover callers pass UTC
  days; only the year bound of a filter reads the current year.
- Adding a field is a three place change: `schemas.ts`, `types.ts`,
  `normalize.ts`, plus the field list in `constants.ts`.

## Commands

- `pnpm test` runs the fixture suite with no network and no credentials;
  `__fixtures__/helpers.ts` stubs Twitch, IGDB and the variables, and fake
  timers run every wait.
- `pnpm igdb:live` runs `igdb.live.ts` against real Twitch and IGDB (its own
  config, `vitest.igdb-live.mts`) and skips without credentials. It is the
  facts gate: the pinned game type ids, the Erotic theme id, the filter syntax,
  `search` with `where`, the count header and the cover URL. Run it after any
  change to `constants.ts`, `catalog-filter.ts` or `query.ts`.
- Fixtures under `__fixtures__/` are IGDB responses captured on 2026-10-17.

## Known gaps

- The limiter bounds one server instance, not the fleet; several busy
  instances can exceed IGDB's limit and lean on 429 retries.
- A library batch is cached as a whole, so adding one game refetches every id.
- IGDB metadata is English only; there is no translation fallback.
