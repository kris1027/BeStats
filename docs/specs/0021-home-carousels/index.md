# 0021. Home carousels: rows of TMDB lists on /shows and /movies, each with a paged See all page

**Date**: 2026-10-12
**Status**: Accepted
**Amended**: 2026-10-13. A See all page shows 24 titles, read from the two TMDB pages that hold them; the landing rows still read TMDB page 1. See [spec 0022](../0022-card-size-title-pages/index.md), AC-21.
**Superseded in part**: 2026-10-18. The landing rows (AC-1, AC-5, AC-6 and the landing half of AC-7) are replaced by the parallax landing in [prompts/home-parallax-landing.md](../../../prompts/home-parallax-landing.md). The See all pages, the registry, the dispatcher, AC-15 metadata and the sitemap stand.

Scope feature: [24. Home carousels](../../scope/scope.md) · Beta tier

## Summary

`/shows` and `/movies` stop being one paged grid of 20 popular titles. Each becomes five rows that scroll sideways (carousels): trending, popular, two date based lists, and top rated, each holding 12 full poster cards with the same badge, meta and controls the grid has today. Every row links to its own See all page (`/shows/popular`, `/movies/now-playing` and so on) that pages exactly like today's grid. Nothing is stored and no schema changes: this is new TMDB reads, ten new public routes, a proxy rule, a redirect for old `?page=N` links, and sitemap entries.

## Requirements

**User stories**:

