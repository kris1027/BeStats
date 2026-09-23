# 0006. Movie page and popular movies landing

**Date**: 2026-09-23 (updated 2026-09-23: AC-2 no longer promises pagination without JavaScript)
**Status**: Accepted

Scope feature: [7. Movie page](../../scope/scope.md) · Beta tier

## Summary

This decides how a visitor finds a movie and what they see when they open one. `/movies` becomes a grid of popular movies from TMDB with previous and next page links, and each card opens `/movies/[id]`, a public detail page with a faded backdrop hero, poster, title, tagline, year, runtime, genres, the TMDB community rating (clearly labeled as TMDB), the overview and a scrollable row of the top 12 cast. The page shell (the frame and skeleton) is prerendered and the movie itself streams in from the cached TMDB read, so navigation feels instant and no build ever calls TMDB. Nothing here reads a session or shows tracking controls: those arrive with feature 8, into a place this page leaves for them.

## Requirements

**User stories**:

- As a visitor, I want a page of popular movies I can page through, so that I have a way into the catalog before search exists.
- As a visitor, I want a movie page showing the poster, what it is about, who is in it and how TMDB users rate it, so that I can decide whether it interests me.
- As a visitor, I want missing artwork or details to look deliberately absent rather than broken or made up, so that I can trust what the page does show.
- As a visitor on a slow or failing connection to TMDB, I want a clear message and a retry that actually retries, so that I am never stuck on a dead page.
- As the engineer building feature 8, I want the page to already have a place for the tracking controls, so that adding them does not mean reworking the layout.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/movies` renders the heading "Popular movies", a short line saying the order comes from TMDB popularity, and a `PosterGrid` of the results of `discoverMovies({ page })`. Each result is a `PosterCard` with its `TmdbRatingBadge` in the badge slot and `href` of `/movies/{id}`. A card whose poster is missing uses the existing fallback tile. The first row's images load with `priority`.
- **AC-2**: `/movies?page=N` shows page N. Below the grid sit a Previous link (absent on page 1), the text "Page N of M" where M is `min(totalPages, 500)` (TMDB serves no page past 500), and a Next link (absent on page M). Both links are plain `<Link>`s to shareable URLs, and meet the 44px touch target on mobile. They are real anchors in the server HTML, so crawlers and a copied link reach page N, but clicking them needs JavaScript, like the rest of the streamed grid (see Consequences). Two branches render the same empty `StatePanel` "That page doesn't exist" with a link to `/movies`. Before the read: a `page` value that is not a whole number from 1 to 500 (for example `0`, `-2`, `abc`, `2.5`, `501`) makes no TMDB call. After the read: a valid page greater than `min(totalPages, 500)` shows the panel in place of the grid. A missing `page` means page 1.
- **AC-3**: A signed out visitor opening `/movies/{id}` for a real movie sees, in this order: the backdrop hero (the backdrop image faded into the page background at its bottom and left edges), with the poster and title block overlapping its lower edge; in the title block the title as the page's only `h1`, the tagline, a meta line of release year, runtime formatted as `2h 19m` (`45m` under an hour, `2h` on the hour) and the genres as non interactive `GlassPill` chips, then the TMDB rating block; below the hero an "Overview" section and a "Cast" section, each under an `h2`.
- **AC-4**: Every missing value is omitted or stated as absent, never invented or zeroed. No backdrop: the hero collapses to the poster and title block on the flat page background, with no substitute image. No poster: the `PosterCard` style fallback tile at the same 2:3 footprint. No release date or runtime: that part of the meta line and its separator are left out. No genres: no chips. No tagline: no tagline line. No overview in English or the original language: the Overview section reads "No overview available." Empty cast: the Cast section reads "TMDB lists no cast for this movie."
- **AC-5**: When TMDB has no English overview but has one in the movie's original language, the page shows that overview, marks its element with the matching `lang` attribute, and adds a muted note "Shown in the original language (French)", the language name coming from `Intl.DisplayNames` in English, or the raw ISO code when the runtime does not know it. An English overview is shown with no note.
- **AC-6**: The Cast section shows at most the first 12 cast members in TMDB billing order. Each is a card with the profile photo at 2:3 (or a fallback tile with a person icon at the same footprint), the actor's name, and the character name, left out when TMDB gives none. The row scrolls horizontally by touch, trackpad and keyboard: the scroll container is a labeled region (`aria-label="Cast"`) that can take focus, shows the focus ring, and scrolls with the arrow keys. Cast cards are not links, because no person page exists.
- **AC-7**: The rating block shows the amber `TmdbRatingBadge`, the visible label "TMDB", and the vote count formatted as `12,345 votes` (`1 vote` for one). A movie with no TMDB rating shows the muted text "No TMDB rating yet" instead of a badge. No personal rating, watchlist, watched or other tracking control renders anywhere on the page; the place for them is under the rating block, and in this feature it renders no DOM node at all. Feature 8 adds the element, with its own reserved height and skeleton.
- **AC-8**: A request for `/movies/{segment}` where the segment is not a canonical positive integer (digits only, no leading zero, at most 2147483647) is answered by `proxy.ts` with HTTP status 404 and the app's not found page, before any Supabase or TMDB call, whether or not auth is configured.
- **AC-9**: A well formed id that TMDB does not know, or one TMDB flags as adult, renders the movie not found panel ("We couldn't find that movie", with a link back to `/movies`) inside the page shell, and the response carries `<meta name="robots" content="noindex">`. Its status is 200, because the shell has already streamed (a soft 404); this is accepted.
- **AC-10**: When TMDB times out, rate limits, or fails upstream, the detail body and the landing grid each render the error `StatePanel` ("Couldn't reach TMDB" with "TMDB didn't respond. Try again in a moment.") and a "Try again" action that reloads the same URL as a full page load. The navbar and shell stay usable. These transient failures are cached with the `seconds` profile, so a retry once TMDB recovers succeeds within seconds; `not_found`, `unauthorized` and `bad_response` keep the `minutes` profile.
- **AC-11**: Both routes serve a prerendered shell: `pnpm build` reports `/movies` and `/movies/[id]` as partially prerendered, neither exports `instant = false`, and no TMDB request happens at build time. The streamed parts show skeletons at the footprint of what replaces them (grid cards for the landing; hero, meta lines and a cast row for the detail), so the page does not jump when content lands.
- **AC-12**: The detail page's `<title>` is `Fight Club (1999) · BeStats` style (`{title} ({year})`, or `{title}` with no year), through the root layout's title template. Its meta description is the shown overview cut to at most 160 characters at a word boundary with an ellipsis, or absent when there is no overview. An unknown or adult id gets the title "Movie not found"; a TMDB failure gets "Movie". The landing's title stays "Movies".
- **AC-13**: Neither route reads `cookies()`, `headers()`, a Supabase client, or any session value; the navbar account slot stays the only request scoped piece of the layout (spec 0005, AC-14 still passes). No `use cache` scope added by this feature receives a user specific value.
- **AC-14**: At mobile width (375px) both pages work with no horizontal page scroll: the hero stacks with a smaller poster beside the title block over a shorter backdrop, the cast row scrolls within itself, and every interactive element keeps the visible focus ring and its touch target. Decorative images (backdrop, and poster and cast photos that sit next to their own text) carry `alt=""`.

## Decision

**Chosen option**: Option 1: Streamed detail route with a prerendered shell, a hybrid not found, and a paginated popular grid.

The movie detail route and the landing grid both render a static shell and stream their TMDB data inside Suspense from the existing cached reads, with malformed ids refused as a real 404 in the proxy and unknown ids handled as a soft 404 in the page.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for verifying both routes in the running app · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) for diagnosing the shell if `pnpm build` does not report it as prerendered.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (no reference in `design/`)

`design/` has no movie detail or landing artboard, so this layout is proposed here and approved with the spec, as `AGENTS.md` section 3 requires. It is built only from what the references and spec 0004 already define: the black background, the glass pill, the poster card with its rim, the TMDB badge, `StatePanel` and the skeletons. It adds no new colour or token.

- **Landing** (`/movies`): the page heading and the popularity note at the top left, the existing `PosterGrid` (2 / 3 / 4 / 5 / 6 columns), then the pagination row centred under the grid. Same page padding as the list references.
- **Detail hero, desktop**: the backdrop full width at 16:9, capped at roughly 70vh, with a gradient from transparent to `background` over its bottom third and its left side (written with the `from-background` utility, never a literal). The poster (about 240px wide, the poster card's rounded frame and rim, no caption) and the title block sit side by side, overlapping the bottom of the backdrop. The title block holds, top to bottom: `h1` title, tagline in muted italic, the meta line (year · runtime) followed by the genre chips, the rating block, then the empty tracking slot.
- **Detail hero, mobile**: the backdrop at 16:9 on top, then the poster at about 112px beside the title block, overlapping the backdrop's lower edge by a small amount; the meta line and chips wrap below.
- **Below the hero**: "Overview" (text capped at a comfortable reading width, about 65 characters) then "Cast" (the horizontal row, cards about 120px wide on mobile and 140px on desktop).
- **Skeletons** reuse the existing skeleton pieces at the same footprints.
- `/develop` settles exact pixel values by eye against the existing references and records nothing new in `globals.css` unless a token is truly missing, which would come back here first.

**Data model sketch**:

No database change. This feature reads only TMDB, through the existing module. The module's `Movie` type changes in three places (`schemas.ts`, `types.ts`, `normalize.ts`, the rule in `lib/tmdb/AGENTS.md`):

| Field | Type | Change |
|---|---|---|
| `adult` | `boolean` | New. From TMDB's `adult`; a missing value normalizes to `false`. |
| `overview` | `string \| null` | Now the resolved overview: English when present, else the original language translation, else null. |
| `overviewLanguage` | `string \| null` | New. ISO 639-1 code of the shown overview (`"en"` for English), null when `overview` is null. |

`fetchMovie` requests `append_to_response: "credits,translations"`, still one round trip. The translations entries are parsed item by item with `safeParse` and a malformed one is dropped, like cast members. Resolution: when the English overview is empty, take the first translation whose `iso_639_1` equals `original_language` and whose `data.overview` is non empty after trimming. `MovieSummary` (grid cards) is unchanged: cards show no overview.

**State transitions**: none.

**API surface** (routes and one module change; no mutations, no Server Actions):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/movies` | GET (page) | `page`: search param, optional, whole number 1 to 500 | heading, grid of up to 20 cards, pagination row | public | malformed or out of range page: empty panel; TMDB failure: error panel with retry |
| `/movies/[id]` | GET (page) | `id`: path segment, canonical positive integer | hero, overview, cast, metadata | public | malformed id: 404 from proxy; unknown or adult: soft 404 panel; TMDB failure: error panel with retry |
| `proxy.ts` | every request | pathname | 404 rewrite for a malformed movie id, else unchanged | none | none |
| `getMovie(id)` (module) | function | `id: number` | `Movie` with `adult`, resolved `overview`, `overviewLanguage` | server only | `TmdbError` by kind |
| `discoverMovies({ page })` (module) | function | `page: number` | `Paged<MovieSummary>` | server only | `TmdbError` by kind |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Landing | page number | `page` search param, validated with Zod (`z.coerce.number().int().min(1).max(500)`), default 1 |
| Landing | results, `totalPages` | `discoverMovies({ page })`, TMDB's default `popularity.desc` order |
| Landing | M in "Page N of M" | `min(totalPages, 500)` |
| Landing | "past the last page" | `page > min(totalPages, 500)` after the read |
| Landing | card rating | `MovieSummary.tmdbRating` |
| Detail | movie id | path segment, parsed by the shared `parseMovieId` (below) |
| Detail | title, tagline, poster, backdrop, genres, cast | `getMovie(id)` fields |
| Detail | release year | `Movie.releaseYear` |
| Detail | runtime text | derived from `Movie.runtimeMinutes` by `formatRuntime` |
| Detail | vote count text | `Movie.tmdbVoteCount` through `Intl.NumberFormat("en-US")`, singular at 1 |
| Detail | overview text and its language | `Movie.overview`, `Movie.overviewLanguage` (resolution above) |
| Detail | language name in the note | `new Intl.DisplayNames(["en"], { type: "language" }).of(overviewLanguage)`, falling back to the code |
| Detail | cast shown | `Movie.cast`, already sorted by `order`, sliced to 12 |
| Detail | found, not found or failed | `loadMovie(id)` (below): `not_found` when `isTmdbNotFound(error)` or `movie.adult === true`, `failed` for any other `TmdbError` |
| Detail | `<title>` and description | `generateMetadata`, branching on the same `loadMovie(id)`, description from `truncateAtWord(overview, 160)` |
| Proxy | "malformed" | `parseMovieId(segment) === null` for a pathname matching `/movies/{one segment}` |
| Retry link | target URL | the current pathname plus search, built on the server from `params` and `searchParams` |

