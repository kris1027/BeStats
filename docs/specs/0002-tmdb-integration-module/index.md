# 0002. TMDB integration module

**Date**: 2026-09-20
**Status**: Proposed

Scope feature: [4. TMDB integration module](../../scope/scope.md) · Beta tier

## Summary

This decides how BeStats talks to TMDB, the external service that supplies every movie, TV show, season and episode detail the app displays. One server only module holds all of it: it authenticates with a token the browser never sees, asks TMDB for English metadata, checks the response is shaped the way the app expects, and hands back the app's own clean types rather than TMDB's raw JSON. Results are cached by Next.js, with different lifetimes for different kinds of data, so a newly aired episode shows up within hours while a genre list is fetched almost never. When TMDB is slow or refuses a request the module retries briefly and then raises a typed error, so a page shows a real failure state instead of crashing or quietly inventing data.

## Requirements

**User stories**:
- As a visitor, I want movie and TV pages to load fast and consistently, so that browsing the catalog feels immediate even though every detail comes from a service outside this app.
- As a visitor, I want a page with incomplete TMDB data to tell me honestly what is missing, so that I am never shown a made up title, date or rating.
- As a signed in user, I want a newly aired episode to appear without waiting for a redeploy, so that I can mark it watched the day it airs.
- As a developer, I want one module that owns every TMDB request, so that auth, caching, validation and error handling are decided once rather than re-invented on each page.
- As a developer, I want TMDB's naming and its nulls to stop at the module boundary, so that a change on TMDB's side is a one file change rather than a search across every component.

**Acceptance criteria** (each is independently checkable):

- **AC-1**: The TMDB credential is read from the server only environment variable `TMDB_READ_ACCESS_TOKEN`, validated at module load by a Zod schema, and a missing or empty value fails loudly at startup rather than surfacing later as a confusing 401. `.env.example` is committed with a placeholder and a description, and `.gitignore` carries the `!.env.example` exception that `AGENTS.md` section 11 requires.
- **AC-2**: The module imports the `server-only` package, so importing any part of it from a Client Component fails the build. The token appears nowhere in the built browser bundle, verified by searching the client output of a production build.
- **AC-3**: Every TMDB request carries the credential as an `Authorization: Bearer` header. The token never appears in a URL, a query string, a log line or an error message.
- **AC-4**: `cacheComponents: true` is set in `next.config.ts`, `pnpm build` succeeds with it enabled, and every exported read function in the module is a `use cache` function that calls `cacheLife` explicitly. No read relies on the implicit `default` profile.
- **AC-5**: Cache lifetimes match the resource classes in the design section: `days` for movie and TV detail, `hours` for the season read, `minutes` for search and discover, `max` for genre lists. The season read's `hours` lifetime is what makes a newly aired episode appear without a deploy, satisfying the `AGENTS.md` section 12 rule against an indefinitely cached catalog.
- **AC-6**: `getMovie` and `getTvShow` each perform exactly one HTTP request to TMDB, using `append_to_response=credits` to collect the cast in the same call. TMDB's `/3/tv/{id}` response already carries the `seasons` summary array natively, so nothing is appended for it. The appended set stays within TMDB's documented limit of 20 items.
- **AC-7**: Every exported read returns the module's own normalized types. No TMDB field name in `snake_case`, and no raw TMDB response object, is reachable from outside the module's entry point.
- **AC-8**: Responses are validated with Zod against the fields the app actually reads. Unknown keys TMDB adds are ignored rather than causing a failure, so no schema uses Zod's `.strict()`. A field that is genuinely optional is typed optional and parses when absent.
- **AC-9**: Validation strictness differs by level, deliberately. A **top level** required field that is absent raises a `TmdbError` with kind `bad_response`, returning nothing partial and substituting no default. An **array item** that fails validation is handled per collection instead: a `CastMember` that fails is dropped from `cast` and the read succeeds, because one malformed credit must not blank a whole movie page. An `Episode` is never dropped, because a missing episode would corrupt the progress counts features 14 to 16 derive; instead only its identity fields (`id`, `seasonNumber`, `episodeNumber`) are required, and every display field including `name` is nullable. An episode missing an identity field raises `bad_response` for the whole season read.
- **AC-10**: Failures raise a `TmdbError` carrying a `kind` from the set `not_found`, `unauthorized`, `rate_limited`, `timeout`, `upstream`, `bad_response`, plus the HTTP status where one exists. A TMDB 404 maps to `not_found` so a caller can turn it into a Next `notFound()`.
- **AC-11**: Every request carries a timeout. A request that exceeds it aborts and raises kind `timeout` rather than hanging the render.
- **AC-12**: A 429, a 5xx or a network level failure is retried, with a pinned maximum of **3 attempts in total for one logical read**, meaning the first try plus at most 2 retries. Backoff honours a `Retry-After` header when TMDB sends one. A 401 and a 404 are never retried, so they cost exactly one attempt. The attempt number appears in the logs.
- **AC-13**: Missing metadata is reported as missing, never invented. A null poster path yields a null image URL, an empty overview yields null, and an absent rating yields null rather than zero.
- **AC-14**: A season read returns, for every episode, the four values `user_episode_state` stores in spec 0001: the TMDB episode id, the parent show id, the season number and the episode number. An episode with no air date returns `airDate` as null, never coerced to a date or to today.
- **AC-15**: Season 0 is readable and returns `isSpecials` as true on its summary. The module applies no product rule about specials; it only reports the season number honestly.
- **AC-16**: `searchMovies` and `searchTvShows` accept only the parameters TMDB's search endpoints support (query, page, year, language, region, include_adult). Their types make passing a genre or a minimum rating filter to search a compile error. `discoverMovies` and `discoverTvShows` accept genre, year and minimum rating filters.
- **AC-17**: Every search and discover request sends `include_adult=false`.
- **AC-18**: The `page` input is validated as a positive integer. The module returns TMDB's `page`, `totalPages` and `totalResults` unchanged and never substitutes a computed or estimated count.
- **AC-19**: `getMoviesByIds` and `getTvShowsByIds` fetch with a bounded concurrency cap rather than firing one request per id at once. An id that TMDB reports as not found is omitted from the results and reported to the caller; a systemic failure such as `unauthorized` or an exhausted `rate_limited` retry raises rather than returning a silently short list.
- **AC-20**: `imageUrl(path, size)` builds a URL from the hardcoded TMDB image base and an allowed size, and returns null for a null or empty path. `next.config.ts` permits `image.tmdb.org` in `images.remotePatterns` so `next/image` can render them.
- **AC-21**: Failures and retries are logged server side as structured records containing the endpoint path, HTTP status, error kind, attempt number and elapsed time. Successful requests are not logged. No log line contains the `Authorization` header, the token, or any user identifier.
- **AC-22**: The module exports the exact attribution wording TMDB's terms require: "This product uses the TMDB API but is not endorsed or certified by TMDB." Where it is displayed is out of scope here and belongs to scope feature 18.
- **AC-23**: Each read is written as two functions: an inner uncached function holding the request, validation and normalization logic, and a thin exported wrapper carrying `use cache` and `cacheLife`. The tests call the inner functions, so they do not depend on Next's compiler transform for the `use cache` directive being present in a plain test runner. Fixture based unit tests cover normalization, validation, error mapping, retry behaviour, image URL building and both batch helpers, and run green with no network access and no token present.
- **AC-24**: A separate, opt in live check hits the real TMDB API and is clearly labelled as such. It is skipped when no token is present and its result is never reported as a substitute for the fixture tests, nor the fixture tests reported as a live integration result.
- **AC-25**: `getShowEpisodes(showId)` returns every episode of every **regular** season of one show, read under the same concurrency cap as the other batch helpers, together with an explicit `complete: boolean`. `complete` is true only when every regular season was read successfully. If any season read fails, `complete` is false and the successfully read episodes are still returned. Season 0 is excluded from this read, matching the `AGENTS.md` section 7 rule that specials are outside overall TV progress. This is the read features 14, 15 and 16 build on, and the `complete` flag is what lets scope feature 16 refuse to mark a show Completed on partial metadata.
- **AC-26**: The module exports `isTmdbNotFound(error: unknown): boolean`, so a page turns a missing title into Next's `notFound()` through one shared helper rather than each page hand rolling a catch that might swallow other error kinds.
- **AC-27**: Each normalized image field is built with a pinned default size rather than a size the caller chooses: `posterUrl` uses `w500`, `backdropUrl` uses `w1280`, `profileUrl` uses `w185`, `stillUrl` uses `w300`. `imageUrl` remains exported so a page can request a different size deliberately. These defaults are a starting point and should be checked against the reference designs in `design/` when scope feature 5 builds the UI foundation.

