# 0009. TV show page, season pages and popular shows landing

**Date**: 2026-09-24
**Status**: Accepted

Scope feature: [10. TV show page](../../scope/scope.md) · Beta tier

## Summary

This decides how a visitor finds a TV show and browses its seasons and episodes. `/shows` becomes a grid of popular shows, the same as `/movies`. Each card opens `/shows/[id]`, a public page with the same hero as a movie. The hero adds the years the show aired and TMDB's status word, and below it come the overview, a grid of season cards (Specials last) and the series cast. Each season card opens its own page, `/shows/[id]/season/[n]`, which lists every episode with its still, air date, runtime, TMDB rating and synopsis. Nothing here reads a session, stores anything or shows a tracking control. The pages only leave empty places where features 12, 13 and 14 will put them.

## Requirements

**User stories**:

- As a visitor, I want a page of popular shows I can page through, so that I have a way into TV before search exists.
- As a visitor, I want a show page that tells me what the show is, when it aired, whether it has ended, who is in it and what seasons exist, so that I can decide whether to watch it.
- As a visitor, I want a page per season listing every episode with its air date, so that I can see what a season contains and what is still to come.
- As a visitor, I want missing artwork, dates or text to look deliberately absent rather than broken or made up, so that I can trust what the page does show.
- As the engineer building features 12 to 14, I want the show, season and episode layouts to already have places for tracking controls and calculated ratings, so that adding them does not mean reworking these pages.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/shows` renders the heading "Popular shows", a short line saying the order comes from TMDB popularity, and a `PosterGrid` of the results of `discoverTvShows({ page })`. Each result is a `PosterCard` with the show's name as its title, its `TmdbRatingBadge` in the badge slot, and `href` of `/shows/{id}`. It has no bookmark or other tracking control (TV tracking arrives with feature 14). A card whose poster is missing uses the existing fallback tile. The first row's images load with `priority`. The page title stays "Shows".
- **AC-2**: `/shows?page=N` pages exactly like `/movies` (spec 0006, AC-2): `parsePageParam` reads the value before any TMDB call, `PaginationLinks` shows Previous, "Page N of M" with M as `lastReachablePage(totalPages)`, and Next, and both the malformed value branch and the past the last page branch show the empty `StatePanel` "That page doesn't exist" with a link to `/shows`.
- **AC-3**: A signed out visitor opening `/shows/{id}` for a real show sees, in this order: the backdrop hero (the movie hero's layout: faded backdrop, poster and title block overlapping its lower edge); in the title block the show's name as the page's only `h1`, the tagline, a meta line holding the air span (AC-4) and TMDB's status word as a non interactive `GlassPill`, the genre chips on their own row, then the TMDB rating block (amber badge, visible "TMDB" label, vote count, or "No TMDB rating yet"); below the hero three sections under `h2` headings: "Overview", "Seasons", "Cast".
- **AC-4**: The air span is derived without a clock. With no first air year, it is omitted. When the status is `Ended` or `Canceled` and TMDB has a last air year, it reads `{first}–{last}` (for example `2008–2013`), or just `{first}` when both years are the same. Otherwise, when TMDB has a last air year (something has aired), it reads `{first}–present`. Otherwise (nothing has aired yet) it reads just `{first}`. The status pill shows TMDB's word verbatim (`Returning Series`, `Ended`, `Canceled`, `In Production`, `Planned`, `Pilot`) and is omitted when TMDB gives none.
- **AC-5**: Every missing show value is omitted or stated as absent, never invented or zeroed, with the same rules as spec 0006, AC-4: no backdrop collapses the hero, no poster uses the fallback tile, no tagline, air span, status or genres leaves that part out, and no overview in English or the original language reads "No overview available." A show TMDB lists with no seasons shows "TMDB lists no seasons for this show yet." in the Seasons section.
- **AC-6**: When TMDB has no English overview for the show but has one in its original language, the page shows that overview with the matching `lang` attribute and the muted note "Shown in the original language ({language})", exactly as spec 0006, AC-5 does for movies. Season and episode text is English only: a missing season or episode overview is left out, with no fallback and no note.
- **AC-7**: The Seasons section is a grid of season cards: regular seasons in ascending season number, then season 0 last, titled with TMDB's name (usually "Specials"). Each card is a `PosterCard` linking to `/shows/{id}/season/{n}` with the season's name as its title and a meta line of the season's air year and its episode count, joined with the hero meta line's ` · ` separator, (`1 episode`, `13 episodes`), or `No episodes listed yet` when TMDB lists zero. A season with no air date leaves the year out. The card's poster is the season poster, else the show poster, else the fallback tile. Seasons with zero episodes are shown, never hidden.
- **AC-8**: The Cast section shows the series cast from TMDB's aggregate credits: at most 12 people, sorted by total episode count (most first) and then TMDB's billing order, each with the character from the role they played in the most episodes (the first listed role on a tie). It reuses `CastRow`, with the empty text "TMDB lists no cast for this show." The cast streams inside its own Suspense boundary with a cast row skeleton. If the cast read fails, only that section shows the error `StatePanel` with a "Try again" `RetryLink`; the hero, overview and seasons stay on screen.
- **AC-9**: A season page `/shows/{id}/season/{n}` opens with a compact header and no backdrop: a back link showing a left arrow icon and the show's name, leading to `/shows/{id}`; the season poster (season, else show, else fallback tile) beside the show's name as a muted line, the season's name as the page's only `h1`, a line with the season's air year and episode count (the AC-7 wording, each part omitted when absent), and the season overview when TMDB has one in English.
- **AC-10**: Below the header, every episode in the season is listed in episode number order, with no pagination. Each row shows: the still at 16:9 (or a fallback tile with an icon at the same footprint); a muted label `Episode {number}`; the episode's name as an `h2`, or `Episode {number}` as the `h2` (and no separate label) when TMDB gives no name; a line with the air date formatted `Mar 3, 2013`, or `Air date not announced` when TMDB has none, followed by the runtime (`47m`, `1h 2m`) when known; the amber `TmdbRatingBadge` with a visible "TMDB" label when TMDB has a rating, and nothing when it has none; and the overview clamped visually to 3 lines, left out when TMDB has none. No episode is marked upcoming or aired. That label belongs to the eligibility rule in features 12 and 14. The first 2 rows' stills load eagerly (`EAGER_STILLS = 2`, the counterpart of the landing's `EAGER_POSTERS`) and every later still loads lazily.
- **AC-11**: A season TMDB lists with no episodes shows the empty `StatePanel` "No episodes yet" with the body "TMDB lists no episodes for this season yet." and a link back to the show, in place of the list.
- **AC-12**: Below the episode list, a Previous season link and a Next season link, each showing the target season's name, move through the seasons in the AC-7 order (Specials last). Each link is absent at its end of the list. Both are plain links, meet the 44px touch target on mobile, and need no client code.
- **AC-13**: `proxy.ts` answers with HTTP 404 and the app's not found page, before any Supabase or TMDB call, for `/shows/{segment}` whose segment is not a canonical id (the same rule as movies), and for `/shows/{id}/season/{segment}` when either the id is not canonical or the season segment is not `0` or a canonical positive integer up to 9999. Image extension URLs under `/shows/` reach this rule, like `/movies/`.
- **AC-14**: A canonical show id that TMDB does not know, or that TMDB flags as adult, renders "We couldn't find that show" with a link to `/shows`, on the show page and on any of its season pages, with `<meta name="robots" content="noindex">` and status 200 (a soft 404, as spec 0006, AC-9 accepted). A known show whose season number is not in its season list renders "We couldn't find that season" with a link back to `/shows/{id}`, also `noindex`, without requesting the season from TMDB. A season in the list that TMDB then answers as not found takes the same branch.
- **AC-15**: When TMDB times out, rate limits or fails upstream, the landing grid, the show page body and the season page body each render the error `StatePanel` ("Couldn't reach TMDB", "TMDB didn't respond. Try again in a moment.") with a "Try again" `RetryLink` to the same URL; the navbar and shell stay usable. The failure lifetimes of spec 0006, AC-10 apply unchanged.
- **AC-16**: The show page's `<title>` is `{name} ({firstAirYear})` (or `{name}` with no year) through the root layout's title template, and its description is the shown overview cut by `truncateAtWord` to 160 characters, or absent. The season page's title is `{season name} · {show name}` and its description is the season overview cut the same way, or absent. The not found branches use "Show not found" and "Season not found" with `noindex`; a TMDB failure uses "Show" or "Season".
- **AC-17**: All three routes serve a prerendered shell: `pnpm build` reports `/shows`, `/shows/[id]` and `/shows/[id]/season/[number]` as partially prerendered, none exports `instant = false`, and no TMDB request happens at build time. Each streamed part shows a skeleton at the footprint of what replaces it (grid cards; hero, section headings, a season card row and a cast row; season header and a few episode rows).
- **AC-18**: No route under `app/shows/` reads `cookies()`, `headers()`, a Supabase client or any session value, and no `use cache` scope added or changed by this feature receives a user specific value; the spec 0005 layout purity test and the request scope grep test (extended to `app/shows/`) pass. No tracking control, personal rating or calculated rating renders anywhere. The reserved places (the show hero under the rating block, the season header, and each episode row) render no DOM node in this feature.
- **AC-19**: At 375px wide all three pages work with no horizontal page scroll: the show hero stacks like the movie hero; season cards follow the `PosterGrid` columns; each episode row stacks the still full width above its text; the season header keeps a small poster beside its text; every interactive element keeps the visible focus ring and its touch target. Images that sit beside their own text (backdrop, posters, stills, cast photos) carry `alt=""`.
- **AC-20**: The show read is cached for `hours` rather than `days`, so a new season or a status change appears within hours. The series cast is its own read, `getShowCast(id)`, cached for `days`, so `getShowEpisodes` and the list screens that reuse `getTvShow` never download the cast. `getSeason` keeps `hours`. The movie page renders exactly as before (its hero and cast tests still pass after the shared hero is extracted).

## Decision

**Chosen option**: Option 1: A show route plus one route per season, all streamed inside prerendered shells, with the series cast as its own cached read.

The TV pages copy the movie page's architecture (static shell, streamed cached TMDB reads, proxy 404 for malformed ids, soft 404 for unknown ids) and add a season route, so each page does one bounded set of reads and later tracking features each have a natural home.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for verifying the three routes in the running app · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) for diagnosing a shell `pnpm build` does not report as prerendered.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (no reference in `design/`)

`design/` has no show, season or episode artboard, so the layout is proposed here and approved with the spec (`AGENTS.md` section 3), extending the movie page from spec 0006 and the existing references. It adds no colour, token or glass utility.

- **Landing** (`/shows`): identical to `/movies`: heading and popularity note top left, `PosterGrid`, pagination row centred below.
- **Show hero**: the movie hero, unchanged in geometry. The meta line reads `2008–2013` followed by the status pill; the genre chips wrap onto the next row, so the status pill never sits inside the genre chips.
- **Below the hero**: "Overview" (reading width, as movies), "Seasons" (season cards in the `PosterGrid` columns, each with a one line meta caption under the title), "Cast" (the existing `CastRow`).
- **Season page**: back link at top left; then a header row with the season poster (about 96px wide on mobile, 160px on desktop, the poster card's rounded frame and rim) and the text block beside it; then the episode list as a single column of rows separated by the existing border colour. On `md` and up a row is the still (about 240px wide, 16:9, rounded like the poster frame) on the left and the text on the right; below `md` the still sits full width above the text. The Previous and Next season links sit in a row under the list, spread to either end.
- **Skeletons** reuse the existing skeleton pieces at the same footprints.
- `/develop` settles exact pixel values by eye against the movie page and records nothing new in `globals.css`; a truly missing token comes back here first.

**Data model sketch**:

No database change. This feature reads only TMDB, through the existing module. Module changes (each a three place change: `schemas.ts`, `types.ts`, `normalize.ts`, per `lib/tmdb/AGENTS.md`):

| Type | Field | Type | Change |
|---|---|---|---|
| `TvShow` | `adult` | `boolean` | New. From TMDB's `adult`; missing normalizes to `false`. |
| `TvShow` | `tagline` | `string \| null` | New. Empty string normalizes to null. |
| `TvShow` | `lastAirYear` | `number \| null` | New. The year of `lastAirDate` through the module's existing `yearFromDate`, mirroring `firstAirYear`, so `lib/format.ts` never parses a TMDB date for the air span. |
| `TvShow` | `originalLanguage` | `string` | New. Required, like `Movie.originalLanguage`. |
| `TvShow` | `overview` | `string \| null` | Now the resolved overview through the existing `resolveOverview` (English, else original language translation, else null). |
| `TvShow` | `overviewLanguage` | `string \| null` | New. As on `Movie`. |
| `TvShow` | `cast` | removed | The show read no longer carries credits. |
| `ShowCastMember` (new) | as `CastMember` | | `personId`, `creditId` (the chosen role's `credit_id`), `name`, `character` (the chosen role's), `profileUrl`, `order` (position in TMDB's aggregate list). `CastRow` accepts it because the shape is identical; the type is an alias of `CastMember`. |

`fetchTvShow` requests `append_to_response: "translations"` (was `credits`), still one request. New `fetchShowCast(id)` requests `/tv/{id}/aggregate_credits`, parses each cast entry with `safeParse` (a malformed one is dropped, like a movie credit), picks per person the role with the highest `episode_count` (the first on a tie), sorts people by `total_episode_count` descending and then by TMDB's `order` ascending (a live read of 1396 on 2026-09-24 already came back in this order; the explicit sort guards against TMDB changing it), and returns at most the first 12 (`SHOW_CAST_LIMIT`, so the cached value stays small even when TMDB returns hundreds of people). A person with no parseable role is dropped.

**Cache lifetimes** (in `reads.ts`): `getTvShow` moves from `days` to `hours`. New `getShowCast` uses `days`. `getSeason` stays `hours`, `discoverTvShows` keeps its existing profile. Failures take `failureProfile(kind)` as today.

**State transitions**: none.

**API surface** (routes and module functions; no mutations, no Server Actions):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/shows` | GET (page) | `page`: search param, optional, 1 to 500 | heading, grid of up to 20 cards, pagination row | public | malformed or past last page: empty panel; TMDB failure: error panel with retry |
| `/shows/[id]` | GET (page) | `id`: path segment, canonical positive integer | hero, overview, seasons grid, cast, metadata | public | malformed id: 404 from proxy; unknown or adult: soft 404 panel; TMDB failure: error panel; cast failure: section error only |
| `/shows/[id]/season/[number]` | GET (page) | `id` as above; `number`: `0` or canonical positive integer up to 9999 | header, episode list, previous and next links, metadata | public | malformed: 404 from proxy; unknown show or season: soft 404 panel; TMDB failure: error panel |
| `proxy.ts` | every request | pathname | 404 rewrite for a malformed show id or season segment, else unchanged | none | none |
| `getTvShow(id)` | module function | `id: number` | `TvShow` with the new fields, no cast | server only | `TmdbError` by kind |
| `getShowCast(id)` | module function (new) | `id: number` | `ShowCastMember[]`, at most 12 | server only | `TmdbError` by kind |
| `getSeason(showId, n)` | module function | ids | `SeasonDetail` | server only | `TmdbError` by kind |
| `discoverTvShows({ page })` | module function | `page: number` | `Paged<TvShowSummary>` | server only | `TmdbError` by kind |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Landing | page number, M, "past the last page" | `parsePageParam`, `lastReachablePage(totalPages)`, `page > M` after the read |
| Landing | results, card rating | `discoverTvShows({ page })` (`include_adult=false`, TMDB's default popularity order), `TvShowSummary.tmdbRating` |
| Show | show id | path segment through `parseTmdbId` (below) |
| Show | found, not found or failed | `loadShow(id)`: `not_found` on `isTmdbNotFound` or `show.adult === true`, `failed` on any other `TmdbError` |
| Show | name, tagline, poster, backdrop, genres, rating, vote count | `TvShow` fields; vote count through `formatVoteCount` |
| Show | air span | `formatAirSpan({ firstAirYear, lastAirYear, status })` (new, pure, in `lib/format.ts`), the AC-4 rule; `Ended` and `Canceled` compared exactly |
| Show | status pill text | `TvShow.status`, omitted when empty |
| Show | overview and its language | `TvShow.overview`, `TvShow.overviewLanguage`; language name through `languageName` |
| Show | season order | `orderSeasons(seasons)` (new, pure, `lib/catalog/seasons.ts`): regular ascending, then season 0 |
| Show | season card year | year of `SeasonSummary.airDate` (first four characters), omitted when null |
| Show | season card count text | `formatEpisodeCount(episodeCount)` (new, `lib/format.ts`): `No episodes listed yet` at 0, `1 episode`, else `N episodes` |
| Show | season card poster | `season.posterUrl ?? show.posterUrl`, else the fallback tile |
| Show | cast | `getShowCast(id)`, already sorted and limited to 12 |
| Season | season number | path segment through `parseSeasonNumber` (below) |
| Season | show name, poster fallback, season list | the same `loadShow(id)` |
| Season | season exists | `show.seasons.some(s => s.seasonNumber === n)`, checked before `getSeason` |
| Season | header and episodes | `getSeason(id, n)` |
| Season | previous and next season | neighbours of `n` in `orderSeasons(show.seasons)` |
| Season | air date text | `formatAirDate(airDate)` (new, `lib/format.ts`): parses `YYYY-MM-DD` as a UTC calendar date and formats with `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })`, so the date never shifts by a day with the server's timezone; null or malformed gives null, which the row shows as `Air date not announced` |
| Season | runtime text | `formatRuntime(Episode.runtimeMinutes)`, omitted when null |
| Season | episode rating | `Episode.tmdbRating` |
| Both detail routes | `<title>` and description | `generateMetadata`, branching on the same `loadShow` / `loadSeason` result as the body |
| Proxy | "malformed" | `parseTmdbId` and `parseSeasonNumber` against the `/shows/{id}` and `/shows/{id}/season/{n}` patterns |
| Retry links | target URL | the current path (and `page` for the landing), built on the server from `params` and `searchParams` |

**Shared helpers** (pure, unit tested, no `server-only`):

- `lib/catalog/ids.ts`: rename `parseMovieId` to `parseTmdbId` (same rule, same tests) and update its callers (`proxy.ts`, `app/movies/[id]/page.tsx`, `ids.test.ts`). Add `parseSeasonNumber(segment): number | null`, accepting `^(0|[1-9]\d{0,3})$`, so `00`, `01`, `-1`, `1.0` and `10000` are refused.
- `lib/catalog/seasons.ts`: `orderSeasons` and `adjacentSeasons(ordered, n)`.
- `lib/format.ts`: `formatAirSpan`, `formatAirDate`, `formatEpisodeCount`.

**Server helpers** (server only, in `app/shows/[id]/`):

- `load-show.ts`: `loadShow(id): Promise<{ kind: "found"; show: TvShow } | { kind: "not_found" } | { kind: "failed" }>`, the `loadMovie` pattern.
- `season/[number]/load-season.ts`: `loadSeason(id, n)` returning `found` (with `show`, `season`), `show_not_found`, `season_not_found` or `failed`. It calls `loadShow` first, checks membership, then `getSeason`, mapping its `isTmdbNotFound` to `season_not_found`.

**Components**:

- `components/catalog/detail-hero.tsx` (new): the hero extracted from `MovieHero`, taking the title, tagline, poster, backdrop, one `meta` node, the rating props and the `tracking` slot. It takes no `genres` prop: each wrapper composes its own meta block. `MovieHero` becomes a thin wrapper whose `meta` is today's `MovieFacts` (year, runtime and genre chips in one shared wrapping row), so the movie page renders exactly as before and its props and tests stay unchanged. The show passes `ShowMeta`: the air span and status pill in one row, and the genre chips in a separate row below it.
- `components/show/`: `show-meta.tsx` (air span and status pill), `season-grid.tsx`, `season-header.tsx`, `episode-row.tsx`, `episode-list.tsx`, `season-nav.tsx`, `show-detail-skeleton.tsx`, `season-skeleton.tsx`. All Server Components; no new client boundary.
- `PosterCard` gains an optional `meta` prop (a one line caption under the title), used by season cards.
- `CastRow` gains an `emptyMessage` prop; the movie page passes its current text. Its own limit of 12 stays for movies and becomes a no op for shows; a comment ties it to `SHOW_CAST_LIMIT` so the two do not drift.
- `MovieOverview` is reused as is for the show overview; its fallback text is already generic.
- The reserved tracking places are optional `tracking` props (`DetailHero`, `SeasonHeader`, `EpisodeRow`) that the pages leave undefined, so they render nothing.

**Routes**:

- `app/shows/page.tsx` (rewritten): static heading, `Suspense` around `PopularShows`.
- `app/shows/[id]/page.tsx`: `Suspense` around `ShowDetail`; inside it a nested `Suspense` around `ShowCast`; `generateMetadata`.
- `app/shows/[id]/not-found.tsx`: the show not found panel.
- `app/shows/[id]/season/[number]/page.tsx`: `Suspense` around `SeasonDetail`; `generateMetadata`. The unknown season panel renders inline (a `not-found.tsx` receives no params, so it could not link back to the show); the unknown show branch calls `notFound()`.

**Proxy change**: generalize the malformed id rule to a small table of patterns (`/movies/{id}`, `/shows/{id}`, `/shows/{id}/season/{n}`), each segment decoded and parsed as today; add `shows/` to the matcher's image extension exception.

**Key invariants**:

- A TMDB rating never appears without the amber badge and the "TMDB" label; no personal or calculated rating appears in this feature.
- No value is invented: missing stays missing (AC-5, AC-10), and no date is compared with today.
- The proxy never calls TMDB or Supabase to decide a 404.
- An adult flagged show never renders its details, on the show page or a season page.
- No TMDB call at build time; no cached scope sees a cookie, header or session.
- `getShowEpisodes` still excludes season 0 and still reports `complete`; this feature only removes the cast from the show read it reuses.

**Security model**: Public, read only pages with no user data. The TMDB token stays in `lib/tmdb/env.ts`; pages import only `lib/tmdb/index.ts`. Inputs are the `id`, `number` and `page` segments, all validated before any request (proxy and page both). Adult titles are excluded on every path. No rate limiting is added: the pages are cache backed, and TMDB's own limits are handled by the module's retry budget.

**Configuration required**: none.

**Critical test scenarios**:

- Happy path: open `/shows`, click Breaking Bad (1396), see the hero with `2008–2013` and `Ended`, the overview, five seasons then Specials last, and Bryan Cranston first in the cast; open Season 2 and see its 13 episodes in order with dates, runtimes and ratings; Next season goes to Season 3. Verifies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-12**.
- Air span: unit cases for ended over several years, ended in one year, canceled, returning with aired episodes (`–present`), planned with nothing aired, no first air date, and no status. Verifies **AC-4**.
- Missing data: fixtures with no backdrop, poster, tagline, genres, status, overview or seasons, a season with no poster and no date, an episode with no name, still, date, runtime, rating or overview, each rendering the stated fallback and no zero or placeholder. Verifies **AC-5**, **AC-7**, **AC-10**.
- Language fallback: a show fixture with an empty English overview and a translation in its original language resolves to it with the note; an episode with no English overview shows nothing. Verifies **AC-6**.
- Aggregate cast: a fixture with a person holding two roles picks the one with more episodes; a malformed entry is dropped; the result is sorted by total episode count then order, even when the fixture lists them out of order, and capped at 12. Verifies **AC-8**.
- Empty season: a fixture season with zero episodes shows the card text and the empty panel. Verifies **AC-7**, **AC-11**.
- Not found: `curl -I` on `/shows/abc`, `/shows/1396/season/01`, `/shows/1396/season/10000` returns 404; an unknown id and an adult id show the soft 404 with `noindex`; `/shows/1396/season/42` shows "We couldn't find that season" and makes no season request. Verifies **AC-13**, **AC-14**, **AC-16**.
- Failure: with TMDB unreachable, each route shows the error panel and a working retry; a failing cast read leaves the rest of the show page intact. Verifies **AC-8**, **AC-15**.
- Shell and scope: `pnpm build` output lists the three routes as partially prerendered; the request scope grep test covers `app/shows/`. Verifies **AC-17**, **AC-18**.
- Mobile: at 375px, no horizontal scroll on any of the three pages, episode rows stacked, focus ring visible on the back link, cards and season links. Verifies **AC-19**.
- Regression: the movie page hero and cast tests pass unchanged; `getShowEpisodes` tests pass with the lean show read. Verifies **AC-20**.

## Build plan

Ordered as a Tracer Bullet: one thin real thread from the landing to a season page first, then each strand thickened end to end.

1. **The thin thread.** Replace the `/shows` placeholder with page 1 of `discoverTvShows` in `PosterGrid`, cards linking to a streamed `/shows/[id]` that renders only the name and poster from the existing `getTvShow`, linking to a streamed `/shows/[id]/season/[number]` that lists episode names from `getSeason`. Verify in the running app and confirm all three routes are partially prerendered in `pnpm build`. Satisfies **AC-1**, **AC-17**.
2. **Module strand.** `TvShow` gains `adult`, `tagline`, `originalLanguage`, `lastAirYear`, the resolved `overview` and `overviewLanguage`, and loses `cast`; `fetchTvShow` appends `translations`; new `fetchShowCast` and `getShowCast` with the aggregate role rule and the cap of 12; `getTvShow` moves to `hours`. Extend `tv-1396.json` with its real translations block, add an aggregate credits fixture and an empty English overview show fixture; unit tests for each rule; `getShowEpisodes` tests still green. Satisfies **AC-6**, **AC-8**, **AC-20**.
3. **Show page thickened.** Extract `DetailHero` and turn `MovieHero` into a wrapper (movie tests unchanged); `formatAirSpan`, `orderSeasons`, `formatEpisodeCount` with tests; `ShowMeta`, the overview, `SeasonGrid` with the `PosterCard` `meta` prop, the cast section in its own Suspense with its section error, `CastRow`'s `emptyMessage`, `ShowDetailSkeleton`, every AC-5 fallback, the mobile layout. Verify desktop and 375px in the running app. Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-19**, **AC-20**.
4. **Season page thickened.** `parseSeasonNumber`, `adjacentSeasons` and `formatAirDate` with tests; `SeasonHeader`, `EpisodeRow`, `EpisodeList`, `SeasonNav`, `SeasonSkeleton`; the empty season panel; lazy stills; the mobile stacking. Verify a long season and a specials season in the running app. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-19**.
5. **Not found, failure and metadata strand.** Rename to `parseTmdbId`; the proxy pattern table and matcher exception; `loadShow` and `loadSeason` with tests for every outcome; `app/shows/[id]/not-found.tsx` and the inline season panel; error panels with `RetryLink` on all three routes; `generateMetadata` for both detail routes. Check the statuses with `curl -I`, the `noindex` tags, and a retry with TMDB blocked then restored. Satisfies **AC-13**, **AC-14**, **AC-15**, **AC-16**.
6. **Landing pagination.** `parsePageParam`, `PaginationLinks` and the "That page doesn't exist" panel on `/shows`. Satisfies **AC-2**.
7. **Proof.** Component tests for the hero meta, season cards, episode row fallbacks and season navigation edges; extend the request scope grep test to `app/shows/`; the spec 0005 purity test; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; `security-boundary.test.ts` still passes. Satisfies **AC-17**, **AC-18**, **AC-19**, **AC-20**.

## Consequences

**Positive**:

- TV reaches parity with movies using the same shell, error and not found patterns, so there is one way to build a catalog page.
- Each season page does a bounded number of cached reads (show plus one season), however many seasons a show has.
- Features 12, 13 and 14 each have a place to land: episode controls in the row, mark season watched and the season rating in the header, the status control in the hero.
- Taking the cast out of the show read keeps `getShowEpisodes`, and so progress, Up Next and the TV watchlist, from downloading up to a megabyte of credits per show.

**Negative / tradeoffs**:

- The show page now makes two TMDB requests (show, cast) instead of one; they run in parallel and the cast streams separately. This relaxes spec 0002, AC-6 for TV.
- Aggregate credits for a long running show are large (about 1.2 MB for Grey's Anatomy, measured 2026-09-24). It is fetched at most once a day per show and cached as 12 entries, but a cold read is slower than plain credits.
- The show read refreshes hourly instead of daily, so popular shows cost more TMDB requests.
- No upcoming label: a visitor has to read the date to know an episode has not aired, until features 12 and 14 add the rule.
- Soft 404s answer 200, as accepted for movies.
- A season with hundreds of episodes renders a long page; lazy stills keep it usable, but the HTML is large.
- Without JavaScript the pages show only their skeletons, the cost of the instant shell already accepted in spec 0006.

**Neutral**:

- `parseMovieId` becomes `parseTmdbId`; the proxy's single movie rule becomes a small pattern table.
- `MovieHero`'s internals move into `DetailHero`; its public props do not change.
- The `/shows` placeholder and its note about a missing owner go away.

## Follow-up

- [ ] `/sync` after the build: update `lib/tmdb/AGENTS.md` (show lifetime `hours`, `getShowCast` and its cap, the show read no longer carries credits, TV `adult` check), and the proxy line in root `AGENTS.md` (the rule now covers `/shows/` and its matcher exception).
- [ ] Spec 0002, AC-6 says `getTvShow` appends credits in one request; flag it as amended by this spec when `/sync` reconciles specs.
- [ ] Feature 12 adds the per episode controls and mark season watched into the reserved places, and decides the aired boundary together with an upcoming label if wanted.
- [ ] Feature 13 shows the calculated season rating in the season header and the show rating in the hero's reserved place.
- [ ] Feature 14 adds the status control to the show hero and the TV bookmark to `/shows` cards.
- [ ] Feature 17 (SEO) extends the metadata here and decides on season pages in the sitemap.
- [ ] Verify records one cold and one warm timing for a long running show page (for example 1416), to confirm the aggregate cast cost is acceptable.