**Shared helpers** (new, pure, unit tested; no `server-only` so the proxy can import the id parser):

- `lib/catalog/ids.ts`: `parseMovieId(segment: string): number | null`. The segment must match `^[1-9]\d{0,9}$` **and** its numeric value must be `<= 2147483647`; the regex alone would let `9999999999` through. Tests cover `2147483647` (accepted) and `2147483648` (refused).
- `lib/format.ts`: `formatRuntime(minutes)`, `formatVoteCount(count)`, `languageName(code)`, `truncateAtWord(text, max)`. `truncateAtWord` returns the text unchanged when it fits in `max`; otherwise it cuts at the last whitespace within the first `max - 1` characters, trims trailing whitespace and punctuation, and appends `…`, so the result including the ellipsis is at most `max`. With no whitespace in that range it cuts hard at `max - 1`.

**Shared server helper** (`app/movies/[id]/load-movie.ts`, server only): `loadMovie(id: number): Promise<{ kind: "found"; movie: Movie } | { kind: "not_found" } | { kind: "failed" }>`. It calls `getMovie`, maps `isTmdbNotFound` and `movie.adult === true` to `not_found`, and any other `TmdbError` to `failed`; a non TMDB error is rethrown. The page body (`notFound()` on `not_found`, the error panel on `failed`) and `generateMetadata` both branch on it, so the two can never disagree.

