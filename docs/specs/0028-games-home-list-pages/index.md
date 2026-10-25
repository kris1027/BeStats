# 0028. Games home and list pages: the parallax landing at /games and five paged IGDB lists

**Date**: 2026-10-25
**Status**: In Progress

Scope feature: [G6. Games home and list pages](../../scope/games.md) · Beta tier

## Summary

`/games` becomes the games landing, built from the same parallax landing that `/shows` and `/movies` use today, filled with five IGDB lists: Trending, Popular, Recently released, Coming soon and Top rated. Each list also gets its own paged See all page under `/games/{slug}`. The landing sections learn to draw a game the way they draw a show or a movie, so there is one landing, not a copy. Nothing is stored and no schema changes; the work is new IGDB reads (a popularity read, an art field, a page size), five public routes, a proxy rule, and the navigation pieces spec 0027 left for G6. Until the G10 launch every games page stays `noindex`, out of the sitemap, and unlinked in production.

## Requirements

**User stories**:

- As a visitor, I want a games landing that shows what is trending, popular, new, coming soon and top rated, so that I can find a game without searching.
- As a visitor, I want a See all page for each list with pages, so that I can go deeper into the one list I care about.
- As a signed in user, I want the hero's game to offer the same status control the game page has, so that I can mark it Want to play straight from the landing.
- As a user with the games library on, I want the GAMES tab on every page and a Browse games button on an empty games tab, so that I can always get to games.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/games` renders, in order: an `sr-only` h1 `Games`, the hero, Trending (the pinned row), Popular (the staggered grid), Recently released (the sticky sidebar with three columns, sidebar label `New releases`), Coming soon (the counter moving rows) and Top rated (the numbered list). Each section uses the same component, layout, motion, reduced motion behaviour, mobile layout, skeleton and See all link as on `/shows` and `/movies` (prompts/home-parallax-landing.md, decisions 6, 9, 11, 14 and 16). The section headings are the `rowTitle` values in AC-9.
- **AC-2**: Each landing section and its list page read exactly this source:

  | Slug | Row title | Source |
  |---|---|---|
  | `trending` | Trending now | `getPopularGames("trending")`: IGDB `popularity_primitives` of popularity type `Visits` (IGDB source) |
  | `popular` | Popular | `getPopularGames("popular")`: popularity type `Playing` (IGDB source) |
  | `recently-released` | Recently released | `discoverGames({ sort: "hypes_desc", minHypes: 1, releasedFrom: today − 59 days, releasedTo: today, pageSize: 24 })` |
  | `coming-soon` | Coming soon | `discoverGames({ sort: "hypes_desc", minHypes: 1, releasedFrom: today + 1 day, releasedTo: today + 120 days, pageSize: 24 })` |
  | `top-rated` | Top rated | `discoverGames({ sort: "rating_desc", minRatingCount: 100, pageSize: 24 })` |

  `today` is the current UTC day. Each landing section and each list page reads it right after its own `connection()` call; two sections that straddle midnight UTC may use different days, which is accepted. Both windows are inclusive, so `today − 59` to `today` is 60 days. Because the options carry the day, the "same cached call" promise of AC-3 holds within one UTC day. The popularity reads do not depend on `today`. The popularity type ids are pinned in `lib/igdb/constants.ts` and checked by `pnpm igdb:live` against IGDB's `popularity_types` (AC-6). The live check also counts the Recently released window with `minHypes: 1`; if it holds fewer than 12 games, Recently released switches to `sort: "release_desc"` with no hype floor, and this spec is amended to say so.
- **AC-3**: The landing shows Trending 9, Popular 14, Recently released 12, Coming soon 40 and Top rated 8 games, fewer when the list holds fewer, never padded. Coming soon fills rows 1 and 2 from the first 20 games of list page 1 and rows 3 and 4 from up to the first 20 of list page 2 (a short page 2 gives short rows), drops any game of page 2 already shown from page 1, and a failed page 2 leaves rows 3 and 4 out (decision 13 of the parallax plan, unchanged). Every landing read is the very same cached call as the matching list page (page 1, and page 2 for Coming soon), so opening See all costs no extra IGDB request while the entry is fresh.
- **AC-4**: `getPopularGames(kind)` reads `popularity_primitives` with `fields game_id,value; where popularity_type = {id}; sort value desc; limit 500`, removes duplicate `game_id`s keeping the first, reads those ids (at most 500, the batch limit) through the inner batch read, drops every game that is `hidden` or missing (a short list, never an error), and returns the rest in primitive rank order. Both requests run inside one cached function, `getPopularGamesCached(kind)`, through one `settle`, so the result is one cache entry per kind with lifetime `hours`, a failure of either request takes `failureProfile(kind)`, and a partial result is never cached as a success. Trending and Popular may share games; no game is removed across sections, as on the TMDB landings. A list page slices it: page N is items `(N − 1) × 24` to `N × 24`, and `totalResults` is the number of games kept, so the count is exact. The same game never appears twice in one list.
- **AC-5**: `discoverGames` accepts an optional `pageSize` of 20 or 24 (default 20, so G7 and spec 0023 callers are unchanged), validated before the cache like every other option (`IgdbValidationError` for any other value). The validated `pageSize` is part of `ValidDiscoverOptions`, so it is in the cache key. `readSummaryPage` takes `pageSize`, asks for `pageSize + 1`, keeps `pageSize`, and computes `offset = (page − 1) × pageSize`, so pages never overlap; `search.ts` passes 20. `page` stays 1 to 50.
- **AC-6**: `GameSummary` gains `artUrl: string | null`: the artwork with the lowest `image_id` (string order, so the pick is stable, since IGDB promises no array order), else the screenshot with the lowest `image_id`, else null, built at `t_1080p`. `IGDB_SUMMARY_FIELDS` gains `artworks.image_id` and `screenshots.image_id`; `schemas.ts` accepts each as an optional array of `{ image_id }` and treats an absent or empty array as none. Adding the field follows the module's three place rule (`schemas.ts`, `types.ts`, `normalize.ts`), and every `GameSummary` fixture and test across the repo gains `artUrl`. `lib/images/igdb-loader.ts` steps an art URL down a new `IGDB_ART_LADDER` (`t_screenshot_med`, `t_screenshot_big`, `t_720p`, `t_1080p`) the way it steps covers, never past the URL's own size; it matches an art size against the art ladder, not the cover ladder, so `t_1080p` does step down. `pnpm igdb:live` checks each art rung's real pixel width and the two popularity type ids and names.
- **AC-7**: The hero shows the first game of Trending over its `artUrl` (falling back to the cover cropped to fill, then the existing missing art state), the chip `#1 Trending`, the `IgdbRatingBadge` (labelled as the IGDB community rating) when rated, its genre names from the ids through `getGameGenres` (left out when that read fails), the name as an h2 linked to `/games/{id}`, and `GameTrackingSlot`, the G4 status control with its release gate and signed out behaviour exactly as on the game page. There is no Trailer button (G9). When Trending fails or is empty there is no hero; the Trending section below shows the one heading and the one error or empty state, as on `/shows`.
- **AC-8**: Every game card on the landing and the list pages links to `/games/{id}` and shows the cover (wide cards: `artUrl`, then cover cropped, then missing art), the name, and the `IgdbRatingBadge` when the game is rated. Coming soon cards show the release date as a UTC day (`Nov 6`, or `Nov 6, 2027` when the year is not the current UTC year; a null date cannot occur inside the window); a game with no art and no cover shows the existing missing art state. Every other place that shows a year uses `releaseYear`. Game cards carry no personal status badge and no controls; G8 adds them.
- **AC-9**: Each slug has a public list page at `/games/{slug}`: a back link `← Games` to `/games`, the h1, the one line note, then a `PosterGrid` of up to 24 game cards and `PaginationLinks` (page 1 is the bare path, page N is `?page=N`). Copy, all in the list registry:

  | Slug | `rowTitle` | h1 | Note | `pageNoun` |
  |---|---|---|---|---|
  | `trending` | Trending now | Trending games | The games people are looking at most on IGDB right now. | trending games |
  | `popular` | Popular | Popular games | The games the most IGDB members are playing right now. | popular games |
  | `recently-released` | Recently released | Recently released games | Released in the last 60 days, most anticipated first, per IGDB. | recently released games |
  | `coming-soon` | Coming soon | Games coming soon | Releasing in the next 120 days, most anticipated first, per IGDB. | upcoming games |
  | `top-rated` | Top rated | Top rated games | Ordered by IGDB community rating, among games with at least 100 ratings. | top rated games |

  The sidebar line under Recently released reads `The {n} most anticipated games of the last 60 days.` (`{n}` the rendered count; `game` when 1; no line when 0), written as an explicit `game` branch of `nowBlurb`, never a fall through to the movie text. The back link label is `Games` (`LANDING_LABELS.game`). The `/games` metadata description is `Browse trending, popular, new, upcoming and top rated games on BeStats, and keep track of what you play.`