## Decision

**Chosen option**: Option 2: One server only module, normalized types, cached with Cache Components.

All TMDB access goes through a single server only module at `lib/tmdb/` that authenticates with a v4 Read Access Token as a Bearer header, requests English metadata over native `fetch`, validates responses with Zod on the fields the app reads, returns the module's own normalized domain types, caches each read with `use cache` and an explicit per resource `cacheLife`, and raises a typed `TmdbError` on failure.

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning, the options weighed, the research findings and the sources: see [rationale.md](rationale.md).

## Feature design

### Data model sketch

There is no database schema in this spec. Nothing from TMDB is stored, per the decision recorded in spec 0001. The model below is the set of TypeScript types the module owns and returns, which is the "TMDB response shape" that spec 0001 explicitly deferred to this spec.

**Shared types**

| Type | Fields |
|---|---|
| `Genre` | `id: number`, `name: string` |
| `CastMember` | `personId: number`, `name: string`, `character: string`, `profileUrl: string \| null`, `order: number` |
| `Paged<T>` | `page: number`, `results: T[]`, `totalPages: number`, `totalResults: number` |

**`MovieSummary`** · the list shape

| Field | Type | Note |
|---|---|---|
| `id` | `number` | TMDB movie id |
| `title` | `string` | required; a movie with no title is a `bad_response` |
| `posterUrl` | `string \| null` | already built, null when TMDB has no poster |
| `releaseDate` | `string \| null` | TMDB's date string, unparsed, null when absent |
| `releaseYear` | `number \| null` | derived from `releaseDate`, null when absent |
| `overview` | `string \| null` | empty string from TMDB normalizes to null |
| `tmdbRating` | `number \| null` | TMDB community rating. Never the user's personal rating |
| `tmdbVoteCount` | `number` | 0 when TMDB reports none |