**Components** (new unless noted):

- `app/movies/page.tsx` (rewritten): static heading, `Suspense` around `PopularMovies`, which awaits `searchParams`.
- `app/movies/[id]/page.tsx`: `Suspense` around `MovieDetail`, which awaits `params`; `generateMetadata`.
- `app/movies/[id]/not-found.tsx`: the movie not found panel.
- `app/not-found.tsx`: a root not found page using `StatePanel` ("Page not found", link to `/movies`), which the proxy's 404 renders.
- `components/movie/movie-hero.tsx`, `components/movie/cast-row.tsx`, `components/movie/movie-detail-skeleton.tsx`, `components/pagination-links.tsx`. All Server Components; no new client boundary.
- A small shared `RetryLink` (an `<a>` styled with `buttonVariants`, so it is a full page load that skips the client router cache).

**Proxy change**: at the top of `proxy()`, before the auth configuration check, match `^/movies/([^/]+)$` on the pathname; when `parseMovieId` returns null, return `NextResponse.rewrite` to a path that matches no route, which renders `app/not-found.tsx` with status 404. `/develop` confirms against the installed `node_modules/next/dist/docs/` that the rewrite yields a 404 status; if it does not, pass `{ status: 404 }` in the response init. A deeper path such as `/movies/550/extra` matches no route and is already a 404.

