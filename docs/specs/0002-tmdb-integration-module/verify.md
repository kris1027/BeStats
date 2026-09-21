# Verify: TMDB integration module · spec 0002 · updated 2026-09-21
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Most steps need a real `TMDB_READ_ACCESS_TOKEN` in `.env.local`. The fixture
suite deliberately does not: it stubs the token and the network, which is what
lets it run in CI.

## UI / manual

A throwaway route is the cheapest way to run the render steps. Create
`app/tmdb-check/page.tsx`, call the reads named below, render the values, then
delete the route again.

- [x] Render `getMovie(550)` → title `Fight Club`, year 1999, 139 minutes, a TMDB rating near 8.4, a cast list starting with Edward Norton, and a poster that loads through `next/image` → AC-6, AC-7, AC-13, AC-20, AC-27
- [x] Inspect that poster URL → it starts `https://image.tmdb.org/t/p/w500/`, the backdrop `w1280`, a cast profile `w185`, an episode still `w300` → AC-20, AC-27
- [x] Render `getTvShow(1396)` → name `Breaking Bad`, status `Ended` shown verbatim, and the seasons array `0, 1, 2, 3, 4, 5` from TMDB's native payload with no second request → AC-6, AC-7
- [x] Render `getSeason(1396, 1)` → 7 episodes, the first named `Pilot` airing `2008-01-20`, and every episode carrying `showId` 1396, its season number and its episode number → AC-14
- [x] Render `getSeason(1396, 0)` → the specials read normally, and the season 0 summary on the show reports `isSpecials` true → AC-15
- [x] Render `getShowEpisodes(1396)` → 62 episodes, `complete` true, `failedSeasonNumbers` empty, and no season 0 episode in the list → AC-25
- [ ] Render `getMovie(999999999)` in a page that catches with `isTmdbNotFound` → Next's `notFound()` renders, not a crash and not an empty movie → AC-10, AC-26
- [x] Make a Client Component (`"use client"`) import anything from `@/lib/tmdb` and run `pnpm build` → the build fails naming `server-only`. Remove the probe afterwards → AC-2

## Commands

- [x] `pnpm build` → succeeds with `cacheComponents: true`, and a page using `getSeason` reports revalidate `1h` / expire `1d` in the route table → AC-4, AC-5
- [x] `TOKEN=$(grep '^TMDB_READ_ACCESS_TOKEN=' .env.local | cut -d= -f2-); grep -rl "$TOKEN" .next/static` → no matches → AC-2
- [x] `grep -rl "TMDB_READ_ACCESS_TOKEN" .next/static` → no matches → AC-1, AC-2
- [x] `pnpm test` → 64 tests pass with no network and no real token → AC-23, and the failure paths of AC-9 to AC-13
- [x] `pnpm tmdb:live` → 5 live checks pass against the real API; with the token removed from the environment and `.env.local`, the suite skips instead of failing → AC-24
- [x] `pnpm typecheck` → passes, which is also what proves the `@ts-expect-error` in `lib/tmdb/surface.test.ts` is real: `searchMovies` rejects a genre filter while `discoverMovies` accepts one → AC-16
- [x] `pnpm lint:ci` → passes → repo convention

## Value sourcing checks

One per row of the spec's value sourcing table, exercising the edge that breaks
if the source is wrong.

- [x] Credential: unset `TMDB_READ_ACCESS_TOKEN` and call any read → the error names the variable and points at `.env.local`; it is not a TMDB 401 → AC-1
- [x] Header, never a URL: in `lib/tmdb/client.test.ts`, the request carries `Authorization: Bearer …` and the URL carries no `api_key` → AC-3
- [x] Language: every request URL carries `language=en-US` → AGENTS.md section 3
- [x] Timeout: the request carries a non aborted `AbortSignal`, and an aborted attempt maps to kind `timeout` with exactly one attempt → AC-11
- [x] Retry delay: a 429 carrying `Retry-After: 2` waits 2000ms; a 429 with no header falls back to the backoff → AC-12
- [x] Attempt ceiling: a persistent 500 makes exactly 3 attempts; a 404 and a 401 make exactly 1 → AC-12
- [x] Cache key: no read in `lib/tmdb/reads.ts` reads `cookies()`, `headers()` or a search param inside a `use cache` scope → AGENTS.md section 11
- [x] Image size: a null poster path yields null, not a URL ending in `/null` → AC-13, AC-20
- [x] Season 0 exclusion: `getShowEpisodes` on a show whose season 0 has episodes returns none of them, while `getSeason(showId, 0)` returns them all → AC-15, AC-25
- [x] `complete`: force one season read to fail → `complete` false, that season number listed, the other seasons' episodes still returned, nothing raised → AC-25
- [x] Empty text: a movie whose overview is `""` returns `overview` null, never `""` and never placeholder copy → AC-13
- [x] Derived year: a movie with `release_date` `""` returns both `releaseDate` and `releaseYear` null; a movie with `1999-10-15` returns 1999 regardless of the machine's timezone (set `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway` and re-run `pnpm test`) → AC-13
- [x] TMDB rating: a title with `vote_average` 0 returns `tmdbRating` null, not 0, so the UI never shows an invented 0/10 → AC-13
- [x] `showId` injection: every episode of `getSeason(1396, 1)` carries `showId` 1396 although TMDB's payload never sends it → AC-14
- [x] `airDate`: an episode whose `air_date` is null returns null and is still present in the list → AC-14
- [x] Pagination: a search response's `page`, `total_pages` and `total_results` come back unchanged, never recomputed → AC-18
- [x] `include_adult`: every search and discover request URL carries `include_adult=false` → AC-17
- [x] Discover parameter names: movies use `primary_release_year`, TV uses `first_air_date_year`, both use `with_genres` and `vote_average.gte` → AC-16
- [x] `missingIds`: a batch read where one id 404s returns the rest in `found` and that id in `missingIds`; a batch read hitting a 401 raises instead of returning a short list → AC-19
- [x] Concurrency: a batch of 25 ids never exceeds 8 in flight → AC-19
- [x] Log record: a failing read logs endpoint, status, kind, attempt and elapsed time, and no line contains the token or the word `authorization`; a successful read logs nothing → AC-21
- [x] Attribution: `TMDB_ATTRIBUTION` equals TMDB's required wording exactly → AC-22

## Acceptance-criteria coverage

- AC-1 · credential steps and the `.env.example` entry · AC-2 · the three bundle and build steps · AC-3 · header step
- AC-4, AC-5 · `pnpm build` route table step · AC-6, AC-7 · the movie and show render steps
- AC-8 · unknown keys case in `lib/tmdb/client.test.ts` · AC-9 · the malformed credit, missing title and missing episode id cases in `lib/tmdb/reads.test.ts`
- AC-10 · `notFound()` step and the error mapping cases · AC-11 · timeout step · AC-12 · retry delay and attempt ceiling steps
- AC-13 · empty text, derived year, rating and image steps · AC-14 · season identity, `showId` and `airDate` steps · AC-15 · specials steps
- AC-16 · `pnpm typecheck` and discover parameter steps · AC-17 · `include_adult` step · AC-18 · pagination step
- AC-19 · `missingIds` and concurrency steps · AC-20, AC-27 · image URL and size steps · AC-21 · log record step
- AC-22 · attribution step · AC-23 · `pnpm test` step · AC-24 · `pnpm tmdb:live` step · AC-25 · `getShowEpisodes` steps · AC-26 · `notFound()` step
