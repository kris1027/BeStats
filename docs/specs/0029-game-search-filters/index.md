# 0029. Game search and filters: games on /search and in the navbar quick search

**Date**: 2026-10-25
**Status**: In Progress

Scope feature: [G7. Game search and filters](../../scope/games.md) · Beta tier

## Summary

This adds games to search. `/search?type=game` finds games by title and narrows them by genre, platform, release year and minimum IGDB community rating, and the navbar quick search now works on every games page. IGDB applies every filter inside the search query itself and returns an exact count, so unlike shows and movies, game search needs no page scan and no partial counts: every result meets every filter, and every count is IGDB's own. The work extends the existing `/search` page, its filter bar and its quick search, plus four small changes to the IGDB module. Nothing is stored, and no session is read.

## Requirements

**User stories**:

- As a visitor, I want to type a game's title in the navbar on any games page and jump straight to it, so that finding a game feels like finding a show or a movie.
- As a visitor, I want to narrow games by genre, the platforms I own, a release year and a minimum IGDB rating, with or without a title, so that I can discover something to play.
- As a visitor, I want the URL to hold my game search, so that I can share it, reload it, and come back to it after opening a game.
- As a visitor, I want every game shown and every count to be true to my filters, so that I can trust the page.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/search` accepts `type=game` only while `NEXT_PUBLIC_GAMES_LIBRARY` is `on`, read on the server through `getGamesLibrary()` exactly as `LibrarySection` reads it, and only when the raw `type` is `game`: a shows or movies search never calls it, so an invalid flag value can never take shows and movies search down. The result is passed to `parseSearchParams` as `gamesEnabled`, which parses `type` with `parseLibraryTypeParam`. With the flag off or unset, `/search?type=game` shows the existing `That filter isn't valid` panel naming `type`, as it does today. `SearchType` becomes `LibraryType` (`tv | movie | game`), but every TMDB read (`readSearchPage`, `readDiscoverPage`, `readSearchGridPage`, `scanFilteredSearch`, `toQuickSearchResponse`) keeps taking `MediaType`, so the compiler forces a narrowing before each call and `game` can never fall into a TMDB `else` branch; `mediaNoun` and every other function that switches on the type is an exhaustive switch. `typedHref("/search", "game")` compiles; the `@ts-expect-error` line spec 0027 added to prove it could not is replaced by a test that it writes `type=game`.
- **AC-2**: For `type=game` the URL parameters are `q` (trimmed, then cleaned by the IGDB module's own `cleanSearchText` rule, so a `q` that holds a control character or is empty after cleaning is invalid here and never reaches the module as an `IgdbValidationError`; 1 to 100 characters), `genre` (repeatable, each an id in `getGameGenres()`, at most 20), `platform` (repeatable, each an id in `getGamePlatforms()`, at most 20; for both lists, repeated ids are removed before the 20 is counted), `year` (a whole year from 1950 to next UTC year), `rating` (one of `5`, `6`, `7`, `8`, `9`) and `page` (1 to 500, as `parsePageParam` reads it). A repeated single value, an id not in its list, more than 20 ids in one list, or a value out of range shows `That filter isn't valid` naming the parameter, with no IGDB result request (the genre and platform list reads are allowed). A `platform` on `type=tv` or `type=movie` is invalid the same way. `searchHref` writes `platform` ids sorted ascending after the genres, so one search has one URL. Opening a game and pressing Back returns the same URL with the same results.
- **AC-3**: A games search has three modes, decided only by the parsed URL: **browse** (no `q`, no filter), **discover** (no `q`, at least one of genre, platform, year or rating) and **search** (`q` set, with any filters). There is no filtered search mode for games, because IGDB applies every filter in the same query. Every displayed game meets every selected filter, and no game the catalog filter hides ever shows.
- **AC-4**: Browse mode shows IGDB's Popular list, read through `getPopularGames("popular")` (the cached read `/games/popular` uses, so one shared cache entry) and cut into 24 game pages by a pure slicing helper that `readGameListPage` also uses, with no clock read. It shows the games in rank order, headed by the line `Popular games on IGDB`, with numbered `PaginationLinks` over its exact length. If the list is empty on page 1, the empty `StatePanel` reads `No popular games right now` with no `Clear filters` action (there is nothing to clear); a page past the end shows `That page doesn't exist`.
- **AC-5**: Discover mode calls `discoverGames` with `sort: "rating_count_desc"`, `requireSortField: false`, `pageSize: 24`, the genres, the platforms, the year as `releasedFrom: "{year}-01-01"` and `releasedTo: "{year}-12-31"`, and, when a rating is set, `minRating: rating` and `minRatingCount: 10`. The most rated games come first, and games with no ratings follow them instead of being dropped, so the count includes them. IGDB takes one sort key, so the order inside the unrated tail is IGDB's own; as spec 0023, AC-13 already accepts for ties, a game in that tail may repeat or be skipped across pages, and that is accepted.
- **AC-6**: Search mode calls `searchGames` with the query, every filter (genres, platforms, year, and with a rating `minRating` and `minRatingCount: 10`) and `pageSize: 24`, in IGDB's relevance order, with no other sort.
- **AC-7**: Selecting several genres means a game must have all of them (IGDB `genres = [ids]`). Selecting several platforms means a game must be on any of them (IGDB `platforms = (ids)`). Different filters combine with AND.
- **AC-8**: In discover and search mode the count line reads `{n} games` (`1 game`) with thousands separators, IGDB's exact count, with no `+` cap wording. When IGDB sends no count (`totalResults` is null) the count line is left out. Paging uses `PaginationLinks` with the last page `min(ceil(total / 24), 50)`; with no count, it offers Next only while `hasNextPage` is true, as the games list pages do (spec 0028, AC-10). That rule is extracted from `lastListPage` into a pure helper over `IgdbPaged<GameSummary>`, which both the list pages and search call. A `page` past the last page, or above 50, shows `That page doesn't exist` with a link to page 1; above 50 it is decided before any IGDB request.
- **AC-9**: On `type=game` the filter bar shows, built from the existing glass controls: the text field, `Genres` (IGDB genres, legend `MUST HAVE ALL OF`), `Platforms` (AC-10), the year select (`Any year`, then next year down to 1950), the rating select labelled as the IGDB rating (`Any IGDB rating`, `5+` to `9+`), and `Clear filters` when anything is set. When a rating is set, `Only games with at least 10 IGDB ratings` shows beside it. The bar keeps every behaviour of spec 0010, AC-9: a real `GET` form, `Apply` before hydration, instant replace after it, the 400 ms text pause, `page` reset to 1, and the pending indicator. On `type=game`, genre and platform checkbox toggles also wait for a 400 ms pause after the last toggle before they apply, so several quick clicks make one IGDB read; the boxes show checked at once. `Clear filters` shows when a platform is set too (`hasAnyFilter` and the bar's own check count `platformIds`).
- **AC-10**: `Platforms` is a popover like `Genres`: the trigger reads `Platforms` or `Platforms · {n}`; inside, the legend `ON ANY OF`, a text box `Filter platforms` that gets focus when the popover opens and narrows the list by a case insensitive match anywhere in the name, then one checkbox per platform in name order (all of `getGamePlatforms()`, about 220). A filter that matches nothing shows `No platforms match`. Clearing the box shows the full list again, and checked platforms stay checked while hidden by the filter. Each row is a 44px target on touch. Both pickers stop at 20 (the module's cap): once 20 are checked, every unchecked box is disabled and the hint `Up to 20` shows, so the bar can never build a URL that is invalid for that reason. Selected platforms travel as hidden `platform` inputs, so a submit before hydration keeps them.
- **AC-11**: If the genre list read fails, `Genres` is disabled with `Genres unavailable`; if the platform list read fails, `Platforms` is disabled with `Platforms unavailable`; the rest of the bar works either way. If the URL has a `genre` (or `platform`) and that list failed, only the results area shows the IGDB error panel, because the ids cannot be checked. A failed list whose parameter is not in the URL is passed to the parser as `[]`, so a search that needs only the other list still runs, as the TMDB genre code already does.
- **AC-12**: Every game result is a `GameListCard` in the existing `PosterGrid`, linking to `/games/{id}`, with the cover (or the missing art state), the name, the release year as its meta line (left out when unknown) and the `IgdbRatingBadge` when rated. Game cards carry no status and no controls, and read no session, until G8.
- **AC-13**: The games copy of the states: `No games match these filters` (`Try fewer genres or platforms, another year or a lower rating.`) or `No games match “{q}”` (`Check the spelling, or try a shorter title.`), each with `Clear filters` to `/search?type=game`; `That filter isn't valid` naming the parameter; and on any IGDB failure `Couldn't reach IGDB` (`IGDB didn't respond. Try again in a moment.`) with a `Try again` `RetryLink` to the same URL. The heading, the navbar and the filter bar stay usable in every state. The loading skeleton keeps the footprint of spec 0010, AC-21.
- **AC-14**: On `/search`, while the flag is on, the navbar tabs are SHOWS | MOVIES | GAMES and switch `type` in place through `typedHref("/search", type, { current })`: `q`, `year` and `rating` are kept, `genre`, `platform` and `page` are dropped. A kept `year` the new type cannot take (below 1950 for `game`) is dropped too, so a switch never lands on an invalid panel. GAMES is lit on `/search?type=game`.
- **AC-15**: While the flag is on, the navbar search (the desktop field and the mobile search icon) shows on `/games`, on every `/games/*` path, on the three library pages with `type=game` and on `/search?type=game`, and searches games there, with the placeholder `Search games`. The search reads `libraryType` through `WithLibraryTypedPage`, the field the tabs already use, and `PageMediaType.type` stays as it is for the logo. Its Suspense fallback takes the placeholder from the pathname where the prerendered shell knows it, so it reads `Search games` on `/games` and the five list pages. On `/games/{id}` and on the typed paths the shell cannot know the type, so `Search shows` shows once before the type resolves, the one time flash spec 0027, AC-4 already accepted. Only the pathname is read off the four typed paths, so `/games` and its list and game pages keep their prerendered shells. With the flag off, nothing changes from today.
- **AC-16**: Games quick search keeps every behaviour of spec 0010, AC-2 to AC-6 (debounce, cancellation, combobox keys, mobile overlay, skeleton and error rows). Each row shows the cover in the 3:4 frame the game cards use (or the game missing cover icon), the name, the release year (left out when unknown) and the amber star with the IGDB community rating, its screen reader label `IGDB community rating`. The row takes its label from `CATALOG_SOURCES[type]` and uses the same amber colour token as `IgdbRatingBadge`. The cover's `sizes` resolves to a real `IGDB_COVER_LADDER` rung, checked by the loader test. The footer reads `{n} games` from IGDB's count, or just `See all` when IGDB sends no count; See all opens `/search?type=game&q={query}`. No match reads `No games match “{query}”`, and a failure reads `Couldn't reach IGDB` with `Try again`.
- **AC-17**: `GET /api/search` accepts `type=game` only while the flag is on (otherwise 400 `{ error: "invalid" }`), reads only the cached `searchGames` page 1 at the default 20 and returns its first 5 games. The response field `tmdbRating` is renamed `rating` for every type, and `totalResults` is `number | null`. An `IgdbError` answers 502 `{ error: "upstream", kind }`, and an `IgdbValidationError` (a class of its own, not an `IgdbError`) answers 400 `{ error: "invalid" }`, never a 500. `getGamesLibrary()` is read only when the `type` parameter is `game`. The cache headers, the `no-store` errors and the rule that it reads no cookie, header or session stay as spec 0010, AC-20 sets them.
- **AC-18**: On `/search?type=game` the logo links to `/games` and remembers `game`, as on a games tab (spec 0028, AC-16): `libraryTypeForLocation` treats `/search` like a library page for `game`.
- **AC-19**: The IGDB module changes, each validated before the cache and part of the cache key: genres match all of the ids (`cond.allOf`, writing `genres = [ids]`) while platforms keep any of; `minRatingCount` moves into `GameFilters`, so `searchGames` accepts it; `searchGames` accepts `pageSize` 20 or 24 like `discoverGames`; and `discoverGames` accepts `requireSortField` (boolean, default `true`), which with `false` leaves out the `{sort field} != null` condition. G6's lists pass none of these and are unchanged. In `validation.ts`, `minRatingCount` moves into the shared `filters()` validator and its condition into `sharedConditions`, and the discover only copies in `validateDiscoverOptions` and `fetchDiscoverGames` are removed, so the condition is written once; `requireSortField` joins `ValidDiscoverOptions`; `pageSize` joins `ValidSearchOptions` with the same 20 or 24 check and default 20, and `fetchSearchGames` reads it instead of `IGDB_PAGE_SIZE`. The fixture suite covers each, and `pnpm igdb:live` gains two checks: a two genre `[]` filter returns only games with both genres, and a `rating_count_desc` discover with `requireSortField: false` puts every unrated game after every rated one and counts them.
- **AC-20**: `/search` still serves a prerendered shell (`pnpm build` reports it partially prerendered, no `instant = false`, no IGDB request at build time). No route or handler here reads `cookies()`, `headers()` or a session for a games search, no `use cache` scope receives a user value, and the request scope and layout purity tests cover `type=game`. `/search` stays `noindex, follow`.
- **AC-21**: `/showcase` shows the platform picker open with a filter typed, its `No platforms match` state and its `Platforms unavailable` state, and a games quick search row with and without a cover. At 375px there is no horizontal page scroll on `/search?type=game`, with the bar wrapping as it does for shows; a keyboard only pass reaches every control and card in order; no colour literal exists outside `app/globals.css`.

## Decision

**Chosen option**: Option 1: a games branch inside the existing `/search`, with every filter sent to IGDB.

`/search?type=game` reuses the page, the filter bar, the result states and quick search of spec 0010, with its own three modes that send every filter to IGDB, so every result and every count is IGDB's own. Four small IGDB module options make that possible.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for verifying the games filter bar and quick search in the running app · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) for keeping `/search` and `/games` in their prerendered shells while the navbar search reads the games type.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no tables and no migration. Nothing about a search is stored. The app's own types change:

| Type | Change |
|---|---|
| `SearchType` (`lib/search/params.ts`) | `LibraryType` instead of `MediaType` |
| `SearchParams` | gains `platformIds: number[]` (deduplicated, sorted ascending, always `[]` for `tv` and `movie`) |
| `SearchParamName` | gains `"platform"` |
| `FilterBar` props (`components/search/filter-bar.tsx`) | `genres: { tv, movie, game }`, each `CatalogRef[] \| null`, plus `platforms: CatalogRef[] \| null`; `CatalogRef = { id: number; name: string }` (TMDB `Genre` and IGDB `GameRef` both fit it), the one type both pickers take |
| `typedHref` | one overload for `/search` and the library paths taking `LibraryType`; the `TypedPath` with `MediaType` overload is removed |
| `SearchResult` (`lib/search/read.ts`) | unchanged for TMDB; games use `GameSummary` directly through their own read (below) |
| `QuickResult` (`lib/search/quick.ts`) | `tmdbRating` renamed `rating` |
| `QuickSearchResponse` | `totalResults: number \| null` |
| `CountEndpoint` (`lib/search/count.ts`) | gains `"igdb"`: exact, never capped |
| `GameFilters` (`lib/igdb/types.ts`) | gains `minRatingCount?: number` (moved from `DiscoverGamesOptions`) |
| `SearchGamesOptions` | gains `pageSize?: 20 \| 24` |
| `DiscoverGamesOptions` | gains `requireSortField?: boolean` (default `true`) |

**Constants** (`lib/search/constants.ts`, pure): `GAME_MIN_RATING_COUNT = 10`; the game year floor is `IGDB_MIN_YEAR` (1950) and the id list cap is the module's 20 (spec 0023, AC-12b), both read from `lib/igdb/constants.ts`, which is pure and may be imported outside the module. The game page size is `IGDB_LIST_PAGE_SIZE` (24) and the page ceiling `IGDB_MAX_PAGE` (50).

**State transitions**: none stored. The games mode is a pure function of the parsed parameters:

| `q` | genre, platform, year or rating | Mode | IGDB call |
|---|---|---|---|
| none | none | browse | `readGameListPage(popular, page)` |
| none | any | discover | `discoverGames`, `rating_count_desc`, `requireSortField: false`, page size 24 |
| set | any or none | search | `searchGames`, every filter, page size 24 |

`searchMode(params)` returns one of these for `type=game` and never `filtered_search`; shows and movies keep their four modes unchanged.

**API surface** (no mutations, no Server Actions):

| Endpoint or function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/search?type=game` (page) | GET | `q`, `genre[]`, `platform[]`, `year`, `rating`, `page` (AC-2) | filter bar, mode results, count, paging | public, no session | invalid filter, no such page, `Couldn't reach IGDB` |
| `/api/search?type=game&q=` | GET | `type` (`game` only with the flag on), `q` 2 to 100 | `{ totalResults: number \| null, results[≤5] }` | public, no session | 400 `invalid`, 502 `upstream` with `kind` |
| `parseSearchParams(raw, lists, currentYear, gamesEnabled)` (pure) | fn | raw params; for `game` the genre and platform lists, for `tv`/`movie` the genre list; current UTC year; the flag, read only for a raw `type=game` | `{ ok, params } \| { ok: false, param }` | n/a | first invalid parameter name |
| `searchMode(params)` (pure) | fn | `SearchParams` | `SearchMode` | n/a | none |
| `searchHref(params, overrides)` (pure) | fn | params plus changes | canonical URL, `platform` after `genre` | n/a | none |
| `typedHref("/search", type, { current })` (pure) | fn | `LibraryType`, current query | URL keeping `q`, `year` (if valid for the type), `rating` | n/a | none |
| `readGameSearchPage(mode, params, today)` (`lib/search/game-read.ts`, server only) | fn | parsed games params | `IgdbPaged<GameSummary>` (24 games) | n/a | rethrows `IgdbError` |
| `searchGames` (module, amended) | read | adds `minRatingCount`, `pageSize` | `Paged<GameSummary>` | server only | `IgdbValidationError` before the cache |
| `discoverGames` (module, amended) | read | adds `requireSortField` | `Paged<GameSummary>` | server only | as above |
| `cond.allOf(field, ids)` (`lib/igdb/query.ts`, pure) | fn | field, validated ids | `field = [ids]` condition | n/a | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `/search` | whether `game` is accepted | `getGamesLibrary() === "on"`, read on the server in the results and filter bar boundaries and the Route Handler, only when the raw `type` is `game` |
| `/search` games | genre options, names, valid ids | cached `getGameGenres()` (`max` lifetime) |
| `/search` games | platform options, names, valid ids | cached `getGamePlatforms()` (`max` lifetime) |
| `/search` games | year options and upper bound | `new Date().getUTCFullYear() + 1`, read at request time inside the streamed boundaries, floor `IGDB_MIN_YEAR` |
| `/search` games | mode | `searchMode(params)` |
| browse | 24 games, exact length, pages | `getPopularGames("popular")` sliced by the shared helper (AC-4); no clock read |
| discover | 24 games, count, `hasNextPage` | `discoverGames({ genreIds, platformIds, releasedFrom, releasedTo, minRating, minRatingCount, sort: "rating_count_desc", requireSortField: false, pageSize: 24, page })`; `releasedFrom`/`releasedTo` are `{year}-01-01`/`{year}-12-31` built from `params.year` |
| search | 24 games, count, `hasNextPage` | `searchGames({ query: q, genreIds, platformIds, year, minRating, minRatingCount, pageSize: 24, page })` |
| discover, search | `minRatingCount` | `GAME_MIN_RATING_COUNT` when `params.rating` is set, else absent |
| discover, search | count line | `formatResultCount(totalResults, "game", "igdb")`, left out when `totalResults` is null |
| discover, search | last page | `min(ceil(totalResults / 24), IGDB_MAX_PAGE)`, or unknown when `totalResults` is null (then `hasNextPage`), through the same rule as `lastListPage` |
| browse | heading line | `Popular {noun} on {CATALOG_SOURCES.game}` |
| card | name, cover, year, rating, link | `GameSummary.name`, `coverUrl`, `releaseYear`, `communityRating`; `gameHref(id)` |
| error and empty copy | source name, noun | `CATALOG_SOURCES[type]`, `mediaNoun(type)` (gains `game`/`games`) |
| navbar search | type and placeholder | `PageMediaType.libraryType` through `WithLibraryTypedPage`: `game` on `/games*` by pathname, and on the typed paths by `type` through `libraryTypeForLocation`; the fallback reads the pathname only (AC-15) |
| tabs on `/search` | each tab's href | `typedHref("/search", type, { current })` |
| logo on `/search?type=game` | target and remembered type | `libraryTypeForLocation` (AC-18) |
| quick search | rows, count | `/api/search` body: `searchGames({ query, page: 1 })` cut to 5; `coverUrl` passed as built (the IGDB loader picks the rung from `sizes`); `releaseYear`; `communityRating` as `rating`; `gameHref(id)` |
| Route Handler | accepted types | `quickSearchRequestSchema`, built with `game` only when `getGamesLibrary() === "on"` |

**Key invariants**:

- Every displayed game meets every selected filter, because every filter is in the IGDB query; nothing is filtered locally.
- A games count is IGDB's exact count or absent. It is never estimated, capped or shown for different filters.
- `include_adult` has no IGDB twin; the catalog rule (`CATALOG_RULE`) is in every search and discover query, so a hidden game never shows.
- Games search keeps IGDB relevance order; discover is most rated first with unrated games last; browse is the Popular rank. No other order exists.
- A `page` above 50 never reaches IGDB.
- No search parameter reaches a `use cache` scope except as the module's validated plain options, which are public.
- `MediaType` stays `tv | movie` for the TMDB reads, the title pages and the proxy; only search and the library pages take `LibraryType`.

**Security model**: everything is public catalog data. The Twitch credentials stay in `lib/igdb/env.ts`, and the page and the Route Handler import only `lib/igdb/index.ts`. Every parameter is validated with Zod and the URL parser before any IGDB call, then again by the module before its cache (spec 0023, AC-12b), and visitor text reaches an IGDB body only through `buildQuery`'s cleaning and escaping (spec 0023, AC-5). The Route Handler still reads no cookie or session, so its responses stay safe for a shared CDN cache, and the existing Vercel Firewall rate limit on `/api/search` covers `type=game` with no change. IGDB receives only search text and filter ids, never user data.

**Configuration required**: none. `NEXT_PUBLIC_GAMES_LIBRARY` (spec 0027) gates this too; G10 decides when it goes away.

**Components** (changed unless noted):

- `components/search/search-results.tsx`: a games branch (`GameResults`) with browse, discover and search, the count, paging and the games states; the TMDB branch is unchanged.
- `components/search/search-filters.tsx`: for `type=game`, reads `getGameGenres` and `getGamePlatforms` (settled to null on `IgdbError`) instead of the TMDB lists.
- `components/search/filter-bar.tsx`: the games controls, the IGDB rating labels and note; `PlatformPicker` (new, beside `GenrePicker`) with its filter box.
- `components/search/quick-search.tsx`, `quick-search-row.tsx`, `mobile-search-overlay.tsx`, `navbar-search.tsx`: the `game` type, the rating rename, the game fallback icon, `Search games`, the null count.
- `components/search/result-count.tsx`: the `igdb` endpoint and a browse line that names its source.
- `components/catalog/list-cards.tsx`: `GameListCard` gains an optional `meta`.
- `components/search/navbar-search.tsx`, `components/layout/page-media-type.tsx`: the search on `WithLibraryTypedPage` and `libraryType`; `type` unchanged.
- `components/layout/media-type-tabs.tsx`: `typedHrefs` builds `/search` hrefs for all three types instead of linking GAMES to `CATALOG_PATHS.game` off the library paths. `brand-link.tsx`: the logo on `/search?type=game`.
- `lib/catalog/media-type.ts`: one `typedHref` overload taking `LibraryType`, the year drop on a switch (importing `IGDB_MIN_YEAR` from the pure `lib/igdb/constants.ts`), `libraryTypeForLocation` for `/search`.
- `lib/catalog-list-read.ts`: the slicing helper and the last page helper over `IgdbPaged`, shared with search.
- `lib/search/`: `params.ts`, `mode.ts`, `count.ts`, `quick.ts`, `constants.ts`, and `game-read.ts` (new, server only).
- `lib/igdb/`: `query.ts`, `summary-page.ts`, `search.ts`, `discover.ts`, `types.ts`, `validation.ts`, fixtures, `igdb.live.ts`.
- `app/api/search/route.ts`: the games read and `IgdbError` mapping.
- `app/showcase/page.tsx`: AC-21's states.

**Critical test scenarios**:

- Happy path: with the flag on, `/search?type=game&q=zelda` shows 24 game cards, `{n} games` from IGDB's count and numbered pages; page 2 has no game from page 1, verifies **AC-3**, **AC-6**, **AC-8**, **AC-12**.
- Combined filters: `/search?type=game&q=mario&genre=8&platform=130&platform=508&rating=7` builds one IGDB body with the search text, `genres = [8]`, `platforms = (130,508)`, `rating >= 70` and `rating_count >= 10`; every fixture result passes, verifies **AC-6**, **AC-7**, **AC-19**.
- Discover keeps unrated games: `/search?type=game&platform=508` sends no `rating_count != null`, and the live check proves unrated games come after rated ones and are counted, verifies **AC-5**, **AC-19**.
- Browse: `/search?type=game` shows `Popular games on IGDB` and the same first 24 games as `/games/popular`, from one cache entry, verifies **AC-4**.
- Platform picker: typing `switch` narrows to the Switch platforms, a checked platform hidden by the filter stays in the URL, `zzz` shows `No platforms match`, verifies **AC-10**.
- Invalid input: `?type=game&platform=0`, `?type=game&year=1949`, `?type=movie&platform=6`, 21 genre ids each show `That filter isn't valid` with no IGDB result request; `?type=game&page=51` shows `That page doesn't exist` with no request, verifies **AC-2**, **AC-8**.
- Flag off: `/search?type=game` shows the invalid type panel, `/api/search?type=game&q=zelda` answers 400, no GAMES tab and no search on `/games`, verifies **AC-1**, **AC-15**, **AC-17**.
- Tab switch: `/search?type=movie&q=dune&year=1940&genre=878` and GAMES gives `/search?type=game&q=dune` (year and genre dropped); back to MOVIES keeps `q`, verifies **AC-14**.
- Null count: a fixture with no `X-Count` shows no count line and Next only while `hasNextPage`, in both `/search` and quick search, verifies **AC-8**, **AC-16**.
- Failure case: with IGDB unreachable, `/search?type=game&q=zelda` shows `Couldn't reach IGDB` with the bar usable; a failed platform list disables only `Platforms`; with `platform=` in the URL the results show the error panel, verifies **AC-11**, **AC-13**.
- Type narrowing: no TMDB read accepts `LibraryType` (a type test), `mediaNoun("game")` is `games`, and `resultsKey` keeps two `platform` values, verifies **AC-1**, **AC-2**.
- Edge inputs: `?type=game&q=%01` shows `That filter isn't valid` naming `q`, and `/api/search?type=game&q=%01%01` answers 400, never 500; with an invalid flag value, `/search?type=movie&q=dune` still works, verifies **AC-1**, **AC-2**, **AC-17**.
- Picker cap: after 20 platforms every unchecked box is disabled with `Up to 20`; three quick toggles make one navigation, verifies **AC-9**, **AC-10**.
- Navbar: with the flag on, `/games/top-rated` shows `Search games` and stays prerendered; with the flag off, `/search?type=game` lights SHOWS and the logo goes to `/shows`; `/watchlist?type=game` searches games; the fallback on `/games` reads `Search games`, verifies **AC-15**, **AC-20**.
- Auth/permission: a signed in request to `/api/search?type=game&q=zelda` carries no `Set-Cookie` and the same body as a signed out one; the request scope test for `/search?type=game` finds no session read, verifies **AC-17**, **AC-20**.

## Build plan

Tracer Bullet: first one thin real thread, a titled game search from the URL to IGDB and back to a grid, then each strand thickened end to end.

1. **Thin thread**: `SearchType` widened behind `getGamesLibrary()`, `typedHref("/search", "game")`, `parseSearchParams` for `game` with `q` and `page` only at first, `pageSize` on `searchGames` (types, validation, cache key, tests), `readGameSearchPage` for search mode, the `GameResults` branch with `GameListCard` (and its `meta`), the exact count and numbered paging, proven on `/search?type=game&q=zelda` in the running app, satisfies **AC-1**, **AC-3**, **AC-6**, **AC-8**, **AC-12**
2. **Module strands**: `cond.allOf` and genres as all of, `minRatingCount` in `GameFilters`, `requireSortField` on discover, fixtures for each, and the two new `pnpm igdb:live` checks run against real IGDB, satisfies **AC-7**, **AC-19**
3. **The full URL**: `genre`, `platform`, `year`, `rating` parsing with their caps and the `platform` refusal on TMDB types, `searchHref` with platforms, the discover and browse modes through `readGameSearchPage`, the no such page and above 50 rules, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**
4. **The filter bar**: the games branch of `SearchFilters`, the IGDB genre list and its legend, `PlatformPicker` with its filter box, the year range, the IGDB rating labels and note, hidden inputs, and the independent list failures, satisfies **AC-9**, **AC-10**, **AC-11**
5. **States**: the games empty, invalid and `Couldn't reach IGDB` copy through `CATALOG_SOURCES` and `mediaNoun`, the skeleton footprint, satisfies **AC-13**
6. **Navigation**: the navbar search on `WithLibraryTypedPage`, `Search games` and its fallback, the single `typedHref` overload and `typedHrefs` in the tabs, GAMES in place on `/search` with the year drop, the logo on `/search?type=game`, with the navbar, tabs and brand link tests, satisfies **AC-14**, **AC-15**, **AC-18**
7. **Quick search**: the Route Handler's games branch and flag check, the `rating` rename and null count across the TMDB and games rows, the game row icon and label, the mobile overlay, satisfies **AC-16**, **AC-17**
8. **Proof**: `/showcase` states, request scope and layout purity tests for `type=game`, `pnpm build` reporting `/search` partially prerendered, 375px and 1280px, a keyboard pass, then typecheck, lint, test and build, satisfies **AC-20**, **AC-21**

## Consequences

**Positive**:

- Every game shown and every count is IGDB's own answer to the full filter set, which is the AGENTS.md section 10 rule held with less code than TMDB needs.
- One `/search` serves three catalogs with one URL grammar, one filter bar and one quick search, so share, reload and Back work the same for games.
- Browse shares `/games/popular`'s cache entry, so it costs no extra IGDB request.
- The games tabs and pages finally have a search, removing the gap spec 0027 accepted.

**Negative / tradeoffs**:

- Genres mean all of while platforms mean any of; the legends (`MUST HAVE ALL OF`, `ON ANY OF`) carry that, but it is two rules in one bar.
- A 220 entry platform list is long even with the filter box, and it includes long retired platforms nobody owns.
- IGDB pages stop at 50, so a broad search or filter reaches at most 1,200 games by paging, even when the count is higher.
- Discover sorts by rating count, a stand in for popularity; unrated games sit after rated ones in an order IGDB does not document, and it was stable only in a live test.
- The 10 rating floor is far lower than the 100 TMDB vote floor, so a `9+` game list can include games rated by a small group.
- `SearchType` widening touches many search files at once, and the TMDB quick search rows change shape with the `rating` rename.

**Neutral**:

- `/search`'s description and share card still name only movies and shows until G10 adds games to SEO.
- Game cards on `/search` are plain until G8 adds the status chip to every grid at once.
- Four IGDB module options are added; G6's callers pass none and behave as before.

## Follow-up

- [x] Amend spec 0010 (AC-7, AC-18, AC-20), spec 0023 (AC-12: genres all of, `minRatingCount` and `pageSize` on search; AC-13: `requireSortField`), spec 0027 (AC-2, AC-4: game search on `/search` and on the games tabs) and spec 0028 (AC-14, AC-15: GAMES in place on `/search`, the search on `/games*`) with a one line pointer to this spec.
- [ ] Through `/sync`, update `AGENTS.md`: `getGamesLibrary()` is now also read by `/search` and `/api/search`; `game` reaches `/search`; and `lib/igdb/AGENTS.md`: the genre all of rule, the two new options.
- [ ] G8: give game cards on `/search` the status chip and control with the other grids.
- [ ] G10: add games to `/search`'s description and share copy when games reach search engines.
- [ ] Before G10, decide whether the Vercel Firewall rule (today only `/api/search`) should also cover `/search` page renders, since each new filter combination on `type=game` is an uncached IGDB read against a 4 a second limiter shared with the game pages.
- [ ] Rerun `pnpm igdb:live` before launch; the unrated games order and the count header are IGDB behaviours the docs do not promise.