**Failure profile split** (in `lib/tmdb/reads.ts`): replace the single `FAILURE_PROFILE` with `failureProfile(kind)`, returning `"seconds"` for `timeout`, `rate_limited` and `upstream`, and `"minutes"` for `not_found`, `unauthorized` and `bad_response`. Every cached read uses it, not only the two this feature calls, so the rule stays one rule. A `seconds` scope is excluded from the prerendered shell and becomes a dynamic hole, which is fine: a failure only exists at request time.

**Key invariants**:

- A TMDB community rating is never shown without its amber badge or the "TMDB" label; no personal score appears in this feature.
- No value is invented: missing stays missing, per AC-4 and `lib/tmdb/AGENTS.md`.
- The proxy never calls TMDB or Supabase to decide a movie 404.
- An adult flagged movie never renders its details.
- No TMDB call happens at build time, and no cached scope sees a cookie, header or session.

**Security model**: Public, read only pages with no user data. The TMDB token stays inside `lib/tmdb/env.ts` (`security-boundary.test.ts` still guards it); the pages import only from `lib/tmdb/index.ts`, which is `server-only`. Inputs are the `id` segment and the `page` param, both validated before any request. Adult content is excluded on every path (`include_adult=false` on discover, the `adult` check on detail). No rate limiting is added here: the pages are served from the cache, and TMDB's own limits are handled by the module's retry budget.

