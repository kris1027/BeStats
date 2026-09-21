# AGENTS.md · lib/tmdb

The server only module every TMDB request goes through. Decided in
[spec 0002](../../docs/specs/0002-tmdb-integration-module/index.md); scope
feature 4. Runtime steps live in that spec's `verify.md`.

## What lives where

- `index.ts` is the only entry point a page may import. It exports the cached
  reads, `imageUrl`, `isTmdbNotFound`, `TmdbError`, `TMDB_ATTRIBUTION` and the
  normalized types. Everything else in this folder is internal.
- `reads.ts` holds every `use cache` wrapper and is the only file that imports
  `next/cache`.
- `client.ts` owns auth, the deadline, the retry budget, the status mapping and
  the failure logging. No other file calls `fetch`.
- `constants.ts` pins the base URLs, `en-US`, the 8 second timeout, the 3
  attempt ceiling, the concurrency cap of 8 and the attribution wording.
- `schemas.ts` (Zod), `normalize.ts` (TMDB shape to app shape), `types.ts` (the
  app's own types), `validation.ts` (input guards), `errors.ts`, `result.ts`,
  `images.ts`, `concurrency.ts`, then the reads themselves in `movies.ts`,
  `tv.ts`, `search.ts`, `genres.ts`, `batch.ts` and `show-episodes.ts`.

## Conventions this module holds to

- **Every read is a pair.** A private inner function does the request, the
  validation and the normalization; a thin exported wrapper in `reads.ts`
  carries `use cache` and calls `cacheLife` in its own scope. Tests call the
  inner half, so they never need Next's compiler transform.
- **A failure crosses the cache boundary as a plain object.** Next serializes
  whatever leaves a `use cache` scope, and a thrown `TmdbError` arrives as a
  bare `Error` with no `kind`. Cached functions return a `TmdbResult`
  (`result.ts`) and the wrapper rebuilds the error outside the scope. Never
  throw a `TmdbError` from inside a cached scope.
- **Lifetimes are explicit**: `days` for detail, `hours` for a season, `minutes`
  for query shaped reads and for any cached failure, `max` for genre lists.
- **Nothing user specific enters a cached scope.** No `cookies()`, no
  `headers()`, no search params in this folder.
- **No Zod schema is `.strict()`.** TMDB adds keys freely and an unknown key
  must never fail a read.
- **Missing stays missing.** A null path yields a null URL, an empty string
  yields null, and a rating or runtime TMDB reports as 0 yields null. Never
  zero, never placeholder text, never today's date.
- **Required means the page is wrong without it.** A missing required top level
  field raises `bad_response` with nothing partial. Inside an array, a
  malformed cast member is dropped; an episode is never dropped, because a
  missing episode would corrupt the progress counts features 14 to 16 derive.
  Only an episode's `id`, `seasonNumber` and `episodeNumber` are required.
- **The token is read in `env.ts` and nowhere else.** It travels as a Bearer
  header, never in a URL, a log line or an error message.
- **Errors carry a `kind`**, never a bare status. Pages branch through
  `isTmdbNotFound`, not through a hand rolled catch.
- Adding a field the app needs is a three place change: `schemas.ts`,
  `types.ts`, `normalize.ts`.

## Commands

- `pnpm test` runs the fixture suite. It needs no network and no real token;
  `__fixtures__/helpers.ts` stubs both.
- `pnpm tmdb:live` runs the opt in live check against the real API
  (`tmdb.live.ts`, its own config in `vitest.live.mts`). It needs a real
  `TMDB_READ_ACCESS_TOKEN` and skips without one. Its result is never a
  substitute for the fixture suite.
- Fixtures under `__fixtures__/` are a snapshot of TMDB at capture time. The
  live check is what notices when they drift.

## Known gaps

- The concurrency cap bounds one call inside one process, not the fleet. Revisit
  at scope feature 9 or 20.
- A cold read of a show with many seasons still costs one request per season.
  Storing episode data was ruled out in spec 0001.

_Drafted by /sync from the introducing change, worth a quick human pass._