- **AC-10**: Pagination is truthful. A popularity list shows `Page N of M` with `M = ceil(kept / 24)`. A discover list shows `Page N of M` with `M = min(50, ceil(totalResults / 24))` when IGDB sent a count, and `Page N` with a Next link only when `hasNextPage` when it did not. A page past the last, or a `page` value the existing `parsePageParam` rejects, shows the existing "no such page" panel with the list's `pageNoun`. Page 1 of an empty list shows the empty panel (AC-11), not "no such page". Page 50 has no Next link, whatever the count says.
- **AC-11**: An `IgdbError` in one landing section shows that section's compact error with Try again while every other section renders. On a list page it shows the `StatePanel` `Couldn't reach IGDB` / `IGDB didn't respond. Try again in a moment.` with a `RetryLink` to the current page's URL. An empty list shows the section's existing one line empty state, or on a list page the existing empty panel with `pageNoun`. Any error that is not an `IgdbError` (including `IgdbValidationError`) is rethrown.
- **AC-12**: `proxy.ts` passes `/games/{slug}` for exactly the five slugs, matched case sensitively, before `parseGameId`; `/games/Trending`, `/games/coming_soon` and `/games/1.jpg` keep today's real 404, and `/games/1942` still reaches the game page. `/games` itself is a route.
- **AC-13**: `/games` and every list page set a title (`Games`, or the list's h1), the description (the landing description, or the list's note) and `robots: { index: false }`, with no canonical and no `openGraph` or `twitter` fields of their own (spec 0025, AC-10, carried over). No `/games` URL is in `sitemap.xml`; `app/sitemap.test.ts` asserts it.
- **AC-14**: With `NEXT_PUBLIC_GAMES_LIBRARY` on, the GAMES tab shows on every page. It is lit on `/games` and every `/games/*` path; on `/shows`, `/movies`, the title pages and `/search` it links to `/games`; on the three library pages it switches `type` in place as in G5. With the flag off or unset, no GAMES tab shows anywhere (as today), and `/games` and its list pages still answer by URL.
- **AC-15**: The navbar search is not shown on `/games` or any `/games/*` path, the same rule G5 set for a games library tab (spec 0027, AC-4). The check uses `usePathname` only; `useSearchParams` stays limited to the four typed paths, so `/games` and its list pages keep their prerendered shells. Every other page keeps the search.
- **AC-16**: The logo follows a games page: on `/games`, `/games/*` and a `?type=game` library tab it links to `/games` and remembers `game`. On a page with no type, a remembered `game` sends the logo to `/games` only while the flag is on, and to `/shows` otherwise: the stored value is parsed as `LibraryType` and `game` is accepted only when `gamesLibraryEnabled()` is true, so a stale value never leads to a hidden tab.
- **AC-17**: Each empty games library tab (spec 0027, AC-14) gains a `Browse games` button linking to `/games`, and the game not found panel (spec 0025, AC-7) changes its button to `Browse games`, linking to `/games`.
- **AC-18**: The landing's headings, labels and See all links and each list page's back link, h1 and note are in the prerendered shell. Every IGDB read runs at request time (`await connection()` before it, which is also where `today` is read), so `pnpm build` makes no IGDB request and passes with no `IGDB_*` variables set; the build reports `/games` and the five list pages as partially prerendered.
- **AC-19**: No games page writes anything when it loads, and none reads the session outside the hero's `GameTrackingSlot`, inside its own Suspense boundary. No user data enters a cached scope. The request scope test covers `/games` and one list page.
- **AC-20**: At 375px there is no horizontal page scroll on `/games` or a list page; Tab reaches every card in order; reduced motion gives a static page; no colour literal exists outside `app/globals.css`.
- **AC-21**: `/showcase` shows a game landing card, a wide game card with and without art, and a game list page's error and empty states.