- As a visitor, I want the shows and movies landings to show several kinds of lists at once (trending, popular, airing, top rated), so that I can find something to watch without paging through one list.
- As a visitor, I want each row to scroll sideways by touch, trackpad, keyboard or arrow buttons, so that I can browse it on any device.
- As a visitor, I want a See all link on each row that opens the whole list with pages, so that I can go deeper into the one list I care about.
- As a signed in user, I want every card in a row to show and change my tracking state exactly as the grid does today, so that I can plan or track straight from the landing.
- As someone with an old `/shows?page=3` bookmark, I want it to keep working, so that my link does not break.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/shows` shows the h1 `Shows` and, under it, five rows in this order: `Trending this week`, `Popular`, `Airing today`, `On the air`, `Top rated`. `/movies` shows the h1 `Movies` and the rows `Trending this week`, `Popular`, `Now playing`, `Upcoming`, `Top rated`. Each row is a `<section>` labelled by its h2, with a `See all` link at the right of the row header leading to that row's list page (AC-9). The h1 uses today's landing heading style; there is no subtitle line under it. Each row h2 is `text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl`; rows are spaced `gap-10`, and the h1 sits `gap-8` above the first row. See all is a plain text link (`text-sm text-muted-foreground hover:text-foreground`, 44px tap target through the `hit-area` utilities) with a lucide `ChevronRight` icon.
- **AC-2**: Each row and its list page read exactly this TMDB source, in TMDB's order:

  | Media | Slug | Row title | TMDB source |
  |---|---|---|---|
  | TV | `trending` | Trending this week | `/trending/tv/week` |
  | TV | `popular` | Popular | `/discover/tv` (today's `discoverTvShows`, unchanged) |
  | TV | `airing-today` | Airing today | `/tv/airing_today?timezone=Europe/Warsaw` |
  | TV | `on-the-air` | On the air | `/tv/on_the_air?timezone=Europe/Warsaw` |
  | TV | `top-rated` | Top rated | `/tv/top_rated` |
  | Movie | `trending` | Trending this week | `/trending/movie/week` |
  | Movie | `popular` | Popular | `/discover/movie` (today's `discoverMovies`, unchanged) |
  | Movie | `now-playing` | Now playing | `/movie/now_playing?region=PL` |
  | Movie | `upcoming` | Upcoming | `/movie/upcoming?region=PL` |
  | Movie | `top-rated` | Top rated | `/movie/top_rated` |

  Every request also sends `en-US` and `page` as the module already does. No other row sends `region` or `timezone`.
- **AC-3**: A row holds the first 12 titles of TMDB page 1 of its source (fewer when TMDB returns fewer, or after AC-8 drops some). Page 1 of a row's list page is the very same cached read with the same arguments, so opening See all costs no extra TMDB request while the entry is fresh.
- **AC-4**: Each card in a row is the full `PosterCard` the grid uses today: the TMDB badge replaced by the personal state (`ShowCardBadge` or `MovieCardBadge`), the TV meta line (`ShowCardMeta`), and the controls (`ShowCardControls` or `MovieCardControls`), each in its own Suspense boundary with today's fallbacks. The grid ids passed to the slots are that row's ids, so a card shows the title exactly as its library page does (prompts/catalog-card-status.md). `returnPath` is `/shows` or `/movies` on a landing, and the current page's URL on a list page. A missing poster shows today's fallback tile.
- **AC-5**: A row's cards sit in one line that scrolls sideways inside the row, with scroll snap on each card's start edge, `gap-3` between cards (`md:gap-4`, as the cast row), and the scrollbar hidden visually while the row stays scrollable. Cards are 140px wide, 180px from `md`, and their poster `sizes` is `(min-width: 768px) 180px, 140px`. The row never widens the page: at 375px there is no horizontal page scroll. The scroll area is a focusable region (`tabIndex=0`, labelled `{row title}`) with a visible focus ring, so a keyboard user can tab to it and scroll it with the arrow keys; touch and trackpad scroll natively.
- **AC-6**: From `md` up, each row header shows two round icon buttons beside See all, `Scroll {row title} back` and `Scroll {row title} forward`, round icon `Button`s with lucide `ChevronLeft` and `ChevronRight`, each with a 44px tap target. A press scrolls the row by 90% of its visible width, smoothly unless `prefers-reduced-motion: reduce` is set (then instantly). A button is disabled when the row is within 1px of that end (`scrollLeft <= 1`, `scrollLeft + clientWidth >= scrollWidth - 1`). Both start disabled until the first measurement after hydration, and both stay disabled when the row does not overflow, including the AC-11 error and AC-12 empty states. Below `md` the buttons are not shown. Before hydration (or with the client bundle failing) the row still scrolls natively and the buttons are inert.
- **AC-7**: The h1, every row header (h2, See all link, arrow buttons) and the list page headings are part of the prerendered shell. Each row's cards stream in their own Suspense boundary whose fallback is 12 card skeletons at the row's card width, so the page does not shift when a row arrives. Rows read TMDB at request time (`await connection()` before the read), so `pnpm build` makes no TMDB request and passes with no `TMDB_READ_ACCESS_TOKEN` set, as it does in CI today. On both landings the first 6 cards of row 0 load their posters eagerly (`priority`); every other row card is lazy. List pages keep today's first 4 grid cards eager.
- **AC-8**: The trending, airing today, on the air, now playing, upcoming and top rated reads drop every result TMDB flags `adult: true` before it reaches a page, keeping the promise discover keeps with `include_adult=false`. `totalPages` and `totalResults` are passed through unchanged.
- **AC-9**: Each of the ten slugs has a public list page at `/shows/{slug}` or `/movies/{slug}`. It shows a back link `← Shows` or `← Movies` to the landing above an h1, then a one line source note, then a `PosterGrid` of up to 20 full cards (AC-4) and `PaginationLinks` exactly as today's landing grid (`Page N of M`, `M = lastReachablePage(totalPages)`, page 1 is the bare path, page N is `?page=N`). The h1 and note per list:

  | List | h1 | Note | `pageNoun` |
  |---|---|---|---|
  | TV trending | Trending shows this week | TMDB's most watched shows over the past week. | trending shows |
  | TV popular | Popular shows | Ordered by current popularity on TMDB. | popular shows |
  | TV airing today | Shows airing today | Shows with an episode airing today, Polish time, per TMDB. | shows airing today |
  | TV on the air | Shows on the air | Shows with an episode airing in the next 7 days, per TMDB. | shows on the air |
  | TV top rated | Top rated shows | Ordered by TMDB community rating. | top rated shows |
  | Movie trending | Trending movies this week | TMDB's most watched movies over the past week. | trending movies |
  | Movie popular | Popular movies | Ordered by current popularity on TMDB. | popular movies |
  | Movie now playing | Movies now playing | In Polish cinemas now, per TMDB. | movies now playing |
  | Movie upcoming | Upcoming movies | Coming soon to Polish cinemas, per TMDB. | upcoming movies |
  | Movie top rated | Top rated movies | Ordered by TMDB community rating. | top rated movies |
- **AC-10**: On a list page, a `page` that `parsePageParam` refuses, or one past the last reachable page, shows today's `That page doesn't exist` empty panel (`There are no {pageNoun} at this page number.`, `pageNoun` from the registry, AC-9 table) with `Back to page 1` linking the bare list path. A failed TMDB read shows today's `Couldn't reach TMDB` error panel with `Try again` (`RetryLink`) to the current page URL. A page with zero results on page 1 shows an empty panel titled `This list is empty` with `TMDB lists nothing here right now.` with the back link still above it. While loading, the grid shows 20 card skeletons and the pagination skeleton, as today.
- **AC-11**: When one row's TMDB read fails with a `TmdbError`, only that row changes: in place of its cards it shows a compact error state, `Couldn't load {row title}` with `TMDB didn't respond.` and a `Try again` `RetryLink` to the landing path, reserving the row skeleton's height so nothing shifts. Its header, See all link and every other row render normally. Any error that is not a `TmdbError` is rethrown, as everywhere else.
- **AC-12**: When a row's read succeeds with no titles, its header stays and a single muted line `Nothing here right now.` shows in place of the cards, reserving the row skeleton's height; See all stays.
- **AC-13**: The proxy lets `/shows/{slug}` through for the five TV slugs and `/movies/{slug}` for the five movie slugs, before the numeric id check, and still answers a real 404 for every other non numeric segment: `/shows/upcoming`, `/shows/now-playing`, `/movies/airing-today`, `/movies/on-the-air`, `/shows/Popular`, `/shows/popular.jpg`, and `/shows/popular/season/1`. Numeric ids behave exactly as today.
- **AC-14**: A request to `/shows` or `/movies` carrying a `page` query parameter (any value) answers `308` to `/shows/popular` or `/movies/popular` with the original query string kept (`/shows?page=3` → `/shows/popular?page=3`). Declared in `redirects()` in `next.config.ts` with `permanent: true`, so nothing renders. A browser caches a 308 indefinitely; that is accepted here because `/shows?page=N` has no future meaning (unlike `/`, which stays temporary). A unit test asserts both redirect entries. `/shows` with no `page` renders the landing.
- **AC-15**: Metadata. A landing's title is `Shows` or `Movies`, its canonical is the bare path, and its description is, for `/shows`, `Browse trending, popular, airing and top rated TV shows on BeStats, and keep track of what you watch.` and, for `/movies`, `Browse trending, popular, now playing, upcoming and top rated movies on BeStats, and keep track of what you watch.` A list page's description is its `note`. A list page's title is its h1; page 1's canonical is the bare list path and page N's is `?page=N`. An invalid page, a page past the last, or a failed read is `noindex` with no canonical. List metadata reuses the body's cached read, so it costs no extra TMDB request (the existing `landingPageMetadata` flow, given a thin adapter `({ page }) => readCatalogList(list, page)` as `discover` and `listPageHref` as `pageHref`).
- **AC-16**: The sitemap lists, after `/movies` and `/shows`, the ten list paths at page 1: the five movie lists first, then the five TV lists, each group in row order (AC-1). `sitemapEntries` gains a `listPaths: string[]` argument built from the registry, then the legal pages, then the titles from discover pages 1 to 10 exactly as today. Only bare list paths are listed, never `?page=N`.
- **AC-17**: No new read puts user data in a shared cache: the TMDB list reads are `use cache` scopes with no cookie, header or search param inside them, and the only session reads on these pages are the existing card slots. The new reads live for `hours` on success and take `failureProfile` on failure. The landings and list pages are covered by the request scope test the grid pages have today.