**`Movie`** · `MovieSummary` plus

| Field | Type | Note |
|---|---|---|
| `backdropUrl` | `string \| null` | |
| `originalTitle` | `string` | |
| `originalLanguage` | `string` | TMDB language code |
| `tagline` | `string \| null` | empty normalizes to null |
| `runtimeMinutes` | `number \| null` | null when TMDB reports 0 or absent |
| `genres` | `Genre[]` | may be empty |
| `cast` | `CastMember[]` | from the appended credits, ordered by TMDB's `order` |

**`TvShowSummary`** · same shape as `MovieSummary` with `name` for `title`, `firstAirDate` for `releaseDate` and `firstAirYear` for `releaseYear`.

**`TvShow`** · `TvShowSummary` plus

| Field | Type | Note |
|---|---|---|
| `backdropUrl` | `string \| null` | |
| `status` | `string` | TMDB's show status, for example `Ended`, `Returning Series`, `Canceled`. Reported verbatim; scope feature 16 owns what it means |
| `inProduction` | `boolean` | |
| `lastAirDate` | `string \| null` | |
| `numberOfSeasons` | `number` | TMDB's count, which excludes season 0 inconsistently; the `seasons` array is authoritative |
| `numberOfEpisodes` | `number` | |
| `genres` | `Genre[]` | |
| `cast` | `CastMember[]` | |
| `seasons` | `SeasonSummary[]` | from the appended season list |

**`SeasonSummary`**

| Field | Type | Note |
|---|---|---|
| `seasonNumber` | `number` | 0 is specials |
| `name` | `string` | |
| `episodeCount` | `number` | |
| `airDate` | `string \| null` | |
| `posterUrl` | `string \| null` | |
| `isSpecials` | `boolean` | derived: `seasonNumber === 0` |

**`SeasonDetail`**

| Field | Type | Note |
|---|---|---|
| `seasonNumber` | `number` | |
| `name` | `string` | |
| `overview` | `string \| null` | |
| `airDate` | `string \| null` | |
| `posterUrl` | `string \| null` | |
| `episodes` | `Episode[]` | in TMDB's order, which is episode number ascending |

**`Episode`**

| Field | Type | Note |
|---|---|---|
| `id` | `number` | TMDB episode id. Required; the primary key half of `user_episode_state` |
| `showId` | `number` | injected by the module from the request argument, since TMDB's season payload does not repeat it |
| `seasonNumber` | `number` | |
| `episodeNumber` | `number` | |
| `name` | `string \| null` | nullable on purpose. An episode is never dropped for a missing display field, because a missing episode would corrupt the progress counts in features 14 to 16. Only the three identity fields above are required |
| `overview` | `string \| null` | |
| `airDate` | `string \| null` | **null means TMDB has no confirmed date.** Never coerced. Scope features 12 and 14 own the eligibility rule built on it |
| `stillUrl` | `string \| null` | |
| `runtimeMinutes` | `number \| null` | |
| `tmdbRating` | `number \| null` | |

**`TmdbError`** · a class extending `Error`

| Field | Type | Note |
|---|---|---|
| `kind` | `'not_found' \| 'unauthorized' \| 'rate_limited' \| 'timeout' \| 'upstream' \| 'bad_response'` | |
| `status` | `number \| null` | the HTTP status when one exists |
| `endpoint` | `string` | the TMDB path, never the full URL with credentials |

**`ShowEpisodes`** · the return of `getShowEpisodes`

| Field | Type | Note |
|---|---|---|
| `episodes` | `Episode[]` | every episode of every regular season, ordered by season number then episode number. Season 0 is excluded |
| `complete` | `boolean` | true only when every regular season was read successfully. False means some season failed and the list is partial |
| `failedSeasonNumbers` | `number[]` | the seasons that could not be read, empty when `complete` is true |

### State transitions

No state machine. This module is stateless: every read is a pure function of its arguments plus TMDB's current response. The only lifecycle is the cache entry's own, governed by `cacheLife`.

### API surface

There are no HTTP endpoints. The surface is the set of functions exported from `lib/tmdb/index.ts`, all server only, all `async`, all cached except where noted.