## Decision

**Chosen option**: Option 1: One landing over a widened list registry, with games as a third source behind the same read seam.

The landing sections, the list registry, the list page and the read helpers learn a third media type, `game`, read from IGDB through `lib/igdb/`; `lib/igdb/` gains a popularity read, an art field and a page size.

**Implementation skills**: `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Feature design

**Data model sketch**: no schema change, no migration. The new shapes are in code only:

| Shape | Where | Fields |
|---|---|---|
| `GameSummary.artUrl` | `lib/igdb/types.ts` | `string \| null`, AC-6 |
| `PopularGamesKind` | `lib/igdb/types.ts` | `"trending" \| "popular"` |
| `DiscoverGamesOptions.pageSize` | `lib/igdb/types.ts` | `20 \| 24`, optional, default 20 |
| `GameListSlug` | `lib/catalog/lists.ts` | the five slugs of AC-9 |
| `GameCatalogList` | `lib/catalog/lists.ts` | `ListText & { mediaType: "game"; slug: GameListSlug }`, joining the `CatalogList` union |
| `CATALOG_PATHS.game` | `lib/catalog/media-type.ts` | `"/games"`; the record is keyed by `LibraryType`, `MediaType` stays `"tv" \| "movie"` |
| `TaggedCatalogPage` game branch | `lib/catalog-list-read.ts` | `{ mediaType: "game"; paged: Paged<GameSummary> }` |
| `LandingItem` | `components/catalog/landing/landing-items.ts` | `mediaType: LibraryType`; the TMDB rating becomes `rating: { source: "tmdb" \| "igdb"; value: number \| null }` |
| `LandingSlots` for games | `lib/catalog/landing.ts` | trending, popular, `now` = recently-released, `nowLabel` = `New releases`, `upcoming` = coming-soon, top = top-rated |

**Code touch points** (named so the build does not hunt for them):

- `lib/catalog/lists.ts`: `catalogListsFor` gains a `"game"` overload; its `MediaType` overload never returns game lists, which is what keeps `app/sitemap.ts` (it calls `catalogListsFor("tv")` and `catalogListsFor("movie")`) free of `/games` URLs. `catalogList`, `listPath`, `listPageHref` and `isCatalogListSlug` take `LibraryType`. `app/catalog-lists.test.ts` checks the `app/games/<slug>` folders against the registry.
- `components/catalog/catalog-list-page.tsx`: `LANDING_LABELS` gains `game: "Games"`; the grid renders game cards for the game branch; metadata never reads `?page`. Each `app/games/<slug>/page.tsx` copies its sibling `app/movies/<slug>/page.tsx` pattern exactly.
- `proxy.ts`: `listMediaType` becomes `LibraryType`; the existing `/^\/games\/([^/]+)$/` entry gains `listMediaType: "game"`, and its "no list pages yet" comment goes. The proxy's own local `CATALOG_PATHS` is a different constant from the one in `media-type.ts`. `proxy.test.ts` adds `/games/Trending`, `/games/coming_soon`, `/games/trending.jpg` and `/games/1942`.
- `components/catalog/landing/`: `LandingItem.rating` replaces `tmdbRating` at every use (`landing-badge.tsx`, `landing-hero.tsx`); the badge picks `TmdbRatingBadge` or `IgdbRatingBadge` (both in `components/rating-badges.tsx`) by `rating.source`. A game card's status and controls slot renders nothing, with no Suspense wrapper. The hero's genre lookup gains a game branch over `getGameGenres` and treats an `IgdbError` like a `TmdbError` (genres left out); the hero renders no `TrailerSlot` for a game; it passes `GameTrackingSlot` the props the game page passes, inside a Suspense boundary with the same fallback as the movie hero's tracking slot.
- `components/layout/`: `media-type-tabs.tsx` (a `/games` branch, lit on `/games*`, `/games` as the GAMES href off the library pages) and the mobile menu if it repeats the tabs; `page-media-type.tsx` returns `libraryType: "game"` and `type: null` on `/games*`; `brand-link.tsx` for AC-16; the navbar search slot for AC-15.
- `components/library/library-panels.tsx` (the three empty games tabs) and `app/games/[id]/not-found.tsx` with its test, for AC-17.

Invariant in code: `MediaType` is not widened. `/search`, the TMDB reads, the title pages and `typedHref`'s search overload still cannot receive `game` until G7.

**State transitions**: none.

**API surface** (pages and reads; no Server Action and no Route Handler is added):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/games` | page | none | the landing | public; hero slot reads the session if any | per section `IgdbError` → section Try again |
| `/games/{slug}` (5 static folders) | page | `?page` | list page | public | `IgdbError` → retry panel; bad page → no such page panel |
| `getPopularGames(kind)` | cached read, `lib/igdb/reads.ts` | `kind` | `GameSummary[]` in rank order, visible only | server only | `IgdbError` kinds; bad kind → `IgdbValidationError` |
| `discoverGames(options)` | cached read, existing | adds `pageSize` | `Paged<GameSummary>` | server only | `IgdbValidationError` for a bad `pageSize` |
| `readGameListPage(list, page, today)` | helper, `lib/catalog-list-read.ts` | registry entry, page, UTC day | `TaggedCatalogPage` (game branch) | server only | rethrows `IgdbError` for the caller |
| `gameListOptions(slug, today)` | pure, `lib/catalog/game-lists.ts` | slug, UTC day | the `DiscoverGamesOptions` of AC-2 | none | none (typed slugs only) |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| discover lists | `today` | `new Date()` UTC day, read after `connection()` in the page's read helper; passed down, never read in `lib/igdb/` (spec 0023 rule) |
| discover lists | window ends (`today − 59`, `today + 1`, `today + 120`) | derived from `today` in `gameListOptions` |
| top rated | rating floor 100 | constant in `gameListOptions`, decided here |
| popularity lists | popularity type ids for Visits and Playing | `lib/igdb/constants.ts`, pinned, verified by `pnpm igdb:live` against `popularity_types` |
| popularity lists | rank order | `popularity_primitives.value` desc |
| popularity lists | hidden or missing games | `GameSummary.hidden` and `BatchResult.missingIds` from `getGamesByIds` |
| list page | `Page N of M` | AC-10: kept count, or IGDB `X-Count` (`totalResults`), or `hasNextPage` |
| hero, wide cards | art image | `GameSummary.artUrl`, AC-6 |
| hero | genre names | `GameSummary.genreIds` mapped through `getGameGenres()` |
| hero | release gate, status | `GameTrackingSlot` (spec 0026), from `releaseDate` and the user's row |
| cards | rating | `GameSummary.communityRating`, labelled as community rating |
| cards | Coming soon date | `GameSummary.releaseDate`, printed as a UTC day |
| sidebar line | `{n}` | the rendered Recently released count |
| nav | flag | `gamesLibraryEnabled()` in `lib/env.ts` |
| logo | remembered type | the existing brand link memory, widened to `LibraryType` |