**Configuration required**: none. `TMDB_READ_ACCESS_TOKEN` already exists.

**Critical test scenarios**:

- Happy path: open `/movies`, click a card, the detail page shows hero, meta, rating block, overview and cast for that id. Verifies **AC-1**, **AC-3**, **AC-6**, **AC-7**.
- Missing data: a fixture movie with no backdrop, poster, tagline, runtime, genres, rating or cast renders every fallback in AC-4 and no placeholder text or zero. Verifies **AC-4**, **AC-7**.
- Language fallback: a fixture with an empty English overview and a French translation resolves to the French text with `overviewLanguage: "fr"`; an English one keeps `"en"`; a translations entry that fails parsing is dropped without failing the read. Verifies **AC-5**.
- Not found: `curl -I /movies/abc` and `/movies/0123` return 404; `/movies/999999999` (unknown) and a known adult id render the not found panel with `noindex`. Verifies **AC-8**, **AC-9**.
- Failure case: with TMDB unreachable, both routes show the error panel with a working "Try again"; once TMDB is back, one retry succeeds. A unit test asserts `failureProfile` per kind. Verifies **AC-10**.
- Pagination: `?page=2` shows page 2 with both links; `?page=501`, `?page=0` and `?page=abc` show the empty panel and make no TMDB call. Verifies **AC-2**.
- Build: `pnpm build` lists both routes as partially prerendered and the build log shows no TMDB request. Verifies **AC-11**.
- Auth/permission: none to deny (public); the layout purity test from spec 0005 still passes, and a grep test fails if `cookies(`, `headers(` or a Supabase client appears under `app/movies/`. Verifies **AC-13**.

## Build plan

Ordered as Tracer Bullet slices: the first two tasks prove the whole thread (TMDB, cached read, streamed route, link from the landing) with the thinnest real page, and each later task thickens one strand end to end.