| Function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getMovie` | `GET /3/movie/{id}?append_to_response=credits` | `id: number` (req, positive int) | `Movie` | Bearer, server only | `not_found` on a TMDB 404, `bad_response` on a missing required field |
| `getTvShow` | `GET /3/tv/{id}?append_to_response=credits` | `id: number` (req) | `TvShow` | Bearer, server only | `not_found`, `bad_response` |
| `getSeason` | `GET /3/tv/{id}/season/{n}` | `showId: number` (req), `seasonNumber: number` (req, 0 or above) | `SeasonDetail` | Bearer, server only | `not_found` when the show or the season does not exist |
| `getShowEpisodes` | one `getTvShow` then many bounded `getSeason` calls | `showId: number` (req) | `ShowEpisodes` | Bearer, server only | `not_found` when the show itself does not exist; a failing season sets `complete` false rather than raising |
| `searchMovies` | `GET /3/search/movie` | `query: string` (req, non empty), `page: number` (opt, default 1) | `Paged<MovieSummary>` | Bearer, server only | `upstream`, `rate_limited` |
| `searchTvShows` | `GET /3/search/tv` | `query: string` (req), `page: number` (opt) | `Paged<TvShowSummary>` | Bearer, server only | `upstream`, `rate_limited` |
| `discoverMovies` | `GET /3/discover/movie` | `genreIds: number[]` (opt), `year: number` (opt), `minRating: number` (opt), `page: number` (opt) | `Paged<MovieSummary>` | Bearer, server only | `upstream`, `rate_limited` |
| `discoverTvShows` | `GET /3/discover/tv` | same as above, with year meaning first air year | `Paged<TvShowSummary>` | Bearer, server only | `upstream`, `rate_limited` |
| `getMovieGenres` | `GET /3/genre/movie/list` | none | `Genre[]` | Bearer, server only | `upstream` |
| `getTvGenres` | `GET /3/genre/tv/list` | none | `Genre[]` | Bearer, server only | `upstream` |
| `getMoviesByIds` | many `getMovie` calls, bounded | `ids: number[]` (req) | `{ found: MovieSummary[], missingIds: number[] }` | Bearer, server only | raises on `unauthorized` or exhausted `rate_limited`; a per id 404 lands in `missingIds` |
| `getTvShowsByIds` | many `getTvShow` calls, bounded | `ids: number[]` (req) | `{ found: TvShowSummary[], missingIds: number[] }` | Bearer, server only | as above |
| `imageUrl` | none, pure | `path: string \| null` (req), `size: TmdbImageSize` (req) | `string \| null` | not applicable, not cached | none |
| `isTmdbNotFound` | none, pure | `error: unknown` (req) | `boolean` | not applicable, not cached | none |
| `TMDB_ATTRIBUTION` | none, constant | none | `string` | not applicable | none |

**Every cached read is two functions.** Each entry above that is cached is implemented as an inner uncached function holding the request, validation and normalization work, plus a thin exported wrapper that carries `use cache` and its `cacheLife` call. The wrapper is what pages import; the inner function is what the tests call, so the test suite does not depend on Next's compiler transform for `use cache` being active in a plain test runner. `getShowEpisodes` is cached at the wrapper level as well, and its inner function reuses the cached `getSeason` wrappers so a season already fetched for a page is not fetched again.

**`getShowEpisodes` is the read the TV product rules stand on.** Features 14, 15 and 16 all need every regular episode's air date across a whole show, which no single TMDB endpoint returns. Without this function each of them would fan out over seasons on its own, uncapped, and none would be able to tell a complete fetch from a partial one. The `complete` flag exists specifically so scope feature 16 can honour the `AGENTS.md` section 9 rule that a partial fetch must never establish completion.

**The search and discover split is deliberate and load bearing.** TMDB's search endpoints accept a free text query and almost nothing else; the genre and minimum rating filters live only on discover, which in turn accepts no free text query. The two function families therefore take different parameters, and the types are written so that passing `genreIds` to `searchMovies` does not compile. Scope feature 11 owns what to do when a user asks for both at once, including the rule in `AGENTS.md` section 10 that a filtered result list must never present an unfiltered total as its count. This module deliberately does not paper over the gap.

### Value sourcing

| Action | Value produced, computed or displayed | Source |
|---|---|---|
| any request | the credential | `TMDB_READ_ACCESS_TOKEN`, read server side at module load and validated by Zod. Never a client value, never a URL parameter |
| any request | the base URL | the constant `https://api.themoviedb.org/3`, hardcoded |
| any request | the language | the constant `en-US`, sent as the `language` parameter on every call. `AGENTS.md` section 3 requires English first |
| any request | the timeout deadline | an `AbortSignal` built from the module's timeout constant, 8 seconds per attempt |
| any request | the retry delay | TMDB's `Retry-After` header when present; otherwise exponential backoff of 250ms then 750ms with jitter. Whether TMDB sends the header is unverified, so both paths are implemented |
| any cached read | the cache key | the function identity plus its arguments, computed by Next.js. The module passes no runtime value such as a cookie or a header into a cached scope |
| any cached read | the lifetime | the `cacheLife` profile named in the table below, called explicitly inside each `use cache` scope |
| build any image URL | `posterUrl`, `backdropUrl`, `profileUrl`, `stillUrl` | `imageUrl(path, size)` over the hardcoded base `https://image.tmdb.org/t/p/`. Null path yields null |
| build any image URL | the size used for each field | pinned module constants, not a caller choice: `w500` for posters, `w1280` for backdrops, `w185` for profiles, `w300` for stills. To be checked against `design/` at scope feature 5 |
| read all of a show's episodes | `episodes` | the concatenation of every regular season's `getSeason` result, ordered by season number then episode number. Season 0 is excluded here and only here |
| read all of a show's episodes | the list of season numbers to read | `TvShow.seasons`, filtered to `isSpecials === false`. One `getTvShow` call supplies it, since TMDB's `/3/tv/{id}` returns the season summaries natively |
| read all of a show's episodes | `complete`, `failedSeasonNumbers` | derived from whether every regular season read succeeded. Scope feature 16 must treat `complete === false` as a bar to automatic completion, per `AGENTS.md` section 9 |
| read a movie or show | `overview`, `tagline` | TMDB's field, with an empty string normalized to null. Never replaced with placeholder copy |
| read a movie or show | `releaseYear`, `firstAirYear` | derived by taking the leading four characters of TMDB's date string, or null when the date is absent. Not a timezone aware parse, because TMDB supplies a plain date with no time |
| read a movie or show | `tmdbRating`, `tmdbVoteCount` | TMDB's `vote_average` and `vote_count`. Always labelled as TMDB's rating by the consuming UI; the user's personal rating comes from Supabase per spec 0001 |
| read a season | `Episode.showId` | injected from the `showId` argument the caller passed. TMDB's season payload does not repeat it |
| read a season | `Episode.airDate` | TMDB's `air_date`, passed through unchanged, null when absent. The eligibility rule built on it belongs to scope features 12 and 14, and the date boundary choice belongs to feature 14 |
| read a season | `isSpecials` | derived as `seasonNumber === 0`. TMDB does not supply a flag |
| search or discover | `page`, `totalPages`, `totalResults` | TMDB's response envelope, returned unchanged. Never recomputed, never estimated |
| search or discover | `include_adult` | the constant `false`, sent on every call |
| discover | the genre, year and rating parameters | mapped to `with_genres`, `primary_release_year` for movies and `first_air_date_year` for TV, and `vote_average.gte`. The exact `/discover/tv` parameter names are unverified and must be confirmed against TMDB's reference during the build |
| batch read | `missingIds` | the ids whose individual read raised `not_found`, collected rather than thrown |
| batch read | the concurrency cap | the module's constant, 8 in flight at once |
| any failure | the log record | the endpoint path, status, kind, attempt number and elapsed milliseconds. The `Authorization` header, the token and any user identifier are excluded by construction |
| attribution | the required wording | TMDB's terms of use, quoted verbatim as a constant |