**Key invariants**:

- Every game a list shows passes the catalog filter: discover lists by `CATALOG_RULE` in the query, popularity lists by dropping `hidden` after the batch.
- A landing read and its list page's read are one cache entry (same function, same canonical options).
- `lib/igdb/` never reads the clock for a filter.
- No game URL enters the sitemap before G10, and every games page is `noindex`.
- `MediaType` stays two valued.

**Security model**: every page is public and reads only public IGDB data through the server only module; the Twitch credentials never leave `lib/igdb/env.ts`. The one private surface is the hero's `GameTrackingSlot`, which reads the user's own row under RLS inside its own Suspense boundary, uncached, exactly as on the game page. No new input reaches IGDB except `page` (validated by `parsePageParam`, then by the module) and `kind`, a typed literal. The limiter and the minutes and hours cache lifetimes bound IGDB traffic; the Vercel Firewall rule stays on `/api/search` only, since these pages make only cached reads.

**Configuration required**: none new. `NEXT_PUBLIC_GAMES_LIBRARY` keeps gating the tab, stays unset in Production and `on` in Preview and `.env.local`. It stays until G10, which removes it when games launch (this settles spec 0027's follow-up).

**Critical test scenarios**:

- Happy path: `/games` renders all six parts from fixtures in order, each See all opens its list page with 24 cards and correct pagination, verifies **AC-1**, **AC-3**, **AC-9**, **AC-10**
- Popularity filter: a fixture with hidden and missing ids among the top primitives gives a list with neither, in rank order, with an exact count, verifies **AC-4**
- Date windows: `gameListOptions` for a fixed `today` across a month and year boundary gives the exact UTC days, verifies **AC-2**
- Failure case: one section's IGDB read times out; that section shows Try again and the others render; a list page shows the retry panel, verifies **AC-11**
- Proxy: the five slugs pass, case and spelling variants and image paths 404, a numeric id reaches the game page, verifies **AC-12**
- Auth/permission: a signed out visitor sees the hero with no status control and no session read anywhere else; a signed in user's status shows only in the hero slot and never in a cached entry, verifies **AC-7**, **AC-19**
- SEO: every games page is `noindex` with no canonical, and the sitemap has no `/games` URL, verifies **AC-13**

## Build plan

Tracer Bullet: the first slice is one list, end to end, from IGDB to a live page through the registry, proxy and metadata. Then the module strands, the other lists, the landing, and the navigation thicken it.

1. **Thin thread, one list**: `GameListSlug` and the `top-rated` entry in the registry, `CATALOG_PATHS.game`, `gameListOptions`, `pageSize` on `discoverGames` (validation, `readSummaryPage`, tests), the game branch of `readGameListPage` and the list page, `/games/top-rated` with plain game cards, `noindex` metadata, the proxy slug rule, and the sitemap exclusion test, satisfies **AC-2**, **AC-5**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-18**
2. **Module strands**: `artUrl` (fields, schema, normalize, types), `IGDB_ART_LADDER` and the loader step, `getPopularGames` with its pinned popularity type ids, the batch, the drop and the `hours` cache, plus `igdb.live.ts` checks for the art rungs and the two popularity types, and `surface.test.ts` updated for the new export, satisfies **AC-4**, **AC-6**
3. **The other four lists**: `trending`, `popular`, `recently-released`, `coming-soon` registry entries and route folders, popularity paging, the folder and registry agreement test, satisfies **AC-2**, **AC-4**, **AC-9**, **AC-10**
4. **The landing**: `LandingItem` widened, `landingItems` and `readLandingList` game branches, `landingSlots("game")`, the game `nowBlurb`, the IGDB badge and no status on game cards, Coming soon dates, `app/games/page.tsx` on `CatalogLanding`, the hero's art, genres and `GameTrackingSlot`, and the request scope test for `/games`, satisfies **AC-1**, **AC-3**, **AC-7**, **AC-8**, **AC-11**, **AC-18**, **AC-19**
5. **Navigation**: GAMES on every page and its link targets, search hidden on `/games/*`, the logo's memory widened, Browse games on the empty games tabs and the game not found panel, with the navbar, library nav and brand link tests, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**
6. **Proof**: `/showcase` states, 375px and 1280px passes, keyboard and reduced motion, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm igdb:live`, satisfies **AC-20**, **AC-21**, and confirms **AC-18**

## Consequences

**Positive**:

- `/games` looks and behaves like its two siblings, and any later change to the landing reaches all three.
- G7 and G8 inherit the registry, the `CATALOG_PATHS.game` entry, the page size and the art field instead of reopening them.
- Popularity counts are exact, since the whole visible list is known.

**Negative / tradeoffs**:

- The landing components now branch on three media types; the TMDB only assumptions in `LandingItem` and the list page have to be widened carefully.
- Every summary read carries two more expanded fields, so batch and discover payloads grow, and a popularity list is one 500 id batch, the heaviest single IGDB read in the app (cached for hours).
- Popularity lists stop at about 20 pages (500 primitives less the hidden ones).
- With 24 per page, Coming soon's landing skips items 21 to 24 of page 1 (they show on See all), because each page fills only its own rows.
- Game cards on the landing have no status or controls until G8, unlike show and movie cards.
- Popularity type ids are IGDB facts that can change; the live check is the only guard.

**Neutral**:

- Amends spec 0025, AC-7 (the not found button) and spec 0027, AC-14 (Browse games) and AC-4 (the logo remembers `game`); both specs get an amendment note when this ships.
- `docs/scope/games.md` G6 said "rows of carousels"; the parallax landing replaced the rows on 2026-10-18, and this spec follows it.

## Follow-up

- [ ] G8: give game cards on `/games`, the list pages and the hero row the status badge and controls, with one status read per grid.
- [ ] G9: add the Trailer button to the games hero once the game page has trailers.
- [ ] G10: drop `noindex`, add canonicals, share cards and the sitemap entries for `/games` and its list pages, and remove `NEXT_PUBLIC_GAMES_LIBRARY`.
- [x] Amend spec 0025 (AC-7 button) and spec 0027 (AC-4 logo, AC-14 Browse games) with a pointer to this spec.
- [ ] `lib/igdb/AGENTS.md`: record `getPopularGames`, the art ladder and the `hours` popularity lifetime when this ships (`/sync`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