1. **Thin thread, detail.** Create `app/movies/[id]/page.tsx` with `Suspense` around a body that parses the id, calls `getMovie`, and renders just the `h1` title, the poster and the overview; a plain skeleton as fallback. Confirm in the running app (`next-dev-loop`) and confirm `pnpm build` reports the route as partially prerendered with no TMDB call at build. Once `generateMetadata` exists (task 4), spot check with a cold cache that the page body and the metadata together send one TMDB request, not two; if they send two, record it and move on, since both hit the same cache key. Satisfies **AC-3**, **AC-11**.
2. **Thin thread, landing.** Rewrite `app/movies/page.tsx` to show page 1 of `discoverMovies` in `PosterGrid` with `PosterCard` and `TmdbRatingBadge` linking to the detail route; grid skeleton as fallback. Click through from `/movies` to a movie in the running app. Satisfies **AC-1**, **AC-11**.
3. **Module strand.** In `lib/tmdb`: add `adult` and `translations` to the movie schema, `adult` and `overviewLanguage` to `Movie`, the overview resolution in `normalizeMovie`, `append_to_response: "credits,translations"`, and `failureProfile(kind)` in `reads.ts`. Extend `movie-550.json` with its real translations block and add one fixture with an empty English overview; unit tests for resolution, dropped malformed translations, `adult`, and the profile per kind. Satisfies **AC-5**, **AC-9**, **AC-10**.
4. **Detail thickened.** `lib/format.ts` with its tests; `MovieHero` (backdrop fade, poster, title block, meta line, genre chips, rating block, empty tracking slot), the overview section with the language note, `CastRow`, `MovieDetailSkeleton`; every AC-4 fallback; the mobile layout; `generateMetadata`. Verify desktop and 375px in the running app. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-12**, **AC-14**.
5. **Not found and failure strand.** `lib/catalog/ids.ts` with tests; `loadMovie` with tests for its three outcomes, used by the body and `generateMetadata`; the proxy 404 rewrite and `app/not-found.tsx`; `app/movies/[id]/not-found.tsx` with the adult and unknown branches; `RetryLink` and the error panels on both routes. Check the 404 status with `curl -I`, the soft 404 `noindex`, and a retry with TMDB blocked then restored. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-12**.
6. **Pagination strand.** Zod parsing of `page`, `PaginationLinks`, the "Page N of M" cap at 500, and the "That page doesn't exist" panel with no TMDB call for invalid values. Satisfies **AC-2**, **AC-14**.
7. **Proof.** Component tests for the hero fallbacks, cast row keyboard focus and region label, rating block wording and pagination edges; the grep test for request scoped APIs under `app/movies/`; the spec 0005 purity test still green; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; the existing `security-boundary.test.ts` still passes. Satisfies **AC-11**, **AC-13**, **AC-14**.

## Consequences

**Positive**:

- The first visible catalog surface ships using only pieces spec 0004 already built, which proves that foundation on a real page.
- Navigation to a movie commits instantly to the shell, and repeat visits come from a `days` cache.
- A retry after a TMDB outage now actually retries, for every read in the module, not just this page.
- Feature 8 drops its controls into a slot that already exists, and feature 10 can copy the hero, cast row and not found pattern for TV.

**Negative / tradeoffs**:

- An unknown or adult id answers 200 with `noindex`, not 404. Search engines drop it, but a link checker will not flag it as broken.
- Transient failures cached for `seconds` mean that during a sustained TMDB outage or rate limit, each visitor's request can reach TMDB again after about a second, rather than being absorbed for a minute. The module's retry budget still bounds each request.
- The proxy now carries one route specific rule, which is a second place (besides the page) that knows the movie URL shape. `parseMovieId` is shared so the two cannot disagree.
- The translations append makes the movie payload larger (every language's overview comes back), cached once per movie for days.
- `/movies` is popularity only; there is no genre or year browsing until feature 11.
- Without JavaScript, `/movies` and `/movies/[id]` show only their skeletons. The streamed part of a partially prerendered page arrives in a hidden container that React's inline script reveals, so the grid, the page links and the movie body stay hidden when scripts are off. This is the cost of the instant shell (AC-11), accepted on 2026-09-23 after `/check verify` found the original "work without JavaScript" promise in AC-2 could not hold. The links are still plain anchors in the HTML, so crawlers and shared URLs are unaffected.

**Neutral**:

- `lib/tmdb/AGENTS.md` says "`minutes` ... for any cached failure"; that line becomes stale with the split and needs updating by `/sync`.
- A root `app/not-found.tsx` now exists, so every unmatched URL in the app shows the styled panel instead of Next's default page.
- `/shows` still shows its placeholder; its landing belongs to feature 10.

## Follow-up

- [ ] `/sync` after the build: update the failure lifetime line in `lib/tmdb/AGENTS.md`, and note `lib/catalog/ids.ts` and `lib/format.ts` in the right context file.
- [ ] Feature 10 (TV show page) should reuse `MovieHero`'s structure, `CastRow`, the proxy id rule (generalized to `/shows/[id]`) and the soft 404 pattern rather than a second design.
- [ ] Feature 17 (SEO) builds on the `generateMetadata` added here for social cards, canonical URLs and the sitemap; it should decide whether the soft 404 for unknown ids is acceptable for the sitemap.
- [ ] Feature 18 (TMDB attribution) owns the site wide attribution; this page only labels the rating.
