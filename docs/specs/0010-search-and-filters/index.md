# 0010. Search and filters: navbar quick search and the /search results page

**Date**: 2026-09-24
**Status**: In Progress

Scope feature: [11. Search and filters](../../scope/scope.md) · Beta tier

## Summary

This decides how a visitor finds a movie or show by name, genre, year and TMDB rating. The navbar gets the drawn quick search: as you type, the top 5 matches of the current type drop down with TMDB's count and a See all link. See all opens `/search`, a public page with a poster grid and a filter bar (type, genres, year, minimum TMDB rating) whose every choice lives in the URL. TMDB's search endpoint ignores genre and rating, so when you combine a title with those filters the server checks each result itself, reads further TMDB pages until a page is full, and labels the count as partial instead of pretending to know the total. Nothing is stored and no session is needed, except the movie bookmark the `/movies` grid already has.

## Requirements

**User stories**:

- As a visitor, I want to type a title in the navbar and see matching shows or movies right away, so that I can jump to one without leaving the page I am on.
- As a visitor, I want a full results page where I can narrow by genre, year and minimum TMDB rating, with or without a title, so that I can discover something to watch.
- As a visitor, I want the URL to hold my search and filters, so that I can share it, reload it, and come back to it after opening a title.
- As a visitor, I want every count and every result to be true to the filters I chose, so that I can trust what the page says.
- As a mobile visitor, I want the search icon to open a usable full screen search, so that I get the same quick results on a phone.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: On desktop the navbar shows a glass search field between the media type tabs and the account slot, as drawn in `design/desktop-navbar-signed-out.svg`. Its placeholder is `Search shows` or `Search movies`. The type follows the page: `movie` under `/movies`, `tv` under `/shows`, the `type` parameter on `/search`, and `tv` everywhere else (library pages, account, auth pages, 404). The field sits in its own Suspense boundary, and its fallback is the same glass field at the same size, with the placeholder taken from the pathname (`Search shows` when the pathname is unknown). Only a small child component mounted on `/search` reads `useSearchParams`, so `/shows`, `/movies` and every other route keep their prerendered shells.
- **AC-2**: Typing in the field opens the results panel drawn in `design/desktop-search-open.svg` once the trimmed query has at least 2 characters and input has paused 250 ms. The panel shows the heading `RESULTS`, then at most 5 rows in TMDB relevance order, each with the poster (or the fallback tile), the title, the year (release year for a movie, first air year for a show, omitted when unknown), and on the right the amber star with the TMDB rating to one decimal (omitted when TMDB has no rating). The footer shows the count and a `See all` link. A newer keystroke cancels the older request, and a response for a query that is no longer in the field is never rendered.
- **AC-3**: The quick search count reads `{n} shows` or `{n} movies` (`1 show`, `1 movie`) from TMDB's `total_results`, formatted with thousands separators. Each endpoint's cap is not a real count, so the wording depends on the endpoint: a search total of 10,000 or more reads `10,000+ shows`, and a discover total of 20,001 or more reads `20,000+ shows`. Every total below its endpoint's cap is shown exactly. A query with no matches shows `No shows match “{query}”` (or movies) in place of the rows, with no count and no See all.
- **AC-4**: Quick search is a WAI-ARIA combobox (an input that controls a list): the field has `role="combobox"`, `aria-expanded` and `aria-controls` pointing at the listbox; ArrowDown and ArrowUp move the active row (reflected by `aria-activedescendant`, with a visible highlight); Enter on an active row opens that title (`/shows/{id}` or `/movies/{id}`); Enter with no active row, or clicking See all, opens `/search?type={type}&q={query}`; Escape or the clear button (×) closes the panel, and Escape a second time clears the field; clicking outside closes the panel. The `ESC` hint drawn beside the × is shown on desktop.
- **AC-5**: While a quick search request is in flight the panel keeps its size and shows 5 skeleton rows (the first request) or the previous rows dimmed (a follow up). If the request fails, the rows are cleared and the panel shows `Couldn't reach TMDB` with a `Try again` button that repeats the same query; See all stays available.
- **AC-6**: Below `md` the navbar shows a round search icon button (as in `design/mobile-menu-open.svg`) with the accessible name `Search`. It opens a full screen overlay holding the same field (autofocused) and the same panel behavior as AC-2 to AC-5, with a visible close button, focus kept inside the overlay, Escape closing it, and focus returned to the icon on close. Every control has a 44px touch target and there is no horizontal page scroll at 375px.
- **AC-7**: `/search` is a public page. Its URL parameters are `type` (`tv` or `movie`, default `tv`), `q` (trimmed title, 1 to 100 characters, absent means no query), `genre` (repeatable, each a TMDB genre id of that type), `year` (a whole year from 1900 to next year), `rating` (one of `5`, `6`, `7`, `8`, `9`) and `page` (1 to 500). Every result page for the same URL shows the same results (the URL is the whole state, so it can be shared and reloaded).
- **AC-8**: `/search` shows the heading `Search`, then a filter bar of glass controls built from the existing tokens: a text field for `q`, a `Shows | Movies` type toggle, a genres popover with one checkbox per genre of the selected type (from `getTvGenres` or `getMovieGenres`), a year select (`Any year`, then next year down to 1900), a minimum rating select labelled as TMDB rating (`Any TMDB rating`, `5+`, `6+`, `7+`, `8+`, `9+`), and `Clear filters` when anything is set. When a minimum rating is set, the text `Only titles with at least 100 TMDB votes` shows beside it.
- **AC-9**: The filter bar is a real `GET` form with `action="/search"`, so it works before the page hydrates: with the JavaScript bundles not yet loaded (or failing to load), the bar and the results show, a visible `Apply` button submits the form, and the submitted URL filters the results. `Apply` is hidden once hydrated. Before hydration, three limits are expected and accepted: the genre popover cannot open, so genres already in the URL are resubmitted (as hidden inputs) but no new genre can be picked; switching type resubmits the previous type's genre ids unmapped, so a genre that does not exist in the new type shows AC-18's `That filter isn't valid` panel instead of AC-24's `Removed:` note; and the submitted URL carries empty values (`q=&rating=`) instead of the canonical `searchHref` form, which parses to the same parameters and becomes canonical on the next change after hydration. JavaScript turned off entirely is not supported here or anywhere else in the app: every streamed Suspense boundary (the navbar included) is revealed by React's small inline script, so without it the streamed parts stay hidden. Once hydrated, every change applies at once: the URL is replaced (not pushed, so Back leaves the page instead of undoing each tweak), `page` resets to 1, the text field applies after a 400 ms pause or on Enter. Two things happen together while the new results stream: the results area swaps to its skeleton (AC-21), and the controls show a pending indicator driven by `useTransition`.
- **AC-10**: Selecting several genres means a title must have all of them. In discover mode this is TMDB's comma syntax (`with_genres=18,35`); in filtered search mode (AC-13) it is checked on each result's `genre_ids`.
- **AC-11**: **Browse mode** (no `q`, no filters): the page shows `discoverTvShows` or `discoverMovies` in popularity order, headed by the line `Popular shows on TMDB` (or movies), with `PaginationLinks` exactly as the landings (`Page N of M`, `M = lastReachablePage(totalPages)`).
- **AC-12**: **Discover mode** (no `q`, any filter set) and **plain search mode** (`q` set, and at most `year` among the filters): discover mode calls discover with `with_genres`, the year (`primary_release_year` or `first_air_date_year`), `vote_average.gte={rating}` and `vote_count.gte=100` when a rating is set, in popularity order. Plain search mode calls `searchMovies` or `searchTvShows` with the query and the year sent upstream, in TMDB relevance order. Both show the count from `total_results` with the AC-3 wording for that endpoint (`1,234 shows`, `10,000+ shows` for search, `20,000+ shows` for discover) and numbered `PaginationLinks`.
- **AC-13**: **Filtered search mode** (`q` set and at least one genre or a rating): the server calls search with the query and the year upstream, and keeps only results whose `genre_ids` contain every selected genre and, when a rating is set, whose `vote_average ≥ rating` and `vote_count ≥ 100`. Starting at TMDB page `page`, it reads that page alone first. If it has kept fewer than 20, it fetches the rest of the 5 page budget (clipped to the last reachable page) at the same time, within the TMDB module's concurrency cap, then consumes the pages in page order, always whole pages, and stops after the page on which the kept results reach 20, or after 5 pages, or at the last reachable page. It shows every kept result from the pages it read, in TMDB order. No result that fails a selected filter is ever displayed.
- **AC-14**: In filtered search mode the count is labelled partial, for example `12 matches in TMDB results 1–100 of 1,112 for “dune”` (the range is the TMDB results read on this page, the total is TMDB's search total with the AC-3 search wording). Paging uses a `More results` link to the same URL with `page` set to the TMDB page after the last one read (absent when that was the last reachable page), and a `Back to first page` link when `page > 1`. No page numbers or `of M` are shown in this mode.
- **AC-15**: When filtered search mode reads 5 pages and keeps nothing, it shows `No matches in TMDB results {from}–{to}` with the `More results` link (when more pages exist), rather than claiming there are no matches at all. When the search itself has no results, or discover returns none, the page shows the empty `StatePanel` `No shows match these filters` (or movies, or `No shows match “{q}”` with no filters) with a `Clear filters` action.
- **AC-16**: Every result renders as a `PosterCard` in the existing `PosterGrid`, linking to `/shows/{id}` or `/movies/{id}`, with the title, the year as its meta line (omitted when unknown), and the `TmdbRatingBadge` in the badge slot. Movie cards carry the `CardBookmark` exactly as `/movies` does, with `returnPath` set to the canonical URL `searchHref(params, {})`; TV cards carry no tracking control (feature 14).
- **AC-17**: Opening a result and pressing Back returns to the same `/search` URL showing the same filters, results and page (including a `More results` cursor page). The quick search field keeps no state across navigations.
- **AC-18**: A malformed or unknown value in any `/search` parameter (a `type` other than `tv` or `movie`, a `q` over 100 characters, a genre id that is not in that type's genre list, a year outside 1900 to next year, a `rating` other than 5 to 9, a `page` outside 1 to 500, or a repeated `type`, `q`, `year`, `rating` or `page`) shows the empty `StatePanel` `That filter isn't valid`, naming the parameter, with a `Clear filters` link to `/search?type={type}` (or `/search`). No TMDB result call is made (the genre list read is allowed). A `page` past the last reachable page shows `That page doesn't exist` with a link to page 1, in every mode. In filtered search mode that is decided from the first page read's `total_pages`, before any further page is fetched.
- **AC-19**: When TMDB times out, rate limits or fails upstream, `/search` shows the error `StatePanel` `Couldn't reach TMDB` with a `Try again` `RetryLink` to the same URL; the heading, the filter bar and the navbar stay usable. If the genre list read fails, the filter bar disables the genre control with the note `Genres unavailable`, and the rest of the bar still works. If the URL also has a `genre` parameter, only the results area shows the error panel (the genres cannot be validated); the heading and filter bar stay. Both boundaries read the same cached genre list, so they agree within one render.
- **AC-20**: `GET /api/search?type={tv|movie}&q={query}` validates both parameters with Zod (`q` trimmed, 2 to 100 characters), reads only the cached `searchTvShows` or `searchMovies` for page 1, and returns JSON `{ totalResults, results }` with at most 5 results, each `{ id, title, year, posterUrl, tmdbRating, href }`. It answers 400 with `{ error: "invalid" }` for bad input and 502 with `{ error: "upstream", kind }` when TMDB fails. A success sends `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`; errors send `no-store`. It reads no cookie, header or session. The `proxy.ts` matcher excludes `api/`, so no session refresh runs and no response from this handler ever carries `Set-Cookie`, which would stop a CDN from caching it.
- **AC-21**: `/search` serves a prerendered shell (`pnpm build` reports it as partially prerendered, no `instant = false`, no TMDB request at build time). The heading is static; the filter bar and results stream inside Suspense boundaries whose fallbacks keep their footprint (a filter bar skeleton and 20 `PosterCardSkeleton`s). The results boundary is keyed on the parsed parameters, so a filter change shows the skeleton instead of stale results.
- **AC-22**: `/search` has the title `Search` (or `“{q}” · Search` when a query is set) through the root layout template and `<meta name="robots" content="noindex, follow">`. No route or handler added here reads `cookies()`, `headers()`, a Supabase client or a session value outside the existing `CardBookmark` Suspense boundary, and no `use cache` scope receives anything user specific. The layout purity and request scope tests are extended to `app/search/` and `app/api/search/` and pass.
- **AC-23**: The comment on `genreParam` in `lib/tmdb/search.ts` is corrected (a comma means all of the genres, a pipe means any), `DiscoverOptions` gains `minVoteCount`, and `MovieSummary` and `TvShowSummary` gain `genreIds: number[]` (normalized from `genre_ids`, missing means `[]`). The fixture suite covers each, and `pnpm tmdb:live` gains a check that `/search/movie` ignores `with_genres` (so a future TMDB change that starts honouring it is noticed).
- **AC-24**: Switching between `Shows` and `Movies` keeps `q`, `year` and `rating`. It keeps each selected genre whose name also exists in the other type's genre list, mapped to that type's id, and drops the rest. When any are dropped, `Removed: {names}` shows under the genre control until the next change. The resulting URL never holds a genre id that is invalid for its type.

## Decision

**Chosen option**: Option 1: Mode switching on the server, with bounded local filtering for a query combined with genre or rating.

`/search` picks one of four modes from its URL (browse, discover, plain search, filtered search), sends every filter TMDB can apply upstream, and filters the rest on the server over whole TMDB pages with a cursor, so every shown result and every count is true. The navbar quick search reads the same cached TMDB search through a public `GET /api/search` Route Handler.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for verifying quick search and the filter bar in the running app · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) for keeping `/search` in a prerendered shell with keyed Suspense.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: No tables and no migration. Nothing about a search is stored (a user's search history is out of scope). The app's own types change:

| Type | Change |
|---|---|
| `MovieSummary`, `TvShowSummary` (`lib/tmdb/types.ts`) | add `genreIds: number[]` from `genre_ids` (schemas, types, normalize: the three place change) |
| `DiscoverOptions` | add `minVoteCount?: number`, sent as `vote_count.gte` |
| `SearchParams` (new, `lib/search/params.ts`) | `{ type: "tv" \| "movie"; q: string \| null; genreIds: number[]; year: number \| null; rating: 5\|6\|7\|8\|9 \| null; page: number }`, `genreIds` deduplicated and sorted ascending |
| `SearchMode` (new, `lib/search/mode.ts`) | `"browse" \| "discover" \| "search" \| "filtered_search"` |
| `QuickSearchResponse` (new) | `{ totalResults: number; results: QuickResult[] }`, `QuickResult = { id; title; year: number \| null; posterUrl: string \| null; tmdbRating: number \| null; href }` |

**Constants** (in `lib/search/constants.ts`, pure): `QUICK_MIN_CHARS = 2`, `QUICK_DEBOUNCE_MS = 250`, `QUICK_LIMIT = 5`, `FILTER_DEBOUNCE_MS = 400`, `MAX_QUERY_LENGTH = 100`, `MIN_YEAR = 1900`, `RATING_STEPS = [5, 6, 7, 8, 9]`, `MIN_VOTE_COUNT = 100`, `SCAN_TARGET = 20`, `SCAN_MAX_PAGES = 5`, `SEARCH_COUNT_CAP = 10000`, `DISCOVER_COUNT_CAP = 20001`.

**State transitions**: none stored. The mode is a pure function of the parsed parameters:

| `q` | genres or rating | Mode | TMDB call |
|---|---|---|---|
| none | none, no year | browse | discover, no filters |
| none | any filter (incl. year alone) | discover | discover with filters |
| set | none (year allowed) | search | search with year upstream |
| set | at least one | filtered_search | search with year upstream, scan and filter locally |

Switching `type` in the filter bar maps genres across types as AC-24 states.

**API surface** (no mutations, no Server Actions):

| Endpoint or function | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/search` (page) | GET | `type`, `q`, `genre[]`, `year`, `rating`, `page` (AC-7) | filter bar, mode specific results, count, paging | public (movie bookmark reads the session in its own boundary) | invalid filter panel (AC-18), no such page, TMDB error panel (AC-19) |
| `/api/search` (Route Handler) | GET | `type`: `tv\|movie` (req), `q`: string 2 to 100 (req) | `{ totalResults, results[≤5] }` | public, no session | 400 `invalid`, 502 `upstream` with `kind` |
| `parseSearchParams(raw, genres, currentYear)` (`lib/search/params.ts`, pure) | fn | Next `searchParams` record, the type's genre list, current UTC year | `{ ok: true, params } \| { ok: false, param }` | n/a | returns the first invalid parameter name |
| `searchMode(params)` (`lib/search/mode.ts`, pure) | fn | `SearchParams` | `SearchMode` | n/a | none |
| `searchHref(params, overrides)` (`lib/search/params.ts`, pure) | fn | params plus changed fields | canonical `/search?...` URL (omits defaults, `page=1`, empty values) | n/a | none |
| `scanFilteredSearch(params)` (`lib/search/scan.ts`, server only) | fn | params in filtered_search mode | `{ results, fromIndex, toIndex, totalResults, nextPage \| null }` | n/a | rethrows `TmdbError` |
| `matchesFilters(summary, params)` (`lib/search/scan.ts` helper, pure) | fn | a summary with `genreIds`, `tmdbRating`, `tmdbVoteCount` | boolean | n/a | none |
| `formatResultCount(n, type, endpoint)` (`lib/search/count.ts`, pure) | fn | TMDB total, type, `"search" \| "discover"` | `1 show`, `1,234 movies`, `10,000+ shows` (search), `20,000+ shows` (discover) | n/a | none |
| `mapGenresAcrossTypes(ids, from, to)` (`lib/search/genres.ts`, pure) | fn | genre ids, both genre lists | `{ kept: number[], dropped: string[] }` | n/a | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Navbar field | search type and placeholder | `usePathname()` prefix, and on `/search` the `type` search param via `useSearchParams()` (both inside the navbar's existing Suspense pattern), else `tv` |
| Quick search | rows, year, rating, poster | `/api/search` response, built from the cached `searchTvShows`/`searchMovies` page 1; year is `releaseYear` or `firstAirYear`; poster through `imageUrl` at the smallest poster size |
| Quick search | count text | `formatResultCount(totalResults, type, "search")` |
| Quick search | active row, open state | client state in the combobox component |
| `/search` | genre options and names | cached `getTvGenres()` / `getMovieGenres()` (`max` lifetime) |
| `/search` | year options and the year upper bound | `new Date().getUTCFullYear() + 1`, read inside the streamed filter bar and in `parseSearchParams`'s caller at request time (never in the static shell) |
| `/search` | mode | `searchMode(params)` |
| `/search` browse, discover | results, `Page N of M` | `discoverX({ genreIds, year, minRating: rating, minVoteCount: rating ? 100 : undefined, page })`, `lastReachablePage(totalPages)` |
| `/search` browse, discover | count | `formatResultCount(totalResults, type, "discover")` |
| `/search` search | results, count | `searchX(q, { year, page })`, `formatResultCount(totalResults, type, "search")` |
| `/search` filtered search | results, `{from}–{to}`, total, next cursor | `scanFilteredSearch`: `fromIndex = (page − 1) × 20 + 1`, `toIndex = min(lastPageRead × 20, totalResults)`, `totalResults` from the first page read, `nextPage = lastPageRead + 1` when ≤ `lastReachablePage(totalPages)` |
| `/search` | a result's genres, rating, vote count for filtering | `genreIds`, `tmdbRating`, `tmdbVoteCount` on the summary (TMDB `genre_ids`, `vote_average`, `vote_count`); a null `tmdbRating` fails any rating filter |
| `/search` movie card | bookmark state, `returnPath` | existing `CardBookmark` (spec 0007) with `gridMovieIds` of the shown results and `returnPath = searchHref(params, {})` |
| `/search` | the kept genre ids and the removed genres note after a type switch | `mapGenresAcrossTypes` over both cached genre lists; the note lives in client state of the filter bar (not in the URL) |
| `/search` | page `<title>` | `q` from parsed params |

**Key invariants**:

- Every displayed result on `/search` satisfies every selected filter. Filters TMDB applies upstream are trusted; filters applied locally are checked on every result.
- A count is either TMDB's exact total below its endpoint's cap, the `10,000+` (search) or `20,000+` (discover) wording, or a labelled partial range. An unfiltered total is never shown as a filtered count.
- Filtered search always consumes whole TMDB pages, so the cursor never skips or repeats a result.
- Filtered search reads at most 5 TMDB pages per render, the first alone and the rest concurrently, consumed in page order; quick search reads at most 1.
- No search parameter reaches a `use cache` scope except through the existing module reads' plain arguments (query, type, filters), which are public, and never with a user value.
- `include_adult=false` stays on every search and discover call.
- Search keeps TMDB relevance order; browse and discover use popularity order. No other sort exists.

**Security model**: Everything here is public catalog data. The TMDB token stays in `lib/tmdb/env.ts`; the page and the Route Handler import only `lib/tmdb/index.ts`. Every parameter is validated with Zod before any TMDB call (AC-18, AC-20), the query is length capped, and the Route Handler reads no cookie or session, so its responses are safe for a shared CDN cache. The only session read is the existing `CardBookmark` boundary, whose output is never cached. No rate limiter is added now: the Route Handler costs at most one cached TMDB request per unique query per 5 minutes; a per IP limiter is a follow up for feature 20.

**Configuration required**: none.

**Components** (new unless noted):

- `components/search/quick-search.tsx` (client): the combobox field and panel, used by both the desktop field and the mobile overlay. Built on `@base-ui/react` `Autocomplete` (or `Combobox`, whichever supports an async list with no client filtering in the installed 1.8 version; verify at build time), styled with the glass utilities.
- `components/search/quick-search-row.tsx`: one row as drawn (poster 68px wide, title, year, star rating).
- `components/search/mobile-search-overlay.tsx` (client): icon button plus `@base-ui/react` `Dialog` full screen.
- `components/search/filter-bar.tsx` (client, rendered inside a server wrapper that fetches the genre list): the GET form, `Select` for year and rating, `Popover` with `CheckboxGroup` for genres, `ToggleGroup` for type.
- `components/search/result-count.tsx`: the exact, capped, or partial count line.
- `components/search/filtered-paging.tsx`: `More results` and `Back to first page`.
- `components/layout/navbar.tsx` (changed): removes the "search field deliberately absent" note and mounts the desktop field (in its own Suspense boundary with a same size fallback, AC-1) and the mobile icon.
- Reused: `PosterGrid`, `PosterCard`, `TmdbRatingBadge`, `PaginationLinks`, `StatePanel`, `RetryLink`, `PosterCardSkeleton`, `CardBookmark`, `GlassPill`.

**Proxy change**: add `api/` to the negative lookahead in the `proxy.ts` matcher, so no Route Handler under `app/api/` runs the session refresh (none of them needs a session).

**Routes**: `app/search/page.tsx` (static heading, two Suspense boundaries: filter bar, results keyed on `searchHref(params)`), `app/api/search/route.ts`.

**Critical test scenarios**:

- Happy path: typing `dune` on `/shows` shows 5 rows and `95 shows` (live value at time of writing); See all opens `/search?type=tv&q=dune` with the same count and numbered pages, verifies **AC-2**, **AC-3**, **AC-12**.
- Combined filters: `/search?type=movie&q=dune&genre=878&rating=7` shows only science fiction titles rated 7 or more with at least 100 votes, a partial count line, and a working `More results` cursor; a unit test feeds three fixture pages through `scanFilteredSearch` and asserts no failing result and no skipped or repeated id across two cursor pages, verifies **AC-13**, **AC-14**.
- Count truthfulness: `formatResultCount` gives `10,000+` for a search total of 10000, `20,000+` for a discover total of 20001, and an exact 15,342 for discover, verifies **AC-3**, **AC-12**.
- Type switch: `Drama` and `Soap` selected on shows, switch to movies, the URL keeps Movie Drama's id, drops Soap, and shows `Removed: Soap`, verifies **AC-24**.
- Cacheable handler: a signed in request to `/api/search` returns no `Set-Cookie`, verifies **AC-20**.
- Genre semantics: two genres produce `with_genres=18,35` in discover and require both ids locally, verifies **AC-10**.
- Invalid input: `/search?rating=7.5`, `/search?genre=999999`, `/search?type=anime` each show `That filter isn't valid` with no TMDB result request; `/api/search?q=a` answers 400, verifies **AC-18**, **AC-20**.
- Failure case: with TMDB unreachable, quick search shows `Couldn't reach TMDB` with Try again and no stale rows, and `/search` shows the error panel with the filter bar still usable, verifies **AC-5**, **AC-19**.
- Race: typing `du` then `dune` quickly never shows the `du` rows after the `dune` rows, verifies **AC-2**.
- Back navigation: open a result from a `More results` page, press Back, the same URL and results show, verifies **AC-17**.
- Auth/permission: a signed out visitor gets full search; `/api/search` responses carry `public` cache headers and differ in nothing when a session cookie is present, verifies **AC-20**, **AC-22**.

## Build plan

Tracer Bullet: first one thin real thread from the navbar to TMDB and back, then the results page one mode at a time, each end to end.

1. Add `genreIds` to both summaries, `minVoteCount` to `DiscoverOptions`, correct the `genreParam` comment, and extend fixtures and the live check, satisfies **AC-10**, **AC-23**
2. Add the pure `lib/search/` helpers (`constants`, `count`, `params` with `parseSearchParams` and `searchHref`, `mode`, `genres`) with unit tests, satisfies **AC-3**, **AC-7**, **AC-18**
3. Thin thread: `GET /api/search` (with the proxy matcher exclusion) plus a minimal desktop quick search field in the navbar that lists rows and links See all to `/search?type=...&q=...`, and a bare `/search` page rendering plain search mode results; verify it end to end in the running app, satisfies **AC-1**, **AC-12**, **AC-20**
4. Thicken quick search to the design: row layout, count, empty, skeleton and error states, debounce and cancellation, full combobox keyboard behavior, the navbar Suspense fallback, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**
5. Mobile search icon and full screen overlay, satisfies **AC-6**
6. `/search` shell and filter bar as a GET form with instant apply, type switch genre mapping, vote floor note, and keyed Suspense skeletons, satisfies **AC-8**, **AC-9**, **AC-21**, **AC-24**
7. Browse and discover modes with numbered paging and exact counts, satisfies **AC-11**, **AC-12**
8. Filtered search mode: `scanFilteredSearch` and `matchesFilters` with fixture tests, partial count, `More results` cursor and the empty scan state, satisfies **AC-10**, **AC-13**, **AC-14**, **AC-15**
9. Result cards with year meta and the movie bookmark, invalid filter and no such page states, TMDB error states, satisfies **AC-15**, **AC-16**, **AC-18**, **AC-19**
10. Metadata and `noindex`, extend the layout purity and request scope tests to `app/search/` and `app/api/search/`, confirm `pnpm build` reports `/search` partially prerendered, satisfies **AC-21**, **AC-22**
11. Runtime verification: Back navigation keeps filters and cursor, 375px layout, keyboard only pass, satisfies **AC-6**, **AC-17**

## Consequences

**Positive**:

- Every result and count on screen is true to the chosen filters, which is the rule AGENTS.md section 10 sets.
- Each result page is fully described by its URL, so share, reload and Back all work without client state.
- Quick search reuses the cached TMDB reads and a CDN cacheable GET, so repeated popular queries cost almost nothing.

**Negative / tradeoffs**:

- Filtered search mode has no page numbers and no exact total; you page forward with `More results` and go back with the browser or `Back to first page`.
- A narrow combined filter over a broad query can take 5 TMDB requests for one page and still find few matches; the empty scan state says so honestly but is less satisfying than a count.
- A filtered search page may show up to 39 results (whole pages are consumed), so pages are not uniform in size.
- The 100 vote floor hides real but little known titles whenever a rating is set; it is stated in the UI, not configurable.
- `/api/search` is an unauthenticated endpoint spending the TMDB token, protected only by validation and caching until a limiter lands.

**Neutral**:

- Two summary types gain `genreIds`, which every summary read now carries.
- The navbar gains two client components (desktop field, mobile overlay); the rest of the shell stays server rendered.
- `/search` is `noindex`; SEO for catalog pages remains feature 17.
- The GET form covers the time before hydration (slow or failed bundles), not a browser with JavaScript turned off; that case is unsupported across the whole app, because Cache Components streams every dynamic part.

## Follow-up

- [ ] Add a per IP rate limit to `/api/search` before public launch (feature 20).
- [ ] Confirm at build time which Base UI 1.8 primitive (`Autocomplete` or `Combobox`) fits an async, server filtered list; fall back to a hand built ARIA combobox only if neither does.
- [ ] Record in root `AGENTS.md` (through `/sync`) that the app needs JavaScript: streamed Suspense boundaries, the navbar included, stay hidden when it is turned off, so progressive enhancement means "before hydration", never "JavaScript off".
- [ ] The 10,000 and 20,001 caps were observed live on 2026-09-24. Make the live check assert them, and run `pnpm tmdb:live` before release, since it is opt in and not part of CI.