## Decision

**Chosen option**: Option 2: one list registry, two new TMDB reads, and static routes per slug sharing one list page component.

A pure registry (`lib/catalog/lists.ts`) names every slug, its media type, row title, h1, note and paths; the TMDB module gains `getTvList(kind, { page })` and `getMovieList(kind, { page })` for the eight non popular lists while Popular keeps today's discover reads; each slug gets its own small static route that renders a shared list page, and the landings render one shared carousel row per registry entry.

**Implementation skills**: `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) for keeping the landing's headings in the prerendered shell while each row streams · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking the rows, arrows, redirect and 404s in the running app.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no tables, no migration. Nothing about a list is stored. App level additions:

- `lib/catalog/lists.ts` (pure, no `server-only`, so the proxy and the sitemap can import it):
  - `TV_LIST_SLUGS = ["trending", "popular", "airing-today", "on-the-air", "top-rated"] as const`, `MOVIE_LIST_SLUGS = ["trending", "popular", "now-playing", "upcoming", "top-rated"] as const`, in row order.
  - `CatalogList = { mediaType: "tv" | "movie"; slug; rowTitle; heading; note; pageNoun }` and `CATALOG_LISTS`, one entry per row, text from AC-1 and AC-9. The AC-12 line is the same on every row, so it lives in `CarouselRowEmpty`, not the registry.
  - `listPath(list)` → `/shows/{slug}` or `/movies/{slug}`; `listPageHref(list, page)` → bare path for page 1, `?page=N` beyond.
  - `isCatalogListSlug(mediaType, segment)`, an exact, case sensitive match, used by the proxy on the undecoded segment: Next routes `/shows/top%2Drated` to `[id]`, not to the list folder, so an encoded slug is a 404.
- `lib/tmdb/types.ts`: `TvListKind = "trending" | "airing_today" | "on_the_air" | "top_rated"`, `MovieListKind = "trending" | "now_playing" | "upcoming" | "top_rated"`. TMDB's own names, so the module never learns the app's slugs.
- `lib/tmdb/constants.ts`: `TV_LIST_TIMEZONE = "Europe/Warsaw"`, `MOVIE_LIST_REGION = "PL"`.
- `lib/tmdb/lists.ts` (new, server only): `fetchTvList(kind, { page })` and `fetchMovieList(kind, { page })`, the inner halves. Each maps the kind to its endpoint (trending uses `/trending/{tv|movie}/week`), adds `timezone` only for `airing_today` and `on_the_air` and `region` only for `now_playing` and `upcoming`, validates with `pagedSchema(tvListItemSchema)` or `pagedSchema(movieListItemSchema)`, new schemas that extend the summary schemas with `adult` (the summaries do not read it), drops `adult === true` results, normalizes with the existing summary normalizers, and returns `Paged<…>` with TMDB's `page`, `totalPages`, `totalResults` unchanged.
- `lib/tmdb/reads.ts`: `getTvList` and `getMovieList`, the `use cache` wrappers, `cacheLife("hours")` on success, `cacheFailure` on failure. Exported from `lib/tmdb/index.ts` with the two kind types.
- `lib/catalog-list-read.ts` (server side, beside `lib/landing-metadata.ts` for the same reason: it touches TMDB at runtime): `readCatalogList(list, page)` returns `Paged<TvShowSummary>` or `Paged<MovieSummary>` by dispatching `popular` to `discoverTvShows` / `discoverMovies` and every other slug to `getTvList` / `getMovieList` with the mapped kind. The one place a slug becomes a TMDB call.

**State transitions**: none.

**API surface** (pages only, no mutations, no Route Handlers, no Server Actions; all public, no auth):

| Route | Inputs | Output | Errors |
|---|---|---|---|
| `GET /shows`, `GET /movies` | none (a `page` param never reaches it, AC-14) | h1 + five carousel rows | per row error state (AC-11) |
| `GET /shows?page=…`, `GET /movies?page=…` | `page` | `308` to `/{shows,movies}/popular?page=…` | none |
| `GET /shows/{slug}` ×5, `GET /movies/{slug}` ×5 | `page` (`parsePageParam`) | list page, 20 cards + pagination | no such page panel, TMDB error panel (AC-10) |
| `GET /shows/{other non numeric}`, `GET /movies/{…}` | path | `404` from the proxy | n/a |

**Routes**: `app/shows/{trending,popular,airing-today,on-the-air,top-rated}/page.tsx` and `app/movies/{trending,popular,now-playing,upcoming,top-rated}/page.tsx`. Each file is a few lines: it picks its registry entry and renders `CatalogListPage` and exports `generateMetadata` through the shared helper. Static segments win over `app/shows/[id]` and `app/movies/[id]`, so no dynamic route has to branch on a slug. `app/shows/page.tsx` and `app/movies/page.tsx` become the landings (no `searchParams`, static metadata).

**Components** (new unless noted):

- `components/catalog/carousel-row.tsx` (server): the `<section aria-labelledby>`, the header (h2, See all `Link`, the arrow buttons), and a Suspense boundary around `CarouselRowItems`, whose fallback is `CarouselRowSkeleton`.
- `CarouselRowItems` (server, same file or a sibling): `await connection()`, `readCatalogList(list, 1)`, catch `TmdbError` into the AC-11 state, the AC-12 empty line, else a `<ul>` of up to 12 `PosterCard`s with the slots, keyed by title id. Takes `eagerCount` (6 for the first row, 0 for the rest).
- `components/catalog/carousel-scroller.tsx` (client, `"use client"`): wraps the server rendered `<ul>` (passed as children) in the focusable scroll region; owns the two arrow buttons, a scroll listener and a `ResizeObserver` for their disabled state, and `scrollBy` with `behavior` from `matchMedia("(prefers-reduced-motion: reduce)")`. Because the buttons sit in the header and the region in the body, the row renders the scroller around both (header slot plus children) so one client component owns both ends; it holds no data and reads no session.
- `components/catalog/catalog-list-page.tsx` (server): back link, h1, note, then the Suspense wrapped grid that today's `PopularShows` / `PopularMovies` render, generalized over the registry entry (no such page, error, empty, pagination, skeleton). The two media specific card renderers (`ShowListCard`, `MovieListCard`) are extracted from today's landing pages and shared by rows and list pages.
- `components/poster-card.tsx` (changed): a new optional `sizes` prop, defaulting to `POSTER_SIZES`, so the carousel can pass its fixed string. `PosterCardSkeleton` already accepts `className`, which the row uses for the fixed width.

**Existing tests to rewrite** (not delete): `app/movies/page.test.ts` and `app/movies/request-scope.test.ts` cover the old paged landing; they move to the landing and the list pages (`/movies` and `/movies/popular` at least), and `lib/seo/sitemap` tests gain the list paths.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Landing render | Which rows, their order, titles, See all hrefs | `CATALOG_LISTS` filtered by media type, in slug order; `listPath` |
| Row render | Titles in the row | `readCatalogList(list, 1)`, first 12 of `results` |
| Row render | `region=PL` / `timezone=Europe/Warsaw` | `MOVIE_LIST_REGION`, `TV_LIST_TIMEZONE` in `lib/tmdb/constants.ts`, applied by kind in `fetchMovieList` / `fetchTvList` |
| Row render | Card badge, meta, controls | existing slots, `gridShowIds` / `gridMovieIds` = the row's ids |
| Row render | `returnPath` | `/shows` or `/movies` (the landing) |
| Row render | Which cards are `priority` | row index 0 and card index < 6, on both landings |
| Row render | Error and empty text | AC-11 template with `rowTitle`; one AC-12 line in `CarouselRowEmpty` |
| Arrow buttons | Disabled state, scroll distance | the region's `scrollLeft`, `scrollWidth`, `clientWidth` in the browser; 90% of `clientWidth` |
| Arrow buttons | Smooth or instant | `prefers-reduced-motion` media query |
| List page | Page number | `searchParams.page` through `parsePageParam` |
| List page | Titles, last page | `readCatalogList(list, page)`; `lastReachablePage(totalPages)` |
| List page | h1, note, back link | registry `heading`, `note`; `/shows` or `/movies` |
| List page | `returnPath`, Retry href, canonical | `listPageHref(list, page)` |
| Adult filter | Which results are dropped | TMDB's `adult` field on each list result |
| Proxy | Is a segment a known slug | `isCatalogListSlug` from the registry |
| Redirect | Destination and kept query | `next.config.ts` rule with `has: [{ type: "query", key: "page" }]`; Next carries the source query to the destination |
| Sitemap | List URLs | `CATALOG_LISTS` → `listPath`, prefixed with `siteUrl()` |
| Metadata | Title, description, canonical, `noindex` | registry `heading` and `note`; the AC-15 landing strings; `landingPageMetadata` with the `readCatalogList` adapter and `listPageHref` |
| List page | No such page text | registry `pageNoun` |

**Key invariants**:

- A slug is defined once, in `lib/catalog/lists.ts`. The routes, proxy, sitemap and landings all read it from there; a test fails if a `app/shows/*` or `app/movies/*` static folder exists with no registry entry, or the reverse.
- The row and page 1 of its list call `readCatalogList(list, 1)` with identical arguments, so they share one cache entry (AC-3).
- Popular reads `discoverTvShows({ page })` / `discoverMovies({ page })` with no other option, the exact calls the sitemap makes, so the sitemap keeps sharing those entries.
- No cached TMDB scope reads a cookie, header or search param; `connection()` is called outside the cached read, in the row component.
- A row never throws a `TmdbError` past its own boundary; any other error is rethrown.
- Region and timezone are applied only to the four kinds named in AC-2.

**Security model**: everything here is public catalog data with no new write path. The TMDB token stays in `lib/tmdb/env.ts`; pages import only `lib/tmdb/index.ts`. The only user specific reads are the existing card slots in their own Suspense boundaries, never inside a cached scope. The proxy change only widens which public paths render; it adds no private path. `page` is validated by `parsePageParam` before any TMDB call; slugs are matched exactly against a fixed list.

**Configuration required**: none. No new environment variable, no Vercel or Supabase change.

**Critical test scenarios**:

- Happy path: `/shows` renders five rows in AC-1 order with up to 12 cards each, See all on `Airing today` opens `/shows/airing-today` with 20 cards and pagination, and its page 1 matches the row's first 12, verifies **AC-1**, **AC-2**, **AC-3**, **AC-9**.
- Request shape: `fetchMovieList("now_playing")` sends `region=PL` and no timezone, `fetchTvList("airing_today")` sends `timezone=Europe/Warsaw` and no region, `fetchTvList("trending")` hits `/trending/tv/week` with neither; an `adult: true` fixture result is dropped and totals pass through, verifies **AC-2**, **AC-8**.
- One row fails: a fixture where only `top_rated` returns 503 renders four rows and one `Couldn't load Top rated` state with Try again to `/shows`, verifies **AC-11**.
- Empty row: an `airing_today` fixture with no results shows `Nothing here right now.` and See all, verifies **AC-12**.
- Build without a token: `pnpm build` with `TMDB_READ_ACCESS_TOKEN` unset succeeds, verifies **AC-7**.
- Proxy: known slugs pass, the AC-13 list of wrong slugs and casing answers 404, numeric ids unchanged, verifies **AC-13**.
- Redirect: `/movies?page=7` answers 308 to `/movies/popular?page=7`; `/movies?page=abc` answers 308 to `/movies/popular?page=abc`, which shows `That page doesn't exist`, verifies **AC-14**, **AC-10**.
- Arrows: at 1280px the back button starts disabled, forward scrolls the row and enables back, at the end forward disables; at 375px no button shows and the page has no horizontal scroll; with reduced motion the scroll is instant, verifies **AC-5**, **AC-6**.
- Card state: signed in, a tracked show in the `Popular` row shows the same badge and controls as on its library page, and planning a movie from the `Upcoming` row follows the release gate, verifies **AC-4**.
- Metadata and sitemap: `/shows/top-rated?page=2` has canonical `/shows/top-rated?page=2`; `/shows/top-rated?page=999` is `noindex`; the sitemap lists the ten bare list paths after the landings, verifies **AC-15**, **AC-16**.
- Request scope: the landings and list pages read no cookie outside the card slots, verifies **AC-17**.

## Build plan

Tracer Bullet: the first slice runs one list (TV `top-rated`) through every layer (TMDB read, registry, proxy, list page, landing row with real cards), then the remaining lists and the polish thicken it.

1. Add `TvListKind`, `MovieListKind`, the region and timezone constants, `lib/tmdb/lists.ts` (`fetchTvList`, `fetchMovieList` with the adult filter), the cached `getTvList` / `getMovieList` wrappers and their exports, with fixture tests for every kind's endpoint and params and the adult drop, satisfies **AC-2**, **AC-8**, **AC-17**.
2. Add `lib/catalog/lists.ts` (all ten entries, paths, `isCatalogListSlug`) and `lib/catalog-list-read.ts` (`readCatalogList`), with unit tests, satisfies **AC-2**, **AC-3**.
3. Teach the proxy the slugs: check `isCatalogListSlug` before the numeric parser for the `/shows/{x}` and `/movies/{x}` patterns, with `proxy.test.ts` cases for every AC-13 path, satisfies **AC-13**.
4. Extract `ShowListCard` / `MovieListCard` from today's landing pages, add the `sizes` prop to `PosterCard`, and build `CatalogListPage`; add `app/shows/top-rated/page.tsx` with `generateMetadata` through `landingPageMetadata`. Verify `/shows/top-rated` pages, errors and 404s in the running app, satisfies **AC-4**, **AC-9**, **AC-10**, **AC-15**.
5. Build `CarouselRow`, `CarouselRowItems`, the skeleton and the native scroll region (no arrows yet); turn `/shows` into the landing with just the `Top rated` row, h1 `Shows`, static metadata, `connection()` before the read. Run `pnpm build` with no TMDB token. This closes the tracer bullet, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-7**, **AC-11**, **AC-12**.
6. Add the `308` page redirects to `next.config.ts` for both landings, satisfies **AC-14**.
7. Add the remaining four TV routes and rows, then the five movie routes and turn `/movies` into its landing; add the registry and routes consistency test, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**.
8. Add `CarouselScroller` (arrows, disabled state, reduced motion, hidden below `md`), with component tests, satisfies **AC-6**.
9. Update `sitemapEntries` and its test for the ten list paths, satisfies **AC-16**.
10. Extend the request scope tests to the landings and the list pages, and add the landing and list pages to the existing `/showcase` only if a carousel row state needs a reference there (error, empty, skeleton), satisfies **AC-17**, **AC-11**, **AC-12**.
11. Verify in the running app at 375px and 1280px, signed out and signed in: every row and list, arrows and keyboard scroll, a forced row failure, the redirect, the 404s, and the sitemap, satisfies **AC-1** to **AC-17**.

## Consequences

**Positive**:

- A visitor sees five kinds of list on arrival instead of one, and every card keeps full tracking controls.
- Each list has a stable, shareable, indexable URL, and old `?page=N` links keep working with a permanent redirect.
- The TMDB module keeps its rule that slugs are app vocabulary and kinds are TMDB vocabulary; one dispatcher joins them.
- Rows fail and load independently, so one slow or failing TMDB list never blanks the landing.

**Negative / tradeoffs**:

- A landing now makes five TMDB list reads (cached for hours, Popular for minutes) instead of one, plus up to five card status reads, one per row, where today there is one. For a signed in user that is up to five `cache()`d Supabase reads and TMDB detail reads for tracked shows that appear in several rows (those detail reads are cached and shared).
- The landing loses its fully prerendered grid for a shell plus five request time rows; that matches today's behavior (the grid already streamed per request) but the static shell is smaller than it could be.
- Region `PL` and timezone `Europe/Warsaw` are app wide constants, not per visitor. A visitor elsewhere sees Polish cinema dates and Polish "today".
- The `Upcoming` movie row shares a word with the `/upcoming` library page. They are different things (TMDB's release calendar vs your own planned movies); the row's note and h1 (`Upcoming movies`, `Coming soon to Polish cinemas`) carry the difference.
- Ten static route folders are more files than one dynamic route; the registry consistency test is what keeps them honest.
- A row's Try again reloads the whole landing; the other rows come from cache, so it is cheap, but it is not a per row retry.

**Neutral**:

- Amends spec 0006 AC-1 and AC-2 and spec 0009 AC-1 and AC-2 (the landings were one paged grid; the paged grid now lives at `/…/popular`), spec 0016 AC-6 and AC-17 (sitemap entries and landing canonicals), and spec 0004 AC-17 is unchanged (`/` still redirects to `/shows`).
- `/search` browse mode (spec 0010, AC-11) keeps its own discover popular grid; nothing there changes.
- The navbar's media type follows the path prefix, so every list page already gets the right SHOWS | MOVIES tab.
- No migration, no environment variable, no deploy runbook change.

## Follow-up

- [ ] Add amendment notes to specs 0006, 0009 and 0016 pointing at this spec when it is accepted (an /architect edit, after the build).
- [ ] `/sync` after the build: `AGENTS.md` "Commands and repo facts" should record the list registry as the one place slugs live, the proxy slug rule beside the malformed id rule, and the `?page` redirect beside the `/` redirect.
- [ ] If a visitor base outside Poland matters later, region and timezone could follow the visitor; that needs its own decision (a header or a setting), not a constant change.
