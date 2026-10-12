# 0021. Home carousels: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

`/shows` and `/movies` are each one paged grid of 20 titles from TMDB's discover endpoint, sorted by popularity (spec 0006, AC-1 and AC-2; spec 0009, AC-1 and AC-2). A visitor who wants something new this week, something airing tonight, or something well rated has to leave for `/search` or page through popularity. A grilling session on 2026-10-12 settled the shape: five sideways rows per landing, each with a See all page at `/shows/{slug}` or `/movies/{slug}`, the full card on every row, rows that load and fail on their own, old `?page=N` links redirected, and the list pages in the sitemap.

Several forces shape how to build it. TMDB exposes most of these lists as fixed endpoints (`/trending`, `/tv/airing_today`, `/movie/now_playing` and so on) that take a `page` and, for some, a `region` or `timezone`, but no `include_adult`, unlike discover. The TMDB module (spec 0002) keeps every read as an inner uncached function plus a `use cache` wrapper that returns failures as plain objects, and it never learns app vocabulary such as URL slugs. `app/shows/[id]` and `app/movies/[id]` already own the second path segment, and the proxy answers a non numeric segment there with a real 404 before the page streams. Cache Components is on: a route with no request data is prerendered at build, and CI builds with no TMDB token, where a missing token is a plain `Error` that would fail any prerender that reads TMDB.

The cards carry per user state. Since prompts/catalog-card-status.md, each grid makes one request scoped read of the user's state for all its ids, keyed by the grid's id list, so a card shows a title as its library page does. Five rows mean five such grids per landing.

Not deciding leaves the landings as a single popularity list, and leaves the slug, proxy and sitemap rules to be invented route by route.

## Options considered

### Option 1: one dynamic segment that branches on slug or id

Keep `app/shows/[id]` and `app/movies/[id]` as the only second level routes and have each detail page first check whether the segment is a known list slug, rendering the list page if so.

**Pros**:
- No new route folders; one file per media type.
- The proxy rule stays a single pattern per media type.

**Cons**:
- The detail page, its `generateMetadata`, its not found handling and its JSON-LD all gain a second mode; two unrelated pages share one file.
- The segment parser stops being "a TMDB id", which the proxy and `parseTmdbId` rely on.
- Static params and prefetch behavior differ for the two modes in one route.

### Option 2: a list registry, two new TMDB reads, and one static route per slug (chosen)

A pure registry of the ten lists; `getTvList` / `getMovieList` in the TMDB module keyed by TMDB's own list names; Popular stays on discover; ten tiny static routes rendering one shared list page; the landings render one carousel row per registry entry.

**Pros**:
- Static segments beat `[id]` in Next's router, so detail pages are untouched.
- One registry feeds routes, proxy, sitemap and landings, so a slug cannot drift between them.
- The TMDB module keeps TMDB vocabulary; the slug to read mapping is one small server function.
- Popular stays the exact discover call the sitemap makes, so old `?page=N` links show the same titles and cache entries stay shared.

**Cons**:
- Ten route files and a consistency test to keep them matched to the registry.
- Two read shapes (discover for Popular, list endpoints for the rest) behind one dispatcher.

### Option 3: one `[list]` route under a prefix such as `/shows/lists/{slug}`

A single dynamic route under a new prefix, with the slug validated in the page.

**Pros**:
- One route file per media type, no clash with `[id]`.

**Cons**:
- The URLs the grilling session settled (`/shows/{slug}`) change.
- A dynamic route streams before it can decide the slug is unknown, so an unknown slug is a soft 404 unless the proxy learns it too, which brings back the registry anyway.

### Option 4: all lists through discover

Approximate every row with discover parameters (date ranges for airing and now playing, `sort_by=vote_average.desc` for top rated, popularity for trending).

**Pros**:
- One read function, `include_adult=false` everywhere, no new endpoint code.

**Cons**:
- Trending has no discover equivalent; it would silently become popularity.
- Airing today and now playing need date windows the app would compute, duplicating TMDB's own definitions and drifting from them.
- Top rated by discover needs a vote count floor the app invents; TMDB's list already applies one.

## Rationale

Option 2 keeps every existing contract intact: the detail routes, `parseTmdbId`, the proxy's real 404 rule, the TMDB module's split and vocabulary, and the sitemap's shared discover reads. The cost is ten very small route files, and a registry test makes that cost safe. Option 1 would muddle the most important pages in the app to save those files, and Option 3 gives up the URLs already agreed. Option 4 fakes lists TMDB already defines, and trending cannot be faked at all.

Popular stays on discover because the old `?page=N` links redirect to `/…/popular?page=N`: keeping the same read means the redirected page shows the same titles the bookmark showed, and the sitemap's ten discover pages per type stay one cache entry each instead of becoming a second parallel set. `/movie/popular` and `/tv/popular` order nearly identically, so nothing visible is lost.

Region `PL` goes only on now playing and upcoming because those two lists are defined by local release dates; popular, top rated and trending are global by nature, and a region on them would make Popular stop matching discover. `Europe/Warsaw` on airing today and on the air matches that choice, so "today" on the TV rows is the same day the movie rows assume. Both are constants in the TMDB module, where every other request constant lives.

The list endpoints take no `include_adult`, so the inner reads drop results flagged adult. Discover already promises no adult titles on public grids; the new lists should not quietly break that promise, and the detail page's adult check would otherwise show a card that leads to a 404.

Rows read at request time (`connection()` before the read) because the alternative, prerendering rows at build, makes every build depend on a TMDB token. CI builds without one today, and a missing token is a plain `Error` that would fail the prerender. Request time rows also match what the grid does today (it streamed per request because of `searchParams`), and the h1 and every row header still land in the prerendered shell. The new reads use `hours` because these lists change about once a day and a landing now makes five reads; Popular keeps discover's `minutes`, shared with `/search` browse mode and the sitemap.

Twelve cards per row keeps the row short enough that See all does the deep browsing, while still being the first 12 of TMDB page 1, so the row and page 1 of its list share one cache entry. Fixed 140px and 180px cards echo the cast row's 120px and 140px, show about two and a half cards on a phone (the cut card tells you the row scrolls), and give `next/image` one simple `sizes` string. Native scroll with snap is the base layer, so touch, trackpad and keyboard work with no JavaScript; the arrow buttons from `md` up are a small Client Component on top, because a mouse user otherwise has no comfortable way to scroll sideways. An empty row keeps its header and says so, so the landing keeps a stable layout and never implies a failure that did not happen.

Per row card status reads (one `cache()`d read per row's id list) were kept over one merged read for the whole landing: the rows stream independently, a merged key would need every row's ids before any card could resolve, and the existing slot components already take a grid id list. A title in two rows costs a second small Supabase read, not a second TMDB detail read, since TMDB details are cached.