### Key invariants

- The token is read only on the server, only from the environment, and is never interpolated into a URL, a log line or an error message.
- `server-only` is imported by the module entry point, so a Client Component import fails the build rather than shipping the token.
- Every exported read is a `use cache` function with an explicit `cacheLife` call inside its own scope.
- No runtime API (`cookies`, `headers`, `searchParams`) is read inside any cached scope in this module. Nothing user specific ever enters a shared cache, which is what keeps `AGENTS.md` section 11 satisfied at this layer.
- Only normalized types cross the module boundary. A TMDB `snake_case` field name never appears outside `lib/tmdb/`.
- Missing data is null. The module never substitutes zero, an empty string, today's date or placeholder text for something TMDB did not supply.
- A required top level field that is absent raises rather than returning a partial object. Inside an array, a malformed cast member is dropped and an episode is never dropped, because a missing episode would silently change a progress count.
- No Zod schema uses `.strict()`. TMDB adds fields freely and an unknown key must never fail a read.
- Every cached read is a thin `use cache` wrapper over an inner uncached function, so the logic is reachable by tests without Next's transform.
- `getShowEpisodes` never reports `complete` as true unless every regular season was read. A partial result is returned with `complete` false rather than raised, and the caller decides what that means.
- A 404 and a 401 are never retried. Only 429, 5xx and network level failures are.
- Every request has a deadline; no request can hang a render indefinitely.
- `Episode.airDate` being null and an episode being unaired are different facts, and the module reports the former without deciding the latter.
- Search functions cannot accept discovery filters, enforced by their types rather than by a comment.
- Pagination values are TMDB's own and are never recomputed.

### Security model

This module reads public catalog metadata only. No user data passes through it and nothing it returns is private.

- **Credential**: one server only secret, `TMDB_READ_ACCESS_TOKEN`, a TMDB v4 Read Access Token. It grants read access to public catalog data and nothing else. It is never prefixed `NEXT_PUBLIC_`, never sent to the browser and never written to a log.
- **Boundary enforcement**: the `server-only` package makes an accidental Client Component import a build failure, which is a structural guarantee rather than a naming convention. AC-2 additionally verifies absence from the built client bundle.
- **Caching and privacy**: every cache entry in this module is public catalog data keyed only on the function arguments. Because no cached scope reads a cookie or a header, no per user response can land in a shared cache. Private user state is cached separately or not at all, and that boundary belongs to spec 0001 and to scope features 8 and 9.
- **Input validation**: ids, season numbers and page numbers are validated by Zod as positive integers before a URL is built, so a hostile route parameter cannot reshape the request path.
- **Outbound only**: the module makes requests and accepts no inbound traffic. There are no webhooks and no callbacks, so there is no signature to verify.
- **Compliance scope**: none. No payment data, no health data, no personal data of any kind leaves the app. TMDB is not told who is asking.
- **Rate limiting**: this module is a client of a rate limited API, not a public endpoint of its own. The concurrency cap and the bounded retry are what keep BeStats inside TMDB's limit; a public rate limit on BeStats' own routes is not in scope here.

### Configuration required

- `TMDB_READ_ACCESS_TOKEN`: the TMDB v4 Read Access Token, sent as a Bearer credential on every request. Server only, no `NEXT_PUBLIC_` prefix. Obtained from a TMDB account's API settings, which is a prerequisite you must complete before the build can be verified against the live API.

Also required, and owned by this spec's build plan rather than assumed from elsewhere:

- `next.config.ts` gains `cacheComponents: true` and an `images.remotePatterns` entry for `image.tmdb.org`.
- `.env.example` is created with a placeholder and a description, and `.gitignore` gains the `!.env.example` exception, because the existing `.env*` rule would otherwise hide it.
- The `zod` and `server-only` packages are installed.

