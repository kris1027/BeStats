# 0025. Game page (tracer)

**Date**: 2026-10-23
**Status**: In Progress

Scope feature: [G3. Game page (tracer)](../scope/games.md#g3-game-page-tracer) · Beta tier

## Summary

This decides what you see at `/games/{id}`, the first page that shows IGDB data: a hero with the cover, name, full release date, the kind of release, genres, platforms and the IGDB community rating, and nothing else yet. It reuses the movie page's hero and its prerendered shell, so the page frame loads at once and the game streams in from the cached `getGame` read. IGDB covers get their own image loader that picks a sharp size for each screen, behind one loader file that also keeps TMDB's. Until G10 the page is live but kept out of search engines (`noindex`), and nothing links to it, so production never shows half a feature.

## Requirements

**User stories**:
- As a visitor, I want a game's page to show its cover, name, release date, kind of release, genres, platforms and IGDB rating, so that I can tell what the game is.
- As a visitor, I want missing IGDB data to look deliberately absent, so that I can trust what the page does show.
- As a visitor, I want a clear message and a working retry when IGDB is down or busy, so that I am never stuck on a dead page.
- As the engineer building G4 and G9, I want the hero to already have a tracking slot and the page to already stream from one cached read, so that adding the status control and the richer sections means no rework.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A signed out visitor opening `/games/{id}` for a visible game sees the `DetailHero` in its no backdrop layout (`GameHero` passes `backdropUrl={null}` and `tagline={null}`): the cover at the hero size, the game's name as the page's only `h1`, then a meta row, a platforms line and the rating block, in that order. The meta row and the platforms line both go inside `DetailHero`'s `meta` slot, which renders before the rating. No tagline line appears (games have none).
- **AC-2**: The meta row holds, joined by the `MetaLine` separator (moved with `GenreChips` to `components/catalog/detail-hero-meta.tsx`, with `components/movie/movie-hero.tsx` re-exporting both so its importers do not change), the release date as a full English UTC date (`Mar 20, 2020`, through `formatAirDate`) and, only when the game type is `remake`, `remaster`, `expanded_game` or `standalone_expansion`, its label (`Remake`, `Remaster`, `Expanded game`, `Standalone expansion`), followed by the genres as non interactive `GlassPill` chips. A `main_game` or a null type adds no label.
- **AC-3**: The platforms line reads `Platforms: ` followed by every platform name, sorted by name (English, case insensitive), joined by `, `, as one muted text line that wraps. It is plain text, not chips or links.
- **AC-4**: The rating block (`IgdbRatingBlock`, beside `TmdbRatingBlock` in `components/catalog/detail-hero.tsx`) shows `IgdbRatingBadge` (in `components/rating-badges.tsx`: `StarIcon` with the existing `fill-rating-tmdb text-rating-tmdb` amber community token, no new colour token in `globals.css`) with the IGDB rating out of 10 to one decimal place, the word `IGDB`, and the rating count through `formatVoteCount` (`1,234 votes`, `1 vote`). The badge carries the screen reader text `IGDB community rating`, so it is always labelled as the community rating (AGENTS.md, Games). It never reads as a personal score.
- **AC-5**: Every missing value is left out or stated as absent, never invented. No cover: the hero's fallback tile at the same 2:3 footprint with lucide's `Gamepad2Icon` (not the film icon), passed as `DetailHero`'s `fallbackIcon` down to `HeroPoster`. No release date: no date part and no separator. No genres: no chips. No platforms: no platforms line. No rating: `No IGDB rating yet`. A rating with no count: badge and `IGDB` with no count text. The page never shows `TBA`, `0` or today's date for a missing value.
- **AC-6**: A malformed id segment (`0`, `0550`, `+5`, `abc`, `5.0`, a value above 2147483647, or `/games/1.jpg`) gets a real 404 status from `proxy.ts` before any IGDB call, rendered by `app/not-found.tsx`, using the same `parseGameId` the page uses. The proxy entry is `/^\/games\/([^/]+)$/` with `parseGameId` and no `listMediaType`; `/games` and deeper paths match no route and get the plain 404. `parseGameId` is a thin wrapper in `lib/catalog/ids.ts` over the same canonical pattern and maximum as `parseTmdbId`. If the page or `generateMetadata` ever sees a null id, the body calls `notFound()` and the metadata is `Game not found` with `noindex`.
- **AC-7**: A well formed id that IGDB does not know, or a game IGDB returns with `hidden: true`, makes the body call `notFound()`, which renders `app/games/[id]/not-found.tsx` (a soft 404, status 200): the empty `StatePanel` `We couldn't find that game` / `IGDB has no game at this address. It may have been removed, or the link may be wrong.` with a `Go to home` button linking to `/`. Its metadata is the title `Game not found` with `noindex`.
- **AC-8**: When IGDB fails (any `IgdbError` other than not found: timeout, rate limited, upstream, bad response, unauthorized, which includes missing IGDB variables), the page shows the error `StatePanel` `Couldn't reach IGDB` / `IGDB didn't respond. Try again in a moment.` with a `RetryLink` to `/games/{id}`, and the metadata is the title `Game` with `noindex`. Any error that is not an `IgdbError` is rethrown, not shown as this panel; that includes `IgdbValidationError`, which the proxy keeps from ever reaching the page.
- **AC-9**: The page is a static shell: `export default` renders only a Suspense boundary whose fallback is `GameDetailSkeleton` (`components/game/game-detail-skeleton.tsx`): `DetailHeroSkeleton` with its new `backdrop={false}` and `tagline={false}` props (both default `true`, so the movie and show skeletons do not change), plus a `role="status"` screen reader line `Loading game details`, so nothing jumps when the game streams in. `pnpm build` lists `/games/[id]` as partially prerendered and makes no IGDB request. Nothing in the page or its metadata reads a cookie, a header, the session or the visitor's region.
- **AC-10**: Before G10, a found game's metadata is the title `{name} ({year})` (or `{name}` with no year), a description from `truncateAtWord(summary, 160)` when IGDB has a summary, and `robots: { index: false }`, with no canonical, no game share card, no JSON-LD, and no sitemap entry. "No game share card" means the metadata sets no `openGraph` or `twitter` fields of its own, so the page keeps the root layout's site card (`og:image` pointing at `/opengraph-image`, from `app/opengraph-image.tsx`) like every page that sets no `openGraph` of its own (spec 0016, AC-20), when the site URL is set; with no site URL there is no `og:image` at all (spec 0016, AC-3). It never carries the game's cover. The card's `og:title`, `twitter:title`, `og:description` and `twitter:description` are not set by the page: Next fills them from the page's own title (with the ` · BeStats` template suffix) and description, so a game with no summary has no card description. There is no `og:url`, matching no canonical. The same holds for the not found and failed branches. The body and the metadata both branch on the same `loadGame(id)`, so the tab title and the panel never disagree.
- **AC-11**: Cover images load from `images.igdb.com` through `igdbImageLoader`, never through `/_next/image`. The global `loaderFile` becomes `lib/images/loader.ts` (`"use client"`), which sends a URL starting with `${TMDB_IMAGE_BASE}/` to `tmdbImageLoader`, a URL starting with `${IGDB_IMAGE_BASE}/` to `igdbImageLoader` (in `lib/images/igdb-loader.ts`, so `lib/igdb/` keeps its all `server-only` shape and `surface.test.ts` does not change), and returns any other URL, including a local path such as `/tmdb-logo.svg`, unchanged. `next.config.ts` keeps `loader: "custom"`, no `remotePatterns` and an empty `localPatterns`; both loader path assertions in `next.config.test.ts` move to the new file, and the test named for the TMDB loader is reworded.
- **AC-12**: G1 pins covers to `t_cover_big_2x` (528px wide). The ladder is a readonly `{ size, width }[]` constant `IGDB_COVER_LADDER` in `lib/igdb/constants.ts` (a pure file): `t_cover_small` 90, `t_cover_small_2x` 180, `t_cover_big` 264, `t_cover_big_2x` 528. These widths are assumed until the live check confirms them. `igdbImageLoader` first strips a `#same-size` fragment, then accepts only `${IGDB_IMAGE_BASE}/{size}/{image_id}.jpg` where `{size}` is a ladder name; it takes the URL's own rung as the ceiling, picks the smallest rung at least the requested width (the ceiling when none is), and appends `#same-size` when the answer equals the input, like the TMDB loader. Any other URL comes back unchanged. The hero keeps `HeroPoster`'s `sizes`, so on a dense screen it reaches 528. `pnpm igdb:live` fetches each rung for one real cover and checks both the 200 status and the image's real pixel width.
- **AC-13**: Loading, error, not found and missing image states are usable at 375px and 1280px wide: no horizontal scroll, the `h1` wraps, the Retry and Go to home buttons meet the 44px touch target, and focus is visible on them.

## Decision

**Chosen option**: Option 1: Hero only page on the shared `DetailHero`, host dispatching loader, live with `noindex`

`/games/[id]` is a prerendered shell that streams a hero built from the cached `getGame`, reusing `DetailHero`, with IGDB covers served through their own loader behind a host dispatching loader file, reachable in production but kept out of search engines until G10.

**Implementation skills**: `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
None. G3 only reads IGDB through `getGame`; it reads and writes no table, and stores nothing (the no catalog cache rule from spec 0008 holds).

**State transitions**:
The page has four outcomes, decided once per request by `loadGame(id)`: loading (the shell's skeleton) → found (hero), not_found (soft 404, also for `hidden: true`) or failed (retry panel). A malformed id never reaches the page; the proxy answers it.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/games/[id]` | GET page | `id` path segment | the hero, or a not found or retry panel | public, reads no session | 404 from the proxy for a malformed id; soft 404 for unknown or hidden; retry panel for an `IgdbError` |
| `generateMetadata` | page metadata | `id` | title, description, `robots: { index: false }` | public | `Game not found` or `Game`, both `noindex` |
| `loadGame(id)` in `app/games/[id]/load-game.ts` | server only function | `id: number` (already parsed) | `{ kind: "found", game } \| { kind: "not_found" } \| { kind: "failed" }` | none | rethrows anything that is not an `IgdbError` |
| `parseGameId(segment)` in `lib/catalog/ids.ts` | pure function | raw segment | `number \| null` | none | null for any non canonical value |
| `igdbImageLoader({ src, width })` in `lib/images/igdb-loader.ts` | client loader | IGDB cover URL, width | sized IGDB URL | none | returns `src` unchanged when it is not an IGDB cover size path |
| `lib/images/loader.ts` | the global `loaderFile` | `{ src, width, quality }` | the host loader's answer | none | unknown host returns `src` unchanged |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Hero | name (`h1`) | `Game.name` |
| Hero | cover | `Game.coverUrl`, built by G1 at `t_cover_big_2x`; sized by `igdbImageLoader` |
| Hero | release date | `Game.releaseDate` (UTC day) through `formatAirDate` |
| Hero | release kind label | `Game.gameType`, mapped by a page level table (AC-2) |
| Hero | genre chips | `Game.genres[].name`, IGDB's order |
| Hero | platforms line | `Game.platforms[].name`, sorted with `localeCompare(…, "en", { sensitivity: "base" })` |
| Hero | IGDB rating | `Game.communityRating` (already 0 to 10), `toFixed(1)` in the badge |
| Hero | rating count | `Game.communityRatingCount` through `formatVoteCount` |
| Page | not found | `isIgdbNotFound(error)` or `Game.hidden` |
| Page | failed | any other `IgdbError` |
| Metadata | title year | `Game.releaseYear` |
| Metadata | description | `Game.summary` through `truncateAtWord(…, 160)`, omitted when null |
| Proxy | valid id | `parseGameId`, max 2147483647 to match G2's `game_id integer` |
| Loader | rung for a width | `IGDB_COVER_LADDER` in `lib/igdb/constants.ts`, ceiling from the URL size segment |

**Key invariants**:
- The page renders nothing IGDB did not send; missing stays missing (AC-5).
- A hidden game never renders a hero (AC-7).
- The proxy and the page use the same `parseGameId`, so they never disagree about a game URL (AC-6).
- No IGDB image is served through `/_next/image`, and `next.config.ts` never gains a remote pattern (AC-11).
- The IGDB rating is always labelled `IGDB` and never styled as a personal score (AC-4).
- The shell and the metadata read no request state, so the shell stays prerendered and no private data reaches a shared cache (AC-9).
- Until G10 every game page outcome is `noindex` (AC-7, AC-8, AC-10).

**Security model**:
Public and read only. The page reads no cookie, header, session or region, and writes nothing. IGDB credentials stay in `lib/igdb/env.ts`; the page imports only `@/lib/igdb` (the entry point) on the server, and `load-game.ts` starts with `import "server-only"`. The image loader runs in the browser and only reshapes public CDN URLs. `/games/` joins the proxy matcher's image extension exception so `/games/1.jpg` still reaches the malformed id rule, with a case in `proxy.test.ts`. `/games/[id]` is not a private path, so the auth registry does not change.

**Configuration required**:
None new. `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` from G1 must be set wherever the page runs (locally in `.env.local`, and in Vercel before G3 is checked on production; G10 records them in `docs/deploy.md`).

**Critical test scenarios**:
- Happy path: a fixture game with every field renders the cover, name, `Mar 20, 2020 · Remake`, genre chips, a sorted platforms line and the IGDB rating block, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**
- Missing data: a game with no cover, date, genres, platforms or rating renders the controller fallback, no meta parts, no platforms line and `No IGDB rating yet`, verifies **AC-5**
- Not found and hidden: a 404 from IGDB and a `hidden: true` game both render the soft 404 with `noindex`, verifies **AC-7**
- Failure: a `rate_limited` and an `upstream` `IgdbError` render the retry panel; a `TypeError` is rethrown, verifies **AC-8**
- Proxy: each malformed id in AC-6 answers 404 with no IGDB call; `/games/1942` passes, verifies **AC-6**
- Loader: widths 50, 200, 264, 480 and 1000 map to the expected rungs and the ceiling holds; a TMDB URL still goes to the TMDB loader; an unknown host comes back unchanged, verifies **AC-11**, **AC-12**
- Build: `/games/[id]` is partially prerendered with no IGDB call at build time, verifies **AC-9**

## Build plan

Ordered as a Tracer Bullet: the first task alone puts a real IGDB game on a real page end to end, and each later task thickens one strand.

1. Thin thread: `parseGameId` in `lib/catalog/ids.ts` (shares the canonical id rule), `app/games/[id]/load-game.ts`, and `app/games/[id]/page.tsx` as a Suspense shell streaming a `GameHero` (`components/game/game-hero.tsx`) over `DetailHero` with the name, cover and release date, checked in the running app against a real IGDB id, satisfies **AC-1**, **AC-9**
2. `DetailHero`: `rating: ReactNode` replaces `tmdbRating` and `tmdbVoteCount`, and `fallbackIcon` is threaded into `HeroPoster` (default the film icon); the movie and show heroes pass `<TmdbRatingBlock>`, with their tests unchanged in behaviour. Add `IgdbRatingBlock` beside `TmdbRatingBlock` and `IgdbRatingBadge` beside `TmdbRatingBadge`, satisfies **AC-4**, **AC-5**
3. Fill the hero: move `MetaLine` and `GenreChips` to `components/catalog/detail-hero-meta.tsx` (re-exported from `movie-hero.tsx`); the release kind label table in `components/game/game-hero.tsx` (`other` and null map to no label); genre chips, the sorted platforms line, every missing value rule and `Gamepad2Icon`, with `game-hero.test.tsx`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**
4. Outcomes: `app/games/[id]/not-found.tsx` (Go to home), the retry panel, hidden as not found, `generateMetadata` with `noindex` on every branch, and `load-game.test.ts` plus `page.test.ts`, satisfies **AC-7**, **AC-8**, **AC-10**
5. Proxy: add `/^\/games\/([^/]+)$/` to `CATALOG_PATHS` with `parseGameId` and no `listMediaType`; change the matcher's image extension exception to `(?!movies/|shows/|games/)` and update the comment above it; add the AC-6 cases (including `/games/1.jpg` in the matcher block) to `proxy.test.ts`, and `parseGameId` cases to the ids test, satisfies **AC-6**
6. Images: set `IGDB_COVER_SIZE` to `t_cover_big_2x`, update its JSDoc and the `coverUrl` JSDoc in `normalize.ts`, and add `IGDB_COVER_LADDER` in `lib/igdb/constants.ts`; update every test and fixture that asserts `t_cover_big` (`normalize.test.ts`, `games.test.ts`, the fixtures under `lib/igdb/__fixtures__/`); write `lib/images/igdb-loader.ts` and `lib/images/loader.ts` with tests (TMDB, IGDB, local path, unknown host, a `#same-size` input); point `loaderFile` at `lib/images/loader.ts` and update both assertions in `next.config.test.ts`; extend `igdb.live.ts` to fetch each rung and check its status and pixel width, then run `pnpm igdb:live`, satisfies **AC-11**, **AC-12**
7. States and checks: `DetailHeroSkeleton` gains `backdrop` and `tagline` props, and `GameDetailSkeleton` uses both turned off with its status line; run `pnpm dev` once so the `PageProps<"/games/[id]">` types exist before `pnpm typecheck`; check loading, error, not found and missing image at 375px and 1280px in the running app; run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`, and confirm `/games/[id]` is partially prerendered, satisfies **AC-9**, **AC-13**
8. Docs: note `/games/{id}` in the root `AGENTS.md` proxy and image facts (left to `/sync`), and a line in `lib/igdb/AGENTS.md` for the 2x ceiling and the ladder, satisfies **AC-11**, **AC-12**

## Consequences

**Positive**:
- The first IGDB data reaches a shipped page with every safety net the movie page has.
- `DetailHero` no longer assumes TMDB, so later game surfaces reuse it as is.
- Every future IGDB image is sized correctly without anyone remembering a wrapper.

**Negative / tradeoffs**:
- `DetailHero`'s props change, touching the movie and show heroes and their tests.
- Raising the pinned cover to 528px means any place that skips the loader (none today) would load the bigger file.
- Game pages are reachable in production before G5 for anyone who guesses a URL; they are `noindex` and unlinked, which is accepted.
- No backdrop: the hero looks plainer than a movie's until a later spec adds artwork.
- A game IGDB later hides becomes a not found page even for a user who has it in a list; removal happens from the library card.

**Neutral**:
- The global `loaderFile` path moves from `lib/tmdb/image-loader.ts` to `lib/images/loader.ts`; `tmdbImageLoader` itself is unchanged.
- The `/games` index still 404s until G6.
- IGDB metadata is English only (G1 known gap), so no original language note is needed.

## Follow-up

- [ ] G6: point the not found panel's button at `/games` once the games landing exists.
- [ ] G10: switch `generateMetadata` to `catalogMetadata` (canonical, share card), add `VideoGame` JSON-LD and the sitemap entry, and drop `noindex` for found games.
- [ ] G9 (or a later spec): decide whether the hero gets an IGDB artwork backdrop.
- [ ] `/sync`: `lib/seo/AGENTS.md` says not found and failed branches carry "no Open Graph"; reword it to "set no `openGraph` of their own, so the root site card still applies" (spec 0016, AC-20; AC-10 here).
- [ ] Set `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in Vercel before checking G3 on production.
