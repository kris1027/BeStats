# AGENTS.md · lib/tmdb

The server only module every TMDB request goes through, plus the one browser
file, `image-loader.ts`, that `next.config.ts` hands to `next/image`. Decided in
[spec 0002](../../docs/specs/0002-tmdb-integration-module/index.md); scope
feature 4. Runtime steps live in that spec's `verify.md`.

## What lives where

- `index.ts` is the only entry point a page may import. It exports the cached
  reads, `imageUrl`, `isTmdbNotFound`, `TmdbError`, `TMDB_ATTRIBUTION` and the
  normalized types. Everything else in this folder is internal, except
  `image-loader.ts` (`'use client'`), which only the `loaderFile` setting
  imports, and the pure `images.ts` it reads.
- `reads.ts` holds every `use cache` wrapper and is the only file that imports
  `next/cache`.
- `client.ts` owns auth, the deadline, the retry budget, the status mapping and
  the failure logging. No other file calls `fetch`.
- `constants.ts` pins the base URLs, `en-US`, the 8 second timeout, the 3
  attempt ceiling, the concurrency cap of 8 and the attribution wording.
- `schemas.ts` (Zod), `normalize.ts` (TMDB shape to app shape), `types.ts` (the
  app's own types), `validation.ts` (input guards), `errors.ts`, `result.ts`,
  `images.ts`, `concurrency.ts`, then the reads themselves in `movies.ts`,
  `tv.ts`, `search.ts`, `genres.ts`, `batch.ts`, `show-episodes.ts` and
  `lists.ts` (TMDB's trending, dated and top rated lists, spec 0021), and
  `extras.ts` with `normalize-extras.ts` (a title's videos, recommendations,
  watch providers and age ratings, spec 0022).

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
- **Lifetimes are explicit**: `days` for detail, `hours` for a season and for
  the ready made lists (spec 0021, AC-17), `minutes` for query shaped reads, `max` for genre lists. A cached failure takes
  `failureProfile(kind)` from `result.ts`: `seconds` for `timeout`,
  `rate_limited` and `upstream` (so a retry really retries), `minutes` for the
  rest.
- **Nothing user specific enters a cached scope.** No `cookies()`, no
  `headers()`, no search params in this folder.
- **Title extras are their own read, never appended to the detail read.**
  `getMovieExtras` and `getTvExtras` (`hours`) carry every country's watch
  providers and age ratings, so the cache holds no request state and the page
  picks its region afterwards. Appending them to `getTvShow` would multiply
  their cost by every tracked show the library pages read (spec 0022).
- **No Zod schema is `.strict()`.** TMDB adds keys freely and an unknown key
  must never fail a read.
- **Missing stays missing.** A null path yields a null URL, an empty string
  yields null, and a rating or runtime TMDB reports as 0 yields null. Never
  zero, never placeholder text, never today's date.
- **Required means the page is wrong without it.** A missing required top level
  field raises `bad_response` with nothing partial. Inside an array, a
  malformed cast member or translation is dropped; an episode is never dropped, because a
  missing episode would corrupt the progress counts features 14 to 16 derive.
  Only an episode's `id`, `seasonNumber` and `episodeNumber` are required.
- **Key a cast list on `creditId`, never `personId`.** TMDB can list one actor
  once per role, so `personId` repeats within a list; `creditId` is TMDB's
  `credit_id`, unique per role.
- **The token is read in `env.ts` and nowhere else.** It travels as a Bearer
  header, never in a URL, a log line or an error message.
- **A detail read by id does not exclude adult titles.** Discover sends
  `include_adult=false`, but `getMovie` can return one, so a page checks
  `movie.adult` and answers not found (spec 0006, AC-9).
- **`Movie.overview` is English, else the original language translation, else
  null**, with `overviewLanguage` naming which. Never another language
  (`resolveOverview` in `normalize.ts`, spec 0006, AC-5).
- **Errors carry a `kind`**, never a bare status. Pages branch through
  `isTmdbNotFound`, not through a hand rolled catch.
- **Images skip Vercel's optimizer.** `image-loader.ts` (`'use client'`, the
  `loaderFile` in `next.config.ts`) maps a `next/image` width onto TMDB's own
  sizes, never above the size `images.ts` pinned, so the browser loads
  straight from TMDB's CDN (prompts/tmdb-image-loader.md). `original` is
  requested only by the landing hero, the one exception: the loader serves it
  whole past the `w1280` rung and a ladder size below it
  (prompts/home-hero-backdrop-quality.md). A new
  image field keeps a size from `TMDB_IMAGE_WIDTHS` in `images.ts`, the one
  list the loader and `TmdbImageSize` share. `h632`, another host or a size
  off that list passes through unresized, and Next's dev warning ("does not
  implement width") names it.
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