**Cache lifetimes**

| Read | `cacheLife` | Why this profile |
|---|---|---|
| `getMovie`, `getTvShow` | `days` | Detail changes slowly. A show's status changing a day late is acceptable; scope feature 16 re-reads it anyway |
| `getSeason` | `hours` | The one read where staleness is visible to a user waiting on last night's episode. Satisfies the `AGENTS.md` section 12 rule |
| `searchMovies`, `searchTvShows`, `discoverMovies`, `discoverTvShows` | `minutes` | Query shaped with low reuse. Long caching would mostly store entries nobody asks for twice |
| `getMovieGenres`, `getTvGenres` | `max` | Effectively static. Refetching is pure waste |

### Critical test scenarios

- Happy path: read a movie with a full fixture, assert every normalized field including a built poster URL and a derived release year, and assert exactly one HTTP request was made. Verifies **AC-6**, **AC-7**, **AC-13**, **AC-20**.
- Happy path: read a season fixture and assert every episode carries id, show id, season number and episode number, and that the show id was injected from the argument. Verifies **AC-14**.
- Happy path: read a season 0 fixture and assert `isSpecials` is true and the episodes are returned normally. Verifies **AC-15**.
- Happy path: read a genre list and assert the `max` profile is requested. Verifies **AC-5**.
- Missing data: a fixture with a null poster path, an empty overview, an absent runtime and an absent rating yields nulls throughout, and no field is filled with zero, an empty string or placeholder text. Verifies **AC-13**.
- Missing data: an episode fixture with a null `air_date` returns `airDate` as null and is not coerced. Verifies **AC-14**.
- Forward compatibility: a fixture carrying extra unknown TMDB keys parses successfully and the unknown keys are dropped. Verifies **AC-8**.
- Failure case: a fixture missing a required top level field raises `TmdbError` with kind `bad_response` and returns nothing partial. Verifies **AC-9**.
- Failure case: a movie fixture whose cast contains one malformed credit returns the movie with that credit dropped and the rest of the cast intact. Verifies **AC-9**.
- Failure case: a season fixture with an episode missing only its `name` returns that episode with `name` null and keeps the episode count correct; a season fixture with an episode missing its `id` raises `bad_response`. Verifies **AC-9**.
- Happy path: `getShowEpisodes` over a fixture with three regular seasons and a season 0 returns every regular episode in season then episode order, excludes season 0, and reports `complete` true. Verifies **AC-25**.
- Failure case: `getShowEpisodes` where one season read fails returns the remaining episodes with `complete` false and that season number in `failedSeasonNumbers`, and does not raise. Verifies **AC-25**.
- Surface: `isTmdbNotFound` returns true for a `not_found` error and false for every other kind and for a non `TmdbError` value. Verifies **AC-26**.
- Surface: assert each normalized image field used its pinned default size. Verifies **AC-27**.
- Structure: assert the inner uncached functions are callable directly in the test runner with no Next transform active, which is what makes the rest of this suite possible. Verifies **AC-23**.
- Failure case: a 404 raises kind `not_found` and is not retried; assert exactly one attempt. Verifies **AC-10**, **AC-12**.
- Failure case: a 401 raises kind `unauthorized` and is not retried. Verifies **AC-10**, **AC-12**.
- Failure case: a 429 followed by a success retries and returns the data; assert the attempt count and that a `Retry-After` header, when present, governed the delay. Verifies **AC-12**.
- Failure case: a persistent 500 exhausts the retry limit and raises kind `upstream` with a bounded attempt count. Verifies **AC-12**.
- Failure case: a request that never resolves aborts at the timeout and raises kind `timeout`. Verifies **AC-11**.
- Batch: a list of ids where one 404s returns the rest in `found` and that id in `missingIds`, with no more than the cap in flight at once. Verifies **AC-19**.
- Batch: a list of ids where the credential is rejected raises rather than returning a silently short list. Verifies **AC-19**.
- Surface: assert by type test that `searchMovies` rejects a genre filter and that `discoverMovies` accepts one. Verifies **AC-16**.
- Surface: assert every search and discover request URL carries `include_adult=false`. Verifies **AC-17**.
- Surface: a paged fixture returns TMDB's own page, total pages and total results unchanged. Verifies **AC-18**.
- Security: run a production build and search the client output for the token value; assert absence. Verifies **AC-2**.
- Security: assert that importing the module entry point from a Client Component fails the build. Verifies **AC-2**.
- Security: assert no log record produced during a failure or retry contains the token or the `Authorization` header. Verifies **AC-21**.
- Configuration: assert a missing `TMDB_READ_ACCESS_TOKEN` fails at module load with a clear message rather than at first request. Verifies **AC-1**.
- Live, opt in and labelled separately: fetch one known movie, one known TV show and one season against the real API and assert the schemas still parse. Skipped when no token is present. Verifies **AC-24**.

## Build plan

The project's build approach is Tracer Bullet. This feature is a Foundation module with no UI of its own, so the thin real thread runs inside the feature: get one movie from a real TMDB request, through auth, validation, normalization and a cached read, onto a real rendered page verified in the running app. Only once that whole pipe is proven does the module thicken one strand at a time, each strand ending in the same verified state. The deliberately full surface you chose is therefore built in slices rather than all at once, so a wrong call in the client or the error contract surfaces on the first strand rather than after all seven are written.

