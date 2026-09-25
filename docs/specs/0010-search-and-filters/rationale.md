# 0010. Search and filters: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Scope feature 11 asks for a full results page for movies or TV with a title query, genre, year and minimum TMDB rating filters, shareable URLs and pagination, plus the quick search the navbar references draw (`design/desktop-search-open.svg`: the top 5 rows, TMDB's count, See all). AGENTS.md section 10 sets hard rules: every displayed result meets the selected filters, an unfiltered total is never shown as a filtered count, relevance order is kept for title searches, filters survive opening a title and returning, and failures offer a retry. No reference exists for the results page or the mobile search overlay.

TMDB's two families of endpoints do not overlap. Checked live on 2026-09-24:

- `/search/movie` and `/search/tv` take a query, a page and a year (`primary_release_year`, `first_air_date_year`). They silently ignore `with_genres` and `vote_average.gte`: `query=dune` returns 1112 results with or without them. Each result does carry `genre_ids`, `vote_average` and `vote_count`, so the missing filters can be checked on our side.
- `/discover/movie` and `/discover/tv` take every filter but no query. In `with_genres`, a comma means all of the genres (Drama and Comedy in 2020: 994) and a pipe means any (11779). The existing comment in `lib/tmdb/search.ts` says the opposite.
- A minimum rating alone is dominated by titles with a handful of votes: `vote_average.gte=8` for 2020 matches 2865 movies, and 29 once `vote_count.gte=100` is added.
- Totals are capped: discover reports 20001 results (1001 pages) for any broad filter, search reports at most 10000 (500 pages), and every endpoint refuses page 501.

The app already has the pieces around this: cached search, discover and genre reads in `lib/tmdb/` (spec 0002), a landing grid with `PaginationLinks`, `StatePanel` and `RetryLink` (spec 0006), the movie `CardBookmark` (spec 0007), and a navbar that left the search field out on purpose until now. `cacheComponents` is on, so a new route must keep a prerendered shell and must not let request data reach a cached scope.

Without a decision the builder would have to choose, mid build, what a query plus genre means, what count to print, and how paging works when upstream pages shrink after filtering. Each wrong guess breaks a stated product rule.

## Options considered

### Option 1: Mode switching with bounded local filtering (chosen)

The URL decides one of four modes. Without a query, discover applies every filter upstream. With a query and only a year, search applies it upstream. With a query and a genre or rating, search runs with the year upstream and the server filters each result on `genre_ids`, rating and vote count, reading whole TMDB pages in order until 20 matches or 5 pages, and hands a cursor (the next TMDB page) to a `More results` link. The count is exact where TMDB's is, and labelled partial otherwise.

**Pros**:

- Every rule in AGENTS.md section 10 holds by construction: no failing result, no false total, relevance order kept.
- The common cases (browse, filters only, title only) keep numbered pages and exact counts.
- Stateless and shareable: the cursor is just the `page` parameter.

**Cons**:

- The combined mode loses page numbers and an exact total.
- A narrow combination can cost 5 TMDB requests and still find little.

### Option 2: One TMDB page per results page, filtered

Page N of the results is TMDB search page N with non matching results removed.

**Pros**:

- The simplest code, with stable page numbers.

**Cons**:

- Pages are uneven and often empty, which reads as broken.
- `Page N of M` would still imply a total for results that were filtered out.

### Option 3: A query turns off genre and rating

With a query, only the year applies; genre and rating controls are disabled.

**Pros**:

- No local filtering at all; every mode has exact counts.

**Cons**:

- Breaks AGENTS.md section 10, which requires combining a title query with filters.

### Option 4: Pull all search pages, then filter and paginate

Read every TMDB search page for the query, filter, and paginate the filtered set with an exact count.

**Pros**:

- Exact filtered counts and numbered pages.

**Cons**:

- Unbounded: a broad query is 500 requests per render, which TMDB's rate limit and the 8 second deadline cannot absorb.

## Rationale

Option 1 is the only option that keeps every section 10 rule while staying bounded. Options 2 and 3 are cheaper but each breaks a rule outright (uneven pages that still pretend to a total, or combinations that are simply not allowed). Option 4 is the only one with an exact filtered count, but its cost grows with the query, not with what the user sees, which is the failure mode TMDB's rate limit punishes.

Keeping whole TMDB pages as the unit of the cursor is what makes Option 1 correct: a page is either fully read or not read, so `More results` can never skip or repeat a result, and the URL alone reproduces the page. The cap of 5 pages bounds the worst case to 5 cached requests; the target of 20 matches mirrors the landing page size. The partial count names exactly what was checked (`12 matches in TMDB results 1–100 of 1,112`), which is the "explicitly indicate that it is partial" path section 10 allows.

