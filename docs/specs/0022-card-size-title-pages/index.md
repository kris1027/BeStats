# 0022. Consistent card size and richer title pages

**Date**: 2026-10-12
**Status**: Accepted
**Amended**: 2026-10-12. After the branch review, the spec records what shipped: Cast is a carousel row of home row cards (AC-17), a network shows its name with its logo beside it (AC-16), the error line names no cause (AC-18), `/privacy` also explains the trailer player (AC-19), and the extras reads throw like every other read (interface table). The owner kept each as built; see [rationale.md](rationale.md#amendment-2026-10-12-recording-what-shipped).
**Amended**: 2026-10-13. Full grid rows: every paged grid shows 24 titles, and the `catalog` grid steps 2, 3, 4 and 6 columns (no 5), so a full page fills every row at every width (AC-1, AC-2, AC-4, AC-6, new AC-21 and AC-22). This reverses the ragged last row accepted below; see [rationale.md](rationale.md#amendment-2026-10-13-full-grid-rows) and [prompts/full-grid-rows.md](../../../prompts/full-grid-rows.md).

## Summary

This spec covers two related changes. First, poster cards on every grid page (See all lists, `/search`, Watchlist, Upcoming and Watched) shrink to about the home row card's 180px by stepping the grid from 2 up to 6 columns; the season grid keeps its 2 and 4 columns. Second, movie and show pages gain a trailer, where to watch, more like this, key crew, an age rating and a facts panel. The new title data comes from one extra TMDB request per title, cached for an hour and shared by every visitor, so the library pages, which read up to 500 shows, stay as cheap as today. YouTube is added to the privacy policy, and the visitor's country (from Vercel's `x-vercel-ip-country` request header, never stored) picks the streaming and age rating region.

## Requirements

**User stories**:
- As a visitor, I want a poster to be the same size in a home row and on its See all page, so the catalog feels like one product.
- As a signed in user, I want my library cards at that same size with their controls still easy to use.
- As a visitor on a title page, I want to watch the trailer, see where I can stream, rent or buy it in my country, find similar titles, and read who made it and its basic facts, without leaving BeStats to look them up.

**Acceptance criteria**:

*Card size strand*

- **AC-1**: The default (`catalog`) `PosterGrid` has 2 columns below `sm` (640px), 3 from `sm`, 4 from `md` (768px) and 6 from `xl` (1280px); `lg` (1024px) keeps 4 (amended 2026-10-13, was 5). The 1200px cap, centring and gaps (`gap-x-4 gap-y-6`) are unchanged.
- **AC-2**: The `catalog` grid applies to the See all list pages (`/shows/{slug}`, `/movies/{slug}`), `/search`, Watchlist, Upcoming and Watched (both types), every one of their skeletons, and `/showcase`. At 1280px and wider a card is between 180px and 190px wide. From 1024px to 1279px cards are deliberately larger (4 columns, about 236px to 288px; amended 2026-10-13).
- **AC-3**: The season grid on `/shows/{id}` and its skeleton use the `wide` preset, which is exactly today's layout: 2 columns below `md`, 4 from it, with today's `sizes`.
- **AC-4**: Each preset's `sizes` string has one `floor(100 / columns)vw` entry per fluid column step, and one fixed px entry, `ceil((1200 - (columns - 1) × 16) / columns)`, for every column count the grid shows while capped at 1200px. For `catalog` that is `(min-width: 1280px) 187px, (min-width: 1232px) 288px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw` (amended 2026-10-13). For `wide` it is today's `(min-width: 1232px) 288px, (min-width: 768px) 25vw, 50vw`. `poster-grid.test.tsx` checks every key of `POSTER_GRID_SIZES` with this rule, so a preset with no sizes fails the type check, and a column change that misses its sizes fails the suite.
- **AC-5**: Eager posters are one full row at the preset's widest count: 6 for `catalog` and 4 for `wide`, read from one exported `POSTER_GRID_EAGER` map. The four local `EAGER_POSTERS` copies are removed.
- **AC-6**: `LibrarySkeleton` shows one row at the current column count at every width (6 cards, visibility `["", "", "hidden sm:block", "hidden md:block", "hidden xl:block", "hidden xl:block"]`, amended 2026-10-13), so a one row library does not shift when it arrives. The list page and search skeletons show 24 cards (amended 2026-10-13, was 20).
- **AC-7**: At 375px, 640px, 768px, 1024px and 1280px no grid page scrolls sideways, the missing poster tile keeps a real poster's footprint, and every card control keeps its 44px tap target. `/showcase` shows 6 grid cards.
- **AC-21** (added 2026-10-13): Every paged `catalog` grid shows 24 titles a page: the See all list pages, `/search` in browse, search and discover modes, and every library tab (`LIBRARY_PAGE_SIZE = 24`). A TMDB backed page *p* shows TMDB results `(p - 1) × 24 + 1` to `p × 24`, read from the two TMDB pages that hold them in parallel through the existing cached reads (a page past TMDB's page 500 is never requested). Its last page is `ceil(min(total_results, min(total_pages, 500) × 20) / 24)`, so a 10,000 result list ends at page 417 with 16 titles. If either TMDB read fails, the page shows its existing error panel with Retry. A title TMDB returns on both pages appears once, and the gap is filled from results already read past the window, so the filler also opens the next page (the repeat TMDB itself served). `generateMetadata` reads the same 24 title page, so canonicals and `noindex` follow the new page count. Old `?page=N` links are not redirected.
- **AC-22** (added 2026-10-13): A full page fills every row at 2, 3, 4 and 6 columns. A short last row is accepted only on the last page of a list, a filtered search page (query plus genre or rating, which stays cursor based with spec 0010's 20 match scan target), a library page after a card is removed in place, a page where TMDB repeated a title and nothing was read past the window to fill the gap, and the season grid.

*Title page strand: data*

- **AC-8**: Each title page makes at most one new TMDB request per title per cache lifetime: `/movie/{id}` or `/tv/{id}` with `append_to_response=videos,recommendations,watch/providers,release_dates` (movie) or `…,content_ratings` (show) and `include_video_language=en,null`, cached with `cacheLife("hours")`. `getTvShow`, `getMovie` and every library read make no extra request and keep their lifetimes.
- **AC-9**: The region is the `x-vercel-ip-country` request header when it is two capital letters that `Intl.DisplayNames` can name and is not `XX` or `T1`, otherwise `US`. It is read outside every cached scope, inside the Suspense boundary of the section that needs it, once per request (`getVisitorRegion` is wrapped in React `cache()`), and is never stored, logged or sent to TMDB. The extras read returns every country; the page picks the region's entry after the cached read returns. Every region dependent section names the country in English (`Intl.DisplayNames`), for example "Where to watch in Poland".
- **AC-10**: Every route keeps its prerendered shell (`pnpm build` route table unchanged for `/movies/[id]` and `/shows/[id]`), and nothing new reads cookies or headers outside a Suspense boundary. No SEO surface (metadata, JSON-LD, share image) receives the region, the age rating or any extras data, and `proxy.ts`, the sitemap and `generateMetadata` are unchanged.

*Title page strand: sections*

- **AC-11** (Trailer): When the extras include a YouTube video of type `Trailer` (else `Teaser`), preferring `official` and then the newest `published_at` (compared with `Date.parse`), the hero's new `actions` slot shows a Trailer button. It is the base-ui `Dialog.Trigger`, so focus returns to it on close. The dialog (full screen below `md`) renders, only while open, an iframe from `https://www.youtube-nocookie.com/embed/{key}?autoplay=1&rel=0&playsinline=1` with a descriptive `title`, `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"` and `referrerPolicy="strict-origin-when-cross-origin"`. Closing the dialog unmounts the iframe. A key that is not 6 to 20 characters of `[A-Za-z0-9_-]` is treated as no trailer. No trailer means no button.
- **AC-12** (Where to watch): A section titled "Where to watch in {country}" lists providers from the region's entry in three groups, in this order and each only when non empty: Stream (`flatrate`), Free (`free` then `ads`, merged by `provider_id`), and Rent or buy (`rent` then `buy`, merged by `provider_id`). A provider may appear in more than one group. Each group is ordered by `display_priority`, then by name, and each provider shows its `w92` logo (name text when the logo is missing). The section links once to the `link` TMDB returns for the region and carries the JustWatch credit line, `JUSTWATCH_ATTRIBUTION` ("Availability data from JustWatch"), a new constant in `lib/legal/operator.ts` beside `TMDB_ATTRIBUTION` that the legal boundary test keeps in one place. With no entry or no providers for the region it shows "Not streaming in {country} right now." and the JustWatch line.
- **AC-13** (Age rating): The hero meta shows a chip with the region's rating: for a movie, the non empty certification of release type 3 (Theatrical) for the region, else the first non empty certification for the region in TMDB's array order (trimmed, an empty string counts as empty); for a show, the region's `content_ratings` rating. No rating for the region means no chip, never another country's.
- **AC-14** (More like this): A row titled "More like this" shows up to 12 of page 1 of TMDB recommendations in the home row card (same width, badges and your tracked, planned or watched status, through `CatalogListCards`), with the arrow scroller and no See all link. Recommendations are validated with the existing list item schemas that carry `adult` (`movieListItemSchema`, `tvListItemSchema`) and adult titles are dropped, as on the spec 0021 lists. No recommendations means no row.
- **AC-15** (Key crew): Under the overview, a movie shows "Directed by" (crew job `Director`) and "Written by" (jobs `Screenplay` and `Writer`, not `Story`; names deduplicated in credit order, then capped at 3), and a show shows "Created by" (`created_by`, at most 3). Each line appears only when it has a name.
- **AC-16** (Facts): A Facts panel at the end of the page shows, each only when TMDB has a value: for a movie, status, original title (only when it differs from the title), original language, budget and revenue (only when above 0, `formatUsdCompact`, US dollars in compact form with at most one decimal, such as "$165M" or "$1.5B"), and production companies; for a show, status, type, original language, networks (the name, with the `w154` logo beside it on a neutral tile when TMDB has one, since network logos come in both white and dark), production companies, and the first and last air dates (`formatAirDate`, the full date `formatReleaseDate` shows). Status and type show TMDB's English strings as is ("Released", "Returning Series", "Miniseries"), languages go through `languageName`. Nothing is shown as "Unknown" or 0. Facts and the hero read only `getMovie` and `getTvShow`, never the copy of the details inside the extras response.
- **AC-17** (Page order): The movie page reads hero (with Trailer and age chip), overview, crew, where to watch, cast, more like this, facts. The show page reads hero, overview, crew, your rating and seasons, where to watch, cast, more like this, facts. Cast is drawn like More like this: a row of home row cards (`ROW_ITEM_CLASS`, `ROW_POSTER_SIZES`) in the arrow scroller with no See all link, the name as an `h3` and the character on one line, and a 12 card skeleton.
- **AC-18** (States): While the extras load, Where to watch and More like this show skeletons at their usual height, and the Trailer button and age chip render nothing (the hero grows slightly when they arrive, and an empty section collapses on arrival; both accepted, as with the tracking slot). If the extras read fails, including a 404 for a title the detail read found, the Trailer button and age chip are absent, and Where to watch and More like this each show a one line error, "Couldn't load {what} from TMDB.", with a Retry link to the page (`RetryLink`). The line names no cause, because a 404 and a bad response land there too. The rest of the page, including tracking, is unaffected. Crew and Facts come from the existing detail reads and share their states.
- **AC-19** (Legal): `PROCESSORS` gains YouTube (trailer playback, only after you press Trailer), `/privacy` adds one sentence saying the approximate country Vercel derives from your connection picks the streaming and age rating region and is not stored, a short paragraph under Cookies saying the trailer player loads only after you press Trailer and that YouTube's own policy then applies to it, and `LEGAL_LAST_UPDATED` is bumped to the ship date.
- **AC-20** (Mobile and keyboard): At 375px every new section fits without sideways page scroll (the recommendations row scrolls inside itself), the trailer dialog fills the screen, every new control is reachable by keyboard with visible focus, and tap targets stay 44px.

## Decision

**Chosen options**: a `columns` preset on `PosterGrid` (`catalog` default, `wide` for seasons) that owns its classes, `sizes` and eager count; and one separate cached "extras" read per title for the new TMDB data, with the region picked per request outside the cache.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking each section in the running app. `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) if a title page's shell regresses.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no database change. New TMDB types in `lib/tmdb/types.ts`:

- `MovieExtras` and `TvExtras`, two types with the same fields: `{ trailer: Trailer | null; recommendations: TaggedCatalogPage; watchProviders: Record<string, RegionProviders>; ageRatings: Record<string, string> }`, where `recommendations` is already the `{ mediaType, paged }` shape `CatalogListCards` takes (`mediaType` fixed per type, `paged` built from page 1). Region maps are keyed by ISO 3166 1 code; `ageRatings` already holds the picked certification per country (the AC-13 rule runs in the normalizer for every country), and the page reads `[region]` after the cache returns.
- Appended TMDB shapes the extras schema reads (a separate non strict schema that picks only these keys; every list is `.nullish()` and defaults to empty): `videos.results[]` `{ site, type, key, name, official?, published_at? }`; `recommendations` page 1, results through the list item schemas; `watch/providers.results` `{ [CC]: { link?, flatrate?, free?, ads?, rent?, buy? } }`, each provider `{ provider_id, provider_name, logo_path?, display_priority? }`; `release_dates.results[]` `{ iso_3166_1, release_dates: [{ certification, type }] }` (type 3 is Theatrical); `content_ratings.results[]` `{ iso_3166_1, rating }`. The request keeps `buildUrl`'s `language=en-US`; `include_video_language=en,null` is what stops that language filter from dropping videos with no language.
- `Trailer` = `{ key: string; name: string }`.
- `RegionProviders` = `{ link: string | null; stream: Provider[]; free: Provider[]; rentOrBuy: Provider[] }`, already grouped and deduplicated by the normalizer.
- `Provider` = `{ id: number; name: string; logoUrl: string | null }`.
- `Movie` adds `status: string | null`, `budget: number | null`, `revenue: number | null`, `productionCompanies: Company[]`, `directors: string[]`, `writers: string[]` (parsed from the existing `credits.crew`, no new request).
- `TvShow` adds `type: string | null`, `createdBy: string[]`, `networks: Company[]`, `productionCompanies: Company[]` (from the existing details response, no new request).
- `Company` = `{ id: number; name: string; logoUrl: string | null }`.

**Interface surface** (no HTTP endpoints, no Server Actions):

| Unit | Shape | Notes |
|---|---|---|
| `fetchMovieExtras(id)`, `fetchTvExtras(id)` | uncached fetch + Zod + normalize | `lib/tmdb/extras.ts`, the inner half per spec 0002 AC-23; `fetchMovie` extends its schema to keep `credits.crew` |
| `getMovieExtras(id)`, `getTvExtras(id)` | thin wrappers that throw `TmdbError`, over private `use cache` twins with `cacheLife("hours")` that return a `TmdbResult` | in `reads.ts`, exported through the barrel, the pair pattern of every read |
| `getVisitorRegion()` | `Promise<{ code: string; name: string }>` | new `lib/region.ts` (outside `lib/tmdb`, which may not read request state), `server-only`, React `cache()`d, reads `headers()`; the pure `parseRegion(header)` lives in `lib/catalog/region.ts` and is tested alone |
| `DetailHero` | new `actions?: ReactNode` slot, rendered beside `tracking` | holds the Trailer slot; the age chip goes inside each page's `meta` |
| Each extras slot | an async Server Component that calls `getMovieExtras(id)` / `getTvExtras(id)` itself | repeated calls in one render share one cached read; the trailer slot passes `{ key, name }` as props to the client `TrailerButton` |
| `PosterGrid` | `columns?: "catalog" \| "wide"` | plus exported `POSTER_GRID_SIZES` and `POSTER_GRID_EAGER`, both `Record<Columns, …>`; class strings are full literals so Tailwind emits them |
| New components | `TrailerButton` (client, uses `ui/dialog`), `WhereToWatch`, `AgeRatingChip`, `MoreLikeThis`, `CrewLines`, `FactsPanel` | in `components/catalog/` (shared by both pages); each async slot sits in its own Suspense boundary |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Grid | columns, `sizes`, eager count | the preset in `poster-grid.tsx` (AC-1 to AC-5) |
| Trailer | video key and name | extras `videos.results`, filtered by AC-11 |
| Where to watch | providers, groups, link | extras `watch/providers.results[region]` |
| Where to watch, age chip | region code and country name | `x-vercel-ip-country` → `parseRegion` → `Intl.DisplayNames(["en"], { type: "region" })`, fallback `US` (AC-9) |
| Age chip | certification | movie: extras `release_dates.results[region]`; show: extras `content_ratings.results[region]` (AC-13) |
| More like this | titles | extras `recommendations.results` (page 1), normalized with the existing summary normalizers |
| More like this | your status per card | the existing grid state reads behind `CatalogListCards` (`getMovieGridStates`, `lib/tracking/show-grid-status.ts`) |
| Crew | names | movie: existing `credits.crew`; show: existing `created_by` |
| Facts | every field | existing detail responses (`getMovie`, `getTvShow`), newly parsed |
| Facts | money format | new `formatUsdCompact` in `lib/format.ts` (`Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" })`) |
| Facts | language name | existing language name helper in `lib/format.ts` |
| Provider and company logos | image URL | `imageUrl` in `lib/tmdb/images.ts` from `logo_path` (host `image.tmdb.org`, already allowed) |

**Key invariants**:
- Nothing user or request specific enters a cached scope (lib/tmdb rule): the extras read takes only the id, and the region is applied after it returns.
- The library and catalog grid reads never trigger the extras read.
- Every preset's classes, `sizes` and eager count change together, and the test covers every preset.
- Missing stays missing: no section, line or chip is shown with placeholder text, a zero, or another region's data.
- A failure crosses the cache boundary as a `TmdbResult`, never a thrown `TmdbError`; the exported wrapper rebuilds and throws it outside the scope.

**Security model**: everything new is public catalog data. The region header is read per request and is not stored or logged. The YouTube iframe does not exist in the page until the visitor presses Trailer. No new environment variable, secret or database access. The TMDB token stays in `lib/tmdb/env.ts`.

**Configuration required**: none.

**Critical test scenarios**:
- `poster-grid.test.tsx` loops over `POSTER_GRID_SIZES` and checks each against its columns with the AC-4 rule, and checks that `wide` keeps today's classes, verifies **AC-1**, **AC-3**, **AC-4**.
- Fixture tests for the extras normalizer: trailer choice (official trailer over teaser, newest wins, bad key dropped), provider grouping and deduplication, certification choice (type 3 first, empty skipped), adult recommendations dropped, missing logos, verifies **AC-11** to **AC-14**.
- `parseRegion`: `PL` → Poland, missing, lowercase, three letters, `XX`, `T1` or an unnameable code → `US`, verifies **AC-9**. Another real country is checked on a preview with `curl -H "x-vercel-ip-country: PL"`, since local runs have no header and always show `US`.
- Crew and facts normalizers: writer deduplication and cap, zero budget becomes null, verifies **AC-15**, **AC-16**.
- A request scope test: rendering a library tab or `getTvShow` makes no extras call, and the extras read takes no request state, verifies **AC-8**, **AC-9**.
- In the running app: a movie and a show with every section, a title with none (no trailer, no providers, no recommendations), a forced extras failure, the trailer dialog by keyboard, and every grid page at the five widths, verifies **AC-2**, **AC-7**, **AC-11** to **AC-18**, **AC-20**.
- `pnpm build` route table and the prerendered shells, verifies **AC-10**.
- `/privacy` shows YouTube and the country sentence; the legal boundary test passes with `JUSTWATCH_ATTRIBUTION`, verifies **AC-12**, **AC-19**.
- Existing tests to update: `movie-hero.test.tsx` and the show hero tests (new slot), `lib/legal/boundary.test.ts`, the `/privacy` page test and any `PROCESSORS` assertion, `app/showcase/page.test.tsx`, `skeleton.test.tsx` and the library skeleton tests. `json-ld.test.tsx` and `security-boundary.test.ts` should need no change; if they do, something leaked.

## Build plan

1. Card preset: add `columns` with `catalog` and `wide`, `POSTER_GRID_SIZES` and `POSTER_GRID_EAGER`; point `POSTER_SIZES` at the catalog value; switch `SeasonGrid` and `ShowDetailSkeleton` to `wide` with its sizes; rewrite `poster-grid.test.tsx` to loop over presets and update its `covers` header. Satisfies **AC-1**, **AC-3**, **AC-4**.
2. Card rollout: replace the four `EAGER_POSTERS` with `POSTER_GRID_EAGER.catalog`, give `LibrarySkeleton` the 6 card visibility list, show 6 cards in `/showcase`, then check every grid page at 375, 640, 768, 1024 and 1280px. Satisfies **AC-2**, **AC-5**, **AC-6**, **AC-7**.
3. Tracer bullet for title pages: the extras schemas, normalizer and cached reads for movies, `lib/region.ts`, and the Where to watch section on the movie page with its skeleton, empty and error states, verified against live TMDB in the running app and in the build. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-12**, **AC-18**.
4. Trailer and age rating on the movie page: `TrailerButton` with the dialog and the click to load iframe, `AgeRatingChip` in the hero meta, and the legal change (`PROCESSORS`, the country sentence, `LEGAL_LAST_UPDATED`). Satisfies **AC-11**, **AC-13**, **AC-19**.
5. More like this, crew and facts on the movie page: the recommendations row through `CatalogListCards`, the new `Movie` fields and `formatUsdCompact`, `CrewLines` and `FactsPanel`, in the AC-17 order. Satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**.
6. Show page parity: the TV extras read (with `content_ratings`), the new `TvShow` fields, and every section on `/shows/{id}` in its order. Satisfies **AC-8**, **AC-11** to **AC-17**.
7. Proof: the fixture, region and request scope tests, 375px and keyboard passes, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; amendment notes in spec 0004 (AC-9), spec 0006 and spec 0009 (new sections), and `prompts/grid-tabs-footer-legend.md`. Satisfies **AC-7**, **AC-10**, **AC-20**.

## Consequences

**Positive**:
- One card size everywhere, and 30 titles per desktop screen instead of 20.
- Title pages answer the questions visitors leave for: what it looks like, where to watch it, what else is like it, who made it.
- The library pages pay nothing for the new data.

**Negative / tradeoffs**:
- ~~A 20 title page ends with a short last row at 3, 5 and 6 columns.~~ Fixed by the 2026-10-13 amendment (AC-21, AC-22), at the cost of two TMDB reads per catalog or search page instead of one, and page numbers that point at different titles than before.
- Smaller desktop posters make captions and controls tighter, and six eager posters means a phone preloads three rows instead of two.
- Each title page view can cost one more TMDB request per hour per title, and a cold page waits on it for two of its sections.
- Embedding YouTube adds a processor and a legal update. Region from an IP header is approximate (VPNs and travel show another country), and local development always shows the `US` fallback.
- The title pages get longer, and more sections means more states to keep honest.

**Neutral**:
- Spec 0004 AC-9 returns to its original column counts. The 2 and 4 column decision in `prompts/grid-tabs-footer-legend.md` now applies only to the season grid.
- The deferred "per visitor region on the home rows" item now has a precedent (`lib/region.ts`) it can reuse.

## Follow-up

- [ ] `components/AGENTS.md` still describes the grid as 2 and 4 columns with 5 full rows, and `lib/tmdb/AGENTS.md` should list the extras read and its `hours` lifetime; `/sync` updates both after the build.
- [ ] Later batch (from the grilling, kept on the scope's Deferred list): external links and the movie collection row.