Steps 1 to 3 install things that arguably belong to scope feature 1. They live here because this feature cannot be built or verified without them and feature 1's plan does not currently mention them.

1. Install `zod` and `server-only`, add `TMDB_READ_ACCESS_TOKEN` to a committed `.env.example` with a placeholder and a description, and add the `!.env.example` exception to `.gitignore`. Satisfies **AC-1**.
2. Set `cacheComponents: true` in `next.config.ts` and add the `image.tmdb.org` entry to `images.remotePatterns`, then confirm `pnpm build` passes with the flag on. The app has one starter route, so adoption is near empty now; follow the `next-cache-components-adoption` skill for anything the build flags. Satisfies **AC-4**, **AC-20**.
3. Create `lib/tmdb/` with the `server-only` import, the Zod validated environment reader, and the base constants (base URL, image base, allowed image sizes, language, timeout, retry limit, concurrency cap, attribution string). Satisfies **AC-1**, **AC-2**, **AC-22**.
4. Write the request client: Bearer header, `en-US` language, `AbortSignal` timeout, status to `TmdbError` kind mapping, the `isTmdbNotFound` helper, bounded retry capped at 3 total attempts with `Retry-After` support and backoff, and the structured failure and retry logging. Satisfies **AC-3**, **AC-10**, **AC-11**, **AC-12**, **AC-21**, **AC-26**.
5. Write `imageUrl`, its size union and the four pinned per field size constants. Satisfies **AC-20**, **AC-27**.
6. **The thread.** Add the movie Zod schemas with no `.strict()`, the `Movie` and `MovieSummary` normalizers including the cast drop rule, and `getMovie` as an inner uncached function plus a `use cache` wrapper with `cacheLife('days')` and `append_to_response=credits`. Render it on a throwaway route against the real API and verify it in the running app with the `next-dev-loop` skill. This is the first proof that auth, caching, validation, normalization and rendering all work together, and the first proof the two function split behaves. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-13**, **AC-23**.
7. Write the fixture based tests for everything built so far, including the error, retry, timeout and missing data scenarios, and confirm they run green with no network and no token. Satisfies **AC-23**, and the failure scenarios of **AC-9** to **AC-13**.
8. Confirm the security boundary now rather than at the end: run a production build, search the client output for the token, and assert a Client Component import of the module fails. Satisfies **AC-2**.
9. Thicken to TV: the TV schemas and normalizers, `getTvShow` with credits appended and the natively returned season summaries mapped, and `getSeason` with `cacheLife('hours')`, including the `showId` injection, the null `airDate` pass through, the nullable episode `name` and `isSpecials`. Verify in the running app. Satisfies **AC-5**, **AC-6**, **AC-9**, **AC-14**, **AC-15**.
10. Write the bounded concurrency primitive, then `getMoviesByIds` and `getTvShowsByIds` on top of it with the `found` plus `missingIds` contract and the rule that a systemic failure raises rather than returning a short list. Satisfies **AC-19**.
11. Add `getShowEpisodes` on that same primitive: read every regular season, exclude season 0, order the result by season then episode, and report `complete` and `failedSeasonNumbers` honestly. This is the read features 14, 15 and 16 stand on, so it is built here rather than left for each of them to fan out alone. Satisfies **AC-25**.
12. Thicken to search and discover: `searchMovies`, `searchTvShows`, `discoverMovies` and `discoverTvShows` with `cacheLife('minutes')`, the typed parameter split, `include_adult=false` and the untouched pagination envelope. Confirm the `/discover/tv` filter parameter names against TMDB's reference before writing them, since the research could not verify them. Satisfies **AC-16**, **AC-17**, **AC-18**.
13. Thicken to the remaining reads: `getMovieGenres` and `getTvGenres` with `cacheLife('max')`. Satisfies **AC-5**.
14. Add the barrel entry point exporting only the public functions, types, `TmdbError`, `isTmdbNotFound` and `TMDB_ATTRIBUTION`, and confirm nothing internal is reachable from outside. Satisfies **AC-7**, **AC-22**, **AC-26**.
15. Extend the fixture tests to cover TV, seasons, specials, `getShowEpisodes` including its partial case, search, discover, pagination, both batch helpers and the pinned image sizes. Satisfies **AC-23**, **AC-25**, **AC-27**.
16. Add the opt in live smoke check as a separate, clearly labelled script that skips without a token, and document how to run it. Satisfies **AC-24**.
17. Remove the throwaway route from step 6, then run type checking, lint and a production build, and report the actual results. Satisfies **AC-4**.

## Consequences

**Positive**:
- Every TMDB concern is decided once. A page author calls `getMovie(id)` and inherits auth, caching, retries, validation and the error contract without choosing any of them again.
- TMDB's naming and its nulls stop at one boundary, so a field rename upstream is a one file change.
- Cache Components is adopted now, while the app has a single starter route, instead of as a migration across a dozen finished pages.
- The season read's `hours` lifetime means a newly aired episode appears the same day with no deploy, which is a product requirement rather than a nicety.
- The typed split between search and discover makes the trap in `AGENTS.md` section 10 a compile error rather than a code review catch.
- Fixture tests run with no network and no token, so the module is testable in CI from day one.
- Because nothing user specific enters a cached scope here, the shared cache privacy rule is satisfied structurally rather than by vigilance.