Quick search is a different job (typeahead over a query only), so it gets the thinnest path: page 1 of the cached search through a GET Route Handler. GET, not a Server Action, because typeahead needs parallel, cancellable, cacheable reads, while Server Actions are POST, run one at a time per client, and are meant for mutations.

### Decisions settled with the engineer

- Both surfaces: quick search as drawn and the full `/search` page.
- Query plus genre or rating: local filtering over scanned pages (this option).
- Several genres match all of them (comma syntax), not any.
- A minimum rating adds a stated floor of 100 TMDB votes.
- Route `/search?type=...`, not `/movies/search` (which `proxy.ts` would 404 as a malformed id).
- The navbar field follows the tab, else shows.
- Quick search through a GET Route Handler; 2 characters, 250 ms, top 5.
- Mobile: a full screen overlay from the search icon.
- Results page reuses the landing grid with a glass filter bar; empty `/search` shows popular titles.
- Single year select from next year back to 1900; rating steps 5+ to 9+.
- Combined mode paging: a `More results` cursor link; count labelled partial.
- Abuse guard: validation and CDN caching now, a limiter later.
- Discover order: popularity, no sort control.
- An invalid URL parameter shows an invalid filter state, never silently ignored.
- Quick search failure: inline error with Try again.
- Filters apply instantly over a real GET form; a type switch keeps genres that share a name.

### Decisions settled while writing (runner up in brackets)

- **Count cap wording, per endpoint**: a search total of 10,000 or more reads `10,000+`, a discover total of 20,001 or more reads `20,000+`, anything lower is exact [print TMDB's number; or one 10,000 cap for both, which would flatten real discover totals such as 15,342]. TMDB reports 10000 and 20001 as ceilings, so printing them would be a false count.
- **Proxy skips `api/`** [let the proxy run and drop CDN caching], because the session refresh can attach `Set-Cookie`, which stops a CDN from caching a response, and the handler needs no session.
- **Navbar field in its own Suspense boundary** [share the tabs' boundary], so the `useSearchParams` read, needed only on `/search`, never pulls other routes out of their prerendered shells.
- **Consume whole pages** in the scan, even past 20 matches [trim to exactly 20], because trimming would lose results between cursor pages.
- **Fetch plan for the scan**: read the first page alone, then the rest of the budget in parallel through the module's concurrency cap, consuming in order [strictly sequential], to keep latency near one round trip in the slow case.
- **`page` keeps one meaning** (the TMDB page to start at) in every mode [a separate `from` cursor parameter], since in the other modes a results page is exactly a TMDB page.
- **Repeated `genre` parameters** [`genre=18,35`], because that is what a native GET form with checkboxes submits, so the no JavaScript path needs no conversion.
- **Keyed Suspense** on the canonical URL [a pending opacity only], so a filter change never leaves stale results looking current.
- **`noindex, follow`** on `/search` [indexable], since endless filter combinations are thin duplicate pages; catalog SEO is feature 17.
- **A null TMDB rating fails any rating filter** [passes it], because the title has no rating to meet the minimum.
- **Year bound from the request time UTC year plus one** [a fixed constant], read only in streamed parts so the shell stays static.
- **Removed genre note in client state** [in the URL], because it describes the last change, not the result set.

### Update 2026-09-24: what "works without JavaScript" means (AC-9)

`/check verify` found that with JavaScript turned off, `/search` shows only the navbar shell and the heading. The filter bar and the results sit in hidden streamed segments (`<div hidden id="S:4">`), because React reveals each streamed Suspense boundary with a small inline script. The same holds for the navbar on every route. With the JavaScript bundles blocked instead (the page never hydrates, but the inline scripts run), the production build showed the bar, `Apply` and 20 results. Choosing 2020 and pressing Apply loaded `/search?q=&type=tv&year=2020&rating=`, with `10,215 shows`, all from 2020. So for the text field, type, year and rating, AC-9's real purpose (a usable form before hydration) held; only the literal JavaScript off test failed. That run exercised the year control alone. A cross check then found three limits before hydration, which were accepted and written into AC-9 rather than fixed in code: the genre popover cannot open, a type switch resubmits the old type's genre ids (an unknown one lands on the invalid filter panel), and the submitted URL is not canonical but parses the same. Each is short lived (it lasts only until hydration) and truthful, and fixing any of them would mean building a second genre control for a window of a second or two.

Options weighed with the engineer:

- **Before hydration only (chosen)**: reword AC-9 and its verify step to test blocked bundles, and record that the app needs JavaScript. No code change. It keeps the prerendered shell and skeletons of AC-21.
- **Opt `/search` out of streaming** (`instant = false`, no Suspense): works with JavaScript off, but nothing shows until TMDB answers (up to 5 pages in filtered search), it drops AC-21, goes against the project's Cache Components direction, and the navbar would still be hidden.
- **A `<noscript>` form in the static shell**: the shell is static, so it cannot show the current filters, and the results stay hidden. Almost no real value.
