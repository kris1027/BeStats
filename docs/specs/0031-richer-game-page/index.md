# 0031. Richer game page

**Date**: 2026-10-26
**Status**: Accepted

Scope feature: [G9. Richer game page](../../scope/games.md#g9-richer-game-page) · Beta tier

## Summary

This spec fills out `/games/{id}` below the hero, the way movie pages are filled out. The hero gets the game's art as a backdrop and a Trailer button. Under it come an Overview (summary, story, who made it and who published it), a row of screenshots you can open larger, More like this, and Facts. All of it except similar games comes from the same cached `getGame` request the hero already waits on, so the page still makes one IGDB call. Similar games need their covers and ratings, so they take one more cached batch read in their own loading boundary. Whatever IGDB does not have is left out, never filled in.

## Requirements

**User stories**:
- As a visitor, I want a game page that tells me what the game is about, who made it, and what it looks like, so I can decide whether I want to play it.
- As a visitor, I want to watch the trailer and look through screenshots without leaving the page.
- As a visitor, I want to see similar games and add them to Want to play straight from their cards.
- As a visitor, I want plain facts (modes, perspectives, franchise, release dates per platform) without guessed or invented values.

**Acceptance criteria** (the contract):

- **AC-1**: A found game's page renders, in this order: the hero, `Overview`, `Screenshots`, `More like this`, `Facts`. Each section is left out when IGDB has nothing for it (AC-5, AC-6, AC-8, AC-9). The one exception is More like this, which still shows its heading and an error line when its batch read fails (AC-8). A game with none of the new data renders the hero alone, as it does today.
- **AC-2**: Everything except the similar games' cards comes from the single `getGame` request (one IGDB call, cached `hours`, as now). `IGDB_GAME_FIELDS` gains: `storyline`, `artworks.image_id`, `screenshots.image_id`, `videos.id`, `videos.name`, `videos.video_id`, `similar_games`, `involved_companies.company.id`, `involved_companies.company.name`, `involved_companies.developer`, `involved_companies.publisher`, `game_modes.name`, `player_perspectives.name`, `franchise.name`, `franchises.name`, `collections.name`, `game_engines.name`, `release_dates.date`, `release_dates.date_format`, `release_dates.platform.id`, `release_dates.platform.name`. Every new nested list is parsed loosely (`looseArray`), and each entry is checked on its own in `normalize.ts` the way `refs()` does, so one odd entry is dropped instead of failing `getGame`. Nothing is written to Postgres (no catalog cache, spec 0008).
- **AC-3**: The hero shows a backdrop from `Game.artUrl`, the same rule as spec 0028 AC-6: the artwork with the lowest `image_id`, else the screenshot with the lowest, built at `t_1080p` and sized down `IGDB_ART_LADDER` by the image loader. With neither, the hero keeps the no backdrop layout of spec 0025. `tagline` stays `null`.
- **AC-4**: The hero's `actions` slot shows the existing `TrailerButton` (the `youtube-nocookie.com` dialog whose iframe exists only while open) when the game has a trailer. The trailer is the video with the lowest `id` (IGDB promises no array order) among the videos whose `name` contains `trailer` and does not contain `gameplay`, both in any case, and whose `video_id` matches `^[A-Za-z0-9_-]{6,20}$`. With no such video (gameplay videos only, a "Gameplay Trailer", or none), there is no button. The dialog is labelled `{name} trailer`, and the iframe title uses the video's IGDB name.
- **AC-5**: `Overview` (an `h2`) holds, in order: the summary as a paragraph; when IGDB also has a storyline, an `h3` `Story` and the storyline paragraph; then the company lines `Developed by` and `Published by` (the `CrewLines` look from the movie page). The `h2` uses `SECTION_HEADING_CLASS`, and the text reuses the movie overview's classes (`max-w-[65ch]`, `text-base leading-relaxed text-text-secondary`). Both paragraphs keep IGDB's line breaks (`whitespace-pre-line`). Company names follow IGDB's `involved_companies` order. Within each line they are deduplicated by `company.id`, falling back to the name ignoring case, and an entry with no name is dropped. A company flagged as both developer and publisher appears in both lines. A missing part is left out: there is no "No overview available" text. The section is left out only when the game has no summary, no storyline, no developer, and no publisher.
- **AC-6**: `Screenshots` (an `h2`) is a `CarouselScroller` row of up to 12 screenshots. They are deduplicated by `image_id`, then ordered by `image_id` ascending, then capped. That order is stable but not hand picked, so the first thumbnail is not IGDB's featured shot; it matches `artUrl`'s rule. Each is a 16:9 thumbnail (`object-cover`, `fill`) in a fixed width wrapper (`w-64 sm:w-72 aspect-video`, `sizes="(min-width: 640px) 288px, 256px"`), loaded lazily through the IGDB loader. Each thumbnail is a button with the accessible name `Open screenshot {n} of {total}` and an image with `alt=""`. With no screenshots, the section is left out.
- **AC-7**: Activating a thumbnail opens a screenshot dialog on that image. It is full screen below `md` and a panel from `md`, the same frame as the trailer dialog. It shows the dialog title `{name} screenshots`, the image (`object-contain`, at most the viewport), the position `{n} of {total}` (announced politely), Previous and Next buttons (44px targets, `disabled` at the first and last image, no wraparound), and the Close button. ArrowLeft and ArrowRight move between images and Escape closes. Focus starts on Close. On close, focus returns to the thumbnail of the image showing at that moment, scrolled into view (`scrollIntoView({ inline: "nearest", block: "nearest" })`). The dialog is controlled (`open` and `currentIndex` state), with `finalFocus` pointing at that thumbnail's ref, because one dialog serves 12 triggers. The arrow keys are handled on the popup. The image is one `next/image` with `fill`, `key={index}` and `sizes="(min-width: 768px) min(90vw, 1100px), 100vw"`, inside a `relative aspect-video` box capped at `max-h-[calc(100dvh-8rem)]`. Only the image on screen is requested, with no preloading of the images next to it.
- **AC-8**: `More like this` sits in its own Suspense boundary, with the `CarouselRowSkeleton` in the section frame as its fallback. Its ids are `Game.similarGameIds`: IGDB's `similar_games` in order, deduplicated, without the game's own id. It makes one `getGamesByIds` call with all of them (well under the 500 limit). Because `found` comes back in no promised order, the content maps `found` by id and walks `similarGameIds` in order. It drops missing and `hidden` games first, then keeps the first 12, so a hidden game never costs a slot. These become home row cards. These are `GameListCard`s through `CatalogListCards`, given `{ mediaType: "game", paged: { page: 1, results, hasNextPage: false, totalResults: results.length } }` with `eagerCount={0}`, `limit={ROW_SIZE}`, `sizes={ROW_POSTER_SIZES}`, `itemClassName={ROW_ITEM_CLASS}` and no `releaseDay` (the G8 controls still show their own release pill). They carry the G8 badge, bookmark and chip slots and `returnPath` set to the game's page. There is no See all. With no ids, or none left after dropping, the section is left out. On an `IgdbError`, the heading stays and the line `Couldn't load similar games from IGDB.` shows with a Retry link to the game page. Any other error is rethrown.
- **AC-9**: `Facts` uses the shared `FactsPanel`. Each entry appears only when it has a value, in this order:
  - `Game modes`, `Player perspectives`, `Themes`: names joined with `, ` in IGDB's order.
  - `Franchise`: the main `franchise` first, then the other `franchises`, deduplicated. The label becomes `Franchises` when there is more than one.
  - `Series`: from `collections`.
  - `Game engine`: the label becomes `Game engines` when there is more than one.
  - `Release dates` (AC-10).

  With none of these, the panel is left out.
- **AC-10**: `Release dates` lists one line per platform, `{platform}: {date}`, as a plain `<ul className="flex flex-col gap-1">` with no cap.
  - Entries are grouped by `platform.id`. An entry with no platform, or with a platform that has no name, is skipped.
  - An entry whose `date_format` is TBD counts as undated, even when IGDB sends a placeholder `date`. Any other entry with no `date` is skipped. An entry whose `date_format` is missing or not in `IGDB_DATE_FORMAT` is skipped, never read as a full day.
  - Each platform shows its dated entry with the lowest timestamp, across all regions, at the precision IGDB states: day `Mar 20, 2020`, month `Mar 2020`, quarter `Q1 2027`, year `2027`.
  - A platform with TBD entries and no dated one reads `TBA`, because IGDB itself says TBD. A platform with no usable entry gets no line (the hero's platforms line still names it).
  - Lines are sorted by timestamp ascending, with `TBA` last, and ties broken by platform name (English, case insensitive).
  - The year and month come from the UTC timestamp, and the quarter from `date_format`.
- **AC-11**: Nothing is invented. Every empty list or blank value is left out. No section shows `Unknown`, `0`, `TBA` (except AC-10's IGDB stated TBD), or today's date. A hidden game still never reaches these sections (spec 0025, AC-7).
- **AC-12**: The shell stays prerendered. `pnpm build` lists `/games/[id]` as partially prerendered and makes no IGDB call. `GameDetailSkeleton` becomes `DetailHeroSkeleton` with the backdrop on and the tagline off, plus `OverviewSkeleton` and its `role="status"` line. Nothing new reads a cookie, header, session or region outside the existing card and tracking slots. `generateMetadata` is unchanged: `noindex` until G10.
- **AC-13**: The backdrop, thumbnails and dialog image all load from `images.igdb.com` through `lib/images/loader.ts` and `IGDB_ART_LADDER`, never through `/_next/image`. No `remotePatterns` and no new image host are added.
- **AC-14**: `pnpm igdb:live` checks the new fields against a real game: each field in AC-2 parses, `involved_companies` carries the `developer` and `publisher` booleans, `videos.video_id` matches the YouTube id pattern, the pinned `date_format` ids (0 day, 1 month, 2 year, 3 to 6 Q1 to Q4, 7 TBD) match IGDB's `date_formats` endpoint, and on a game with a quarter entry, its UTC timestamp falls inside the stated quarter and year.
- **AC-15**: Every new section and the dialog hold at 375px and 1280px wide: no horizontal page scroll, 44px touch targets, visible focus, and a dialog you can use with the keyboard alone.
- **AC-16**: `/showcase` shows the screenshot row and dialog, the Overview with and without a storyline, and a Facts panel with a TBA and a quarter release date.

## Decision

**Chosen option**: Option 1: widen `getGame`, and read similar game cards through one cached batch.

One IGDB request feeds the hero and every new section except More like this. That section streams in its own boundary from `getGamesByIds`, reusing the G8 cards. The Trailer button joins the hero, as on movie and show pages.

**Implementation skills**: `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change. The `Game` type (in `lib/igdb/types.ts`) gains these fields. Every list is `[]` when IGDB has none, and every text is `null`.

| Field | Type | From |
|---|---|---|
| `storyline` | `string \| null` | `storyline` |
| `artUrl` | `string \| null` | `artUrl(record)` (existing function) |
| `screenshotUrls` | `string[]` (at most 12, `t_1080p`) | `screenshots`, `image_id` ascending |
| `trailer` | `GameVideo \| null`, `{ key: string; name: string }` | `videos` (AC-4) |
| `similarGameIds` | `number[]` | `similar_games` (AC-8) |
| `developers` | `string[]` | `involved_companies` with `developer: true` |
| `publishers` | `string[]` | `involved_companies` with `publisher: true` |
| `gameModes`, `playerPerspectives`, `series`, `gameEngines` | `GameRef[]` | `game_modes`, `player_perspectives`, `collections`, `game_engines` |
| `franchises` | `GameRef[]` | `franchise` then `franchises`, deduplicated by id |
| `platformReleases` | `PlatformRelease[]`, already sorted (AC-10) | `release_dates` |

`PlatformRelease` is `{ platform: string; release: GameReleaseDate }`, and `GameReleaseDate` is one of:
- `{ precision: "day" | "month" | "year"; date: string }` (a `YYYY-MM-DD` UTC day)
- `{ precision: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }`
- `{ precision: "tba" }`

The `date_format` ids are pinned in `constants.ts` as `IGDB_DATE_FORMAT` (0 day, 1 month, 2 year, 3 to 6 Q1 to Q4, 7 TBD) and parsed with `optionalId`, so a bare id or an expanded `{ id }` both read. A null or unknown id drops the entry (AC-10). The live check confirms the ids. `similarGameIds` goes through the existing `ids()`, is deduplicated, and loses the game's own id. `artUrl` is computed from the full artwork and screenshot lists, never the capped 12. `imageListSchema` is exported from `schemas.ts` for `gameDetailSchema`.

`formatGameReleaseDate` builds its text from fixed English month names and the UTC parts of the `YYYY-MM-DD` string, with no `Intl`, so CI (Node 22) and local (Node 24) print the same thing.

**State transitions**: none new. The page keeps its four outcomes (spec 0025). More like this has its own: loading → cards | left out | error line.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `getGame(id)` (widened) | cached read, `hours` | id | `Game` with the fields above | none | unchanged |
| `getGamesByIds(ids)` | existing cached read, `hours` | `similarGameIds` | `BatchResult<GameSummary>` | none | `IgdbError` → error line |
| `GameHero` | server component | `"artUrl"` and `"trailer"` added to its `Pick<Game, …>` | `backdropUrl={artUrl}`, and `actions={<TrailerButton videoKey={trailer.key} videoName={trailer.name} title={name} />}` when `trailer` is set | none | none |
| `GameOverview` (`components/game/game-overview.tsx`) | server component | `summary`, `storyline`, `developers`, `publishers` | the section, or null | none | none |
| `ScreenshotGallery` (`components/game/screenshot-gallery.tsx`) | client component | `name`, `screenshotUrls` | the row and the dialog | none | none |
| `GameMoreLikeThisSection` and `GameMoreLikeThisContent` (`components/game/game-more-like-this.tsx`) | async server component in Suspense | `gameId`, `similarGameIds` | the row, nothing, or the error line | the G8 card slots read the session in their own boundaries | catches `IgdbError` (from `@/lib/igdb`) only; rethrows anything else, `IgdbValidationError` included |
| `GameFacts` (`components/game/game-facts.tsx`) | server component | `Game` | `FactsPanel`, with `Fact \| null` entries built through `textFact`, and the release lines as a `<ul>` value (`textFact` exported from `title-details.tsx`) | none | none |
| `formatGameReleaseDate(release)` (`lib/format.ts`) | pure | `GameReleaseDate` | `Mar 20, 2020`, `Mar 2020`, `Q1 2027`, `2027`, `TBA` | none | none |
| `SectionErrorLine` | existing | adds `source?: "TMDB" \| "IGDB"` (default `TMDB`) | `Couldn't load {what} from {source}.` | none | none |
| `MoreLikeThisFrame`, `CrewLines` | existing, now exported | unchanged | unchanged | none | none |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Hero | backdrop | `Game.artUrl` → `IGDB_ART_LADDER` in the loader |
| Hero | Trailer button key and name | `Game.trailer`, picked in `normalize.ts` (AC-4) |
| Hero | trailer dialog title | `Game.name` |
| Overview | summary, storyline | `Game.summary`, `Game.storyline` |
| Overview | Developed by, Published by | `Game.developers`, `Game.publishers` |
| Screenshots | images, `{n}`, `{total}` | `Game.screenshotUrls`, the index, `.length` |
| Screenshot dialog | title | `Game.name` |
| More like this | ids, order | `Game.similarGameIds` |
| More like this | cards, badge, bookmark | `getGamesByIds` → `GameSummary`; G8 slots (`getGameGridStates`) |
| More like this | Retry href | `gameHref(id)` |
| Facts | each list | the matching `Game` field |
| Facts | release lines | `Game.platformReleases` → `formatGameReleaseDate` |
| Facts | quarter | `date_format` id via `IGDB_DATE_FORMAT` |
| Facts | label plural | the list length |

**Key invariants**:
- One IGDB request per game page render for everything but the similar cards, and both reads are cached (AC-2, AC-8).
- No section renders a value IGDB did not send (AC-11).
- The YouTube iframe and every screenshot beyond the one on screen load only after a click (AC-4, AC-7).
- Similar cards never show a hidden game (AC-8).
- The page shell reads no request state (AC-12).

**Security model**: public and read only. No new credentials or hosts. YouTube is already a listed processor, and the privacy text already says a trailer loads only after you press Trailer, so it covers game pages with no change. `video_id` is validated before it reaches the embed path. The similar cards read the session only inside the G8 slots, which are already private and never cached in shared caches.

**Configuration required**: none new.

**Critical test scenarios**:
- `normalize.test.ts`: a full fixture yields every new field. The trailer pick skips a gameplay video and a bad id. The franchise dedupe works. Release dates pick the earliest per platform. A TBD entry with a placeholder date reads TBA, an entry with an unknown `date_format` or no platform is skipped, quarter is kept, and TBA sorts last. Companies are deduplicated by id. Screenshots are deduplicated before the cap. Verifies **AC-2**, **AC-4**, **AC-9**, **AC-10**
- Empty fixture: every list is `[]` and every text is `null`. The page renders the hero only. Verifies **AC-1**, **AC-11**
- `game-overview.test.tsx`: summary only, storyline only, companies only, a company in both lines, nothing at all. Verifies **AC-5**
- `screenshot-gallery.test.tsx`: open on the third image, Next and Previous, disabled at the ends, the arrow keys, Escape, focus returns to the right thumbnail, and only one dialog image is in the DOM. Verifies **AC-6**, **AC-7**
- `game-more-like-this.test.tsx`: IGDB order is kept even though the batch returns shuffled results, hidden and missing games are dropped, 12 is the cap, all hidden leaves the section out, `IgdbError` shows the error line, and a `TypeError` is rethrown. Verifies **AC-8**
- `format.test.ts`: each precision formats correctly. Verifies **AC-10**
- Build: `/games/[id]` is still partially prerendered. Verifies **AC-12**
- Live: `pnpm igdb:live` passes the new field and `date_format` checks. Verifies **AC-14**

## Build plan

The build is ordered as a Tracer Bullet. The first task alone puts real new IGDB data on the real page from one end to the other, and each later task thickens one strand.

1. [x] Thin thread: add `artworks.image_id` and `screenshots.image_id` to `IGDB_GAME_FIELDS`, `gameDetailSchema`, `Game` and `normalizeGame` (`artUrl`, `screenshotUrls`). Pass `backdropUrl` through `GameHero` and render a `Screenshots` row of plain, non interactive images on the page (no dead buttons before step 2). Check it in the running app against a real id, satisfies **AC-1**, **AC-3**, **AC-6**, **AC-13**
2. [x] The screenshot dialog: `ScreenshotGallery` with the thumbnail buttons, the dialog, position text, Previous and Next, arrow keys and focus return, with tests, satisfies **AC-7**, **AC-15**
3. [x] Overview: add `storyline` and the `involved_companies` fields, plus `developers` and `publishers` in normalize. Export `CrewLines`. Write `GameOverview` with tests, satisfies **AC-2**, **AC-5**, **AC-11**
4. [x] Trailer: add the `videos` fields, the trailer pick, and the id check in normalize. `GameHero` passes `actions={<TrailerButton …/>}`, satisfies **AC-4**
5. [x] More like this: add `similar_games` and `similarGameIds`. Export `MoreLikeThisFrame`. Add `source` to `SectionErrorLine`. Write `GameMoreLikeThisSection` through `CatalogListCards` with a game `TaggedCatalogPage`, with tests, satisfies **AC-8**
6. [x] Facts lists: add the modes, perspectives, franchise(s), collections and engines fields and normalization, then `GameFacts` with the label plural rule, satisfies **AC-9**, **AC-11**
7. [x] Release dates: pin `IGDB_DATE_FORMAT` in `constants.ts`, add the `release_dates` fields, `platformReleases` in normalize, and `formatGameReleaseDate` in `lib/format.ts`, with tests. Extend `igdb.live.ts` for every new field and the `date_format` ids, then run `pnpm igdb:live`, satisfies **AC-10**, **AC-14**
8. [x] Types and fixtures: export `GameVideo`, `PlatformRelease` and `GameReleaseDate` from `index.ts` and update `surface.test.ts`. Capture a fresh full `getGame` fixture and update `games.test.ts` and `normalize.test.ts`, satisfies **AC-2**
9. [x] States and checks: update `GameDetailSkeleton` (`DetailHeroSkeleton` with its existing `backdrop` prop on and `tagline={false}`, plus `OverviewSkeleton`; no skeleton component changes). Check every section at 375px and 1280px in the running app, including a game with no new data. Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`, and confirm `/games/[id]` is partially prerendered, satisfies **AC-12**, **AC-15**
10. [x] Showcase: add the screenshot gallery, the Overview variants, and a Facts panel with TBA and quarter dates, satisfies **AC-16**

## Consequences

**Positive**:
- Game pages reach parity with movie pages while still making one IGDB call per game.
- The backdrop closes the deferred item from spec 0025.
- Similar cards inherit G8's personal state and Want to play bookmark for free.

**Negative / tradeoffs**:
- The `getGame` response grows several times over (nested companies, release dates, videos). The hero now waits on a bigger payload, which is softened by the `hours` cache.
- A failure in `getGame` takes every section down together. Only More like this fails on its own.
- Comparing partial dates for "earliest" uses IGDB's timestamp for the period, so a `Q1 2027` entry can sort before a precise date in the same quarter. This is accepted.
- The skeleton assumes a backdrop, so a game with no art shifts up slightly when it streams in. This is the same tradeoff movies accept.
- Screenshots and the backdrop can show the same image when a game has no artwork.

**Neutral**:
- The `Game` type gains about a dozen fields, so every fixture that builds a `Game` needs the new empty defaults.
- `SectionErrorLine` gains a `source` prop, with TMDB callers unchanged.
- No privacy or legal change: `images.igdb.com` and YouTube are already disclosed.

## Follow-up

- [ ] `/scope`: G9's row says "screenshots, trailer, similar games". Note that the trailer is a hero button, and that the backdrop deferred item is now resolved by this spec.
- [ ] `/sync`: `lib/igdb/AGENTS.md`, the "Adding a field" convention and the `IGDB_DATE_FORMAT` pin. In the root `AGENTS.md`, the game page facts.
- [ ] G10: `VideoGame` JSON-LD can use the new developer, publisher, screenshot and trailer fields.