**Negative / tradeoffs**:
- The N+1 that spec 0001 accepted is contained, not solved. A watchlist of fifty titles is still fifty TMDB reads on a cold cache, and the concurrency cap makes that serialize into batches. Feature 9 inherits a measurable problem rather than a fixed one.
- **The concurrency cap is per process, not per fleet.** It bounds one call inside one instance. On a serverless target, many concurrent user requests each get their own instance with its own cap and its own ephemeral cache, so aggregate throughput across the fleet can still exceed TMDB's ceiling even though every instance individually looks safe. The bounded retry limits how badly that compounds, but there is no shared limiter and this design does not provide one. It is an accepted gap at current traffic, not a solved problem, and it is the second thing to measure at feature 9.
- A TV show with many seasons costs one request per regular season on a cold cache through `getShowEpisodes`, which is a second N+1 living inside a single show rather than across titles. Capping it is what this module does about it; removing it would require storing episode data, which spec 0001 ruled out.
- `cacheComponents: true` is a whole application decision taken inside a data module spec. Every route built from here on must be prerenderable or explicitly opted out, which is a real constraint on features 7, 9, 10, 11 and 15.
- Normalizing every response means a mapping layer to maintain, and a field the app later needs is a three place change: schema, type, normalizer.
- The full surface lands before most of it is exercised. Search and discover are built in this feature but not actually used until feature 11, so a wrong call there surfaces late.
- Zod parsing every response costs CPU on every cache miss. Small per request, not free at volume.
- In memory caching on serverless does not persist between requests, so the `days` and `hours` profiles deliver much less than they suggest unless a durable cache handler is added later. The profiles still govern the prerendered shell, which is where most of the benefit actually lands.
- Seven facts from the research could not be confirmed, including whether TMDB sends `Retry-After`, the real pagination cap, `/discover/tv`'s exact filter names and TMDB's behaviour on a missing translation. Each is handled defensively, which means some code exists for a case that may not occur.
- The live smoke check needs a real token, so it cannot run in an environment that has none, and it can fail for reasons that are TMDB's rather than yours.

**Neutral**:
- Three scaffolding items from feature 1 are absorbed into this feature's plan, so feature 1's remaining work shrinks and its plan should be reconciled.
- English only metadata is a deliberate simplification consistent with `AGENTS.md` section 3, not a limitation of the design. Adding a language parameter later is additive.
- The attribution string lives here as a constant while its display belongs to feature 18, so the two must stay in step.
- Committed fixtures are a snapshot of TMDB at capture time and will drift; the live check is what notices.

## Follow-up

- [ ] Create a TMDB account and obtain a v4 Read Access Token before the build starts. Nothing past step 5 of the build plan can be verified without one.
- [ ] Record in `AGENTS.md` that `cacheComponents: true` is on and that every new route must be prerenderable or explicitly opted out. This spec decides it, but a project wide rendering rule should not live only in a feature spec.
- [ ] Record the TMDB service role style rule in `AGENTS.md` alongside the one spec 0001 already asked for: the TMDB token is server only and no module outside `lib/tmdb/` may read it.
- [ ] Reconcile scope feature 1 so it does not re-install `zod`, `server-only`, `.env.example` or the `cacheComponents` flag that this feature's plan now owns.
- [ ] Confirm the unverified TMDB facts during the build and record the answers in [rationale.md](rationale.md): whether a 429 carries `Retry-After`, the real maximum page, `/discover/tv`'s filter parameter names, and what TMDB returns when an English translation is missing. The last one decides whether AC-13's "empty overview means missing" reading is actually correct.
- [ ] Probe where TMDB actually stops paginating and record the real limit here. This is deliberately not a build task: no acceptance criterion depends on it and the module's behaviour is to pass TMDB's own envelope through untouched. It becomes a build task only if scope feature 11 decides the UI must stop a user before TMDB errors, which would need a new acceptance criterion.
- [ ] Decide at scope feature 9 or 20 whether the per process concurrency cap needs to become a shared limiter. It does not protect against the fleet level rate limit exposure named in Consequences, and the honest answer today is that traffic is too low for it to matter yet.
- [ ] Check the four pinned image sizes in AC-27 against the reference designs during scope feature 5. They were chosen as sensible defaults, not measured against `design/`.
- [ ] Revisit the in memory cache limitation before deploying to a serverless target. If cache hit rates prove poor in production, `use cache: remote` with a durable handler is the documented next step, and it interacts directly with the N+1 cost.
- [ ] Scope feature 9 must measure the batch helper against real TMDB latency, as spec 0001's own follow up already anticipated. This spec gives it something to measure.
- [ ] Scope feature 11 owns combining a title query with filters, the truthful count rule and the pagination behaviour. This module deliberately leaves that gap open.
- [ ] Scope feature 18 owns displaying the attribution and the TMDB logo per their current terms. Re-read those terms at that point rather than trusting this spec's snapshot.
- [ ] Scope feature 2 should add `typecheck` and `test` scripts, and decide the test runner this module's fixture tests are written for. This spec assumes a runner exists by step 7 and names none.
- [ ] Consider whether the `next-cache-components-optimizer` and `next-partial-prefetching-*` skills apply once real pages exist. They are installed and relevant to features 7, 10 and 11, but not to this module.
