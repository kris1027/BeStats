# 0032. Games launch

**Date**: 2026-10-26
**Status**: In Progress
**Amended**: 2026-10-26. AC-2 no longer says "no Open Graph or X fields". These pages keep the root layout's default site card (its `og:title`, `og:image` and X fields), as `/movies/{id}` does; what they never carry is anything game specific. Found by `/check verify`.

Scope feature: [G10. Games launch](../../scope/games.md#g10-games-launch--in-progress--ga) · GA tier

## Summary

This spec opens games to everyone: search engines, link previews and production visitors. Game pages, the `/games` landing and its five list pages lose their `noindex`, get canonicals and share cards, and join the sitemap. Game pages also get `VideoGame` structured data (JSON-LD, the machine readable block search engines read). The footer and `/terms` credit IGDB next to TMDB. The `NEXT_PUBLIC_GAMES_LIBRARY` flag is deleted, so games are simply always on. Before the deploy, you read IGDB's current terms yourself, because the automated fetch was blocked. Nothing is stored and no schema changes.

## Requirements

**User stories**:
- As a visitor searching the web for a game, I want BeStats game pages to show up with a proper title, description and preview image, so I can open the one I want.
- As a visitor on production, I want the GAMES tab and the games library tabs, so I can browse and track games like shows and movies.
- As the operator, I want IGDB credited the way its terms ask, recorded with the date I checked, so the launch stays within IGDB's free, non commercial terms.

**Acceptance criteria** (the contract):

- **AC-1**: A found, visible game's page (`/games/{id}`) has no `robots` noindex and builds its metadata through `catalogMetadata()`: the existing title (`{name} ({year})` or `{name}`) and description (summary cut at 160 characters by `truncateAtWord`, left out without a summary), the canonical `absoluteUrl("/games/{id}")`, `og:type` `website`, and a share image chosen in this order: `artUrl`, then `screenshotUrls[0]`, then `coverUrl`, then the site card (`shareMetadata`'s fallback). Without a site URL, the canonical, `og:url` and the site card fallback are left out, never relative (`lib/seo/AGENTS.md`).
- **AC-2**: A malformed id, an unknown game, a `hidden` game (the soft 404 of spec 0025, AC-7) and a failed IGDB read keep their current metadata: `noindex`, no canonical, no `og:url`, and no JSON-LD. They may keep the root layout's default site card, but never a game's title, description, cover or URL in any Open Graph or X field.
- **AC-3**: The found branch of a game page, and only it, renders `<JsonLd data={gameJsonLd(game)} />`. `gameJsonLd()` lives in `lib/seo/json-ld.ts`, takes the structural `GameJsonLdInput` (`id`, `name`, `coverUrl`, `releaseDate`, `summary`, `genres: { name }[]`, `platforms: { name }[]`, `developers: string[]`, `publishers: string[]`), drops any blank company name, and returns a schema.org `VideoGame` with `name`, `url` (`absoluteUrl("/games/{id}")`), `image` (`coverUrl`), `datePublished` (`releaseDate`), `description` (`summary`), `genre` (genre names), `gamePlatform` (platform names), `author` (each of `developers` as `{ "@type": "Organization", name }`) and `publisher` (each of `publishers`, the same shape). `withoutEmpty` drops any null, empty or zero field. No rating of any kind is emitted, community or personal. It is serialized only through `jsonLdScript()`.
- **AC-4**: `/games` has the canonical `absoluteUrl("/games")` and the site card, and no `noindex`. `gamesMetadata({ title, description })` keeps its signature, now returns `landingMetadata({ title, description, path: "/games" })`, and is used only by `app/games/page.tsx`. Its title and description stay as they are. `gameListMetadata` and its tests are deleted.
- **AC-5**: Each of the five games list pages (`trending`, `popular`, `recently-released`, `coming-soon`, `top-rated`) replaces its static `metadata` with `generateMetadata` calling `catalogListMetadata(list, searchParams)`, widened to take any `CatalogList` and reading the same `readTaggedCatalogGridPage(list, page)` call the page body makes (one shared cache entry, no extra IGDB request). `landingPageMetadata`'s `discover` callback changes from `{ totalPages }` to `{ hasResults: boolean; lastPage: number | null }`. Page N is indexed with the canonical `listPageHref(list, N)` when `hasResults` is true and either `lastPage` is null or N is at most `lastPage`. For a TMDB list `lastPage` is always its `totalPages` and `hasResults` is `page <= totalPages`, so TMDB lists behave exactly as today (their tests stay green unchanged). A games discover list with no IGDB count is therefore indexed on any page that shows games, up to IGDB's page 50 (past it the read answers empty). An invalid `?page`, an empty page, a page past the last, or an `IgdbError` or `TmdbError` is `noindex` with no canonical. Any other error, `IgdbValidationError` included, is rethrown, the existing TMDB rule. `app/catalog-lists.test.ts` expects `catalogListMetadata(` on the game list pages too.
- **AC-6**: On an indexable deployment, `sitemap.xml` lists, in this order: `/movies`, `/shows`, `/games`; the movie list pages, the show list pages, then the five games list pages, each at page 1 in registry row order; `/privacy`, `/terms`; then every movie, every show, then every game. `sitemapEntries` gains a fifth argument, `gameIds: number[]`. The games are the first `GAME_SITEMAP_LIMIT` (200, exported from `lib/seo/sitemap.ts`) ids of `getPopularGames(POPULAR_GAME_LISTS.popular)`, the exact call `/games/popular` makes, deduplicated in rank order. That read returns visible games only, so no hidden game is listed. It joins the same `Promise.allSettled` as the 20 TMDB reads inside the existing cached scope, so it adds no wait. Every entry is absolute. A deployment that is not indexable still answers an empty `urlset` and asks neither TMDB nor IGDB anything. `app/sitemap.test.ts` replaces "lists no games URL before G10" with the new order, and `lib/seo/sitemap.test.ts` covers the new argument.
- **AC-7**: When the Popular read throws an `IgdbError` (any kind, including `unauthorized` for missing credentials) while the sitemap is built, only the game ids drop: the landings, every list page (games included), the legal pages, the movies and the shows stay, and the file's `cacheLife` is `minutes` instead of `days`, the same rule a TMDB failure follows. `getPopularGames` rethrows a rebuilt `IgdbError` outside its own cached scope, so `instanceof` holds inside the sitemap's scope. A rejection that is neither an `IgdbError` nor a `TmdbError`, an `IgdbValidationError` included, is rethrown and fails the build on purpose.
- **AC-8**: `IGDB_ATTRIBUTION` is `"Game data and images from IGDB.com"` (or the wording AC-11 records, if IGDB asks for different text). It is defined once, in `lib/legal/operator.ts` next to `IGDB_HOME_URL`. The footer shows it on every route beside TMDB's logo and notice, linking to `IGDB_HOME_URL` in a new tab (`noopener noreferrer`), with the footer's 44px mobile and 36px desktop tap areas. `lib/legal/boundary.test.ts` fails if the literal appears in any other file.
- **AC-9**: `/terms` gains IGDB in its catalog section. The section title becomes `Catalog data, TMDB and IGDB`, and after the TMDB paragraphs it adds, in this order: "Game details and images come from IGDB. We can't guarantee that they are accurate or complete."; a paragraph rendering `IGDB_ATTRIBUTION`; "IGDB community ratings belong to IGDB. Your own ratings are yours." `LEGAL_LAST_UPDATED` is set to the date of the PR's final commit (the merge day can't be known in advance). `/privacy` keeps its existing IGDB image paragraph unchanged, since no processor changes.
- **AC-10**: When the terms check (AC-11) finds an official IGDB logo file, it is saved byte for byte as `public/igdb-logo.svg` (or `.png` if that is the only official format), hash checked by a test like `tmdb-logo.test.ts`, and shown in the footer as the link, sized no taller than TMDB's logo, with `alt="IGDB"` and the attribution text beside it. With no official file, the footer shows the text credit alone as the link, and the result is recorded.
- **AC-11**: Before the production deploy, you read IGDB's current API terms, its FAQ and the Twitch Developer Services Agreement in a browser and record, in `rationale.md` under *IGDB terms check*: each document's URL, its last updated date if shown, the date you read it, verbatim quotes on attribution, non commercial use, caching and logo use, and whether BeStats complies. The `IGDB_ATTRIBUTION` doc comment cites that date, the way `TMDB_ATTRIBUTION` cites its terms. The deploy waits for this record. What the read can change: different wording or placement changes only `IGDB_ATTRIBUTION` and the footer; if the 24 hour caching clause applies to IGDB data, `getGameGenres` and `getGamePlatforms` drop from `max` to `hours` (every other IGDB read already lives `hours` or less); anything else unclear or forbidding (commercial terms, a required partnership, a hotlinking ban) stops the launch and goes back to `/architect`.
- **AC-12**: `NEXT_PUBLIC_GAMES_LIBRARY` is gone, so the GAMES tab shows on every page, `?type=game` is always valid on `/watchlist`, `/upcoming`, `/watched`, `/search` and `/api/search`, and the brand link and media tabs always know `game`. Removed: `getGamesLibrary`, `gamesLibraryEnabled` and their tests in `lib/env.ts`; `lib/search/games-flag.ts` and its test; the `gamesEnabled` argument of `parseLibraryTypeParam` and `libraryTypeForLocation` (`lib/catalog/media-type.ts`), the `gamesEnabled` option of `parseSearchParams` (`ParseOptions` and its `{ gamesEnabled?: false }` overload, `lib/search/params.ts`) and of `lib/search/quick.ts`, so `game` is always accepted; every caller (`page-media-type.tsx`, `media-type-tabs.tsx`, `brand-link.tsx`, `library-section.tsx`, `search-filters.tsx`, `search-results.tsx`, `app/api/search/route.ts`). Tests updated: `lib/env.test.ts`, `params.test.ts`, `quick.test.ts`, `brand-link.test.tsx`, `media-type-tabs.test.tsx`, `library-nav.test.tsx`, `navbar.test.tsx`, `game-library-tab.test.tsx`, `search-results.test.tsx`, `app/api/search/route.test.ts`, and `library-error-boundary.test.tsx` (its invalid flag case is deleted; the boundary stays for other thrown errors). The variable leaves `.env.example`, `docs/deploy.md` and Vercel Preview. `security-boundary.test.ts` gains a case that fails if any git tracked file outside `docs/` (and other than itself) names `NEXT_PUBLIC_GAMES_LIBRARY`.
- **AC-13**: `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are set in Vercel Preview (the same Twitch app as Production, sensitive), so a preview renders games. `docs/deploy.md` section 4 lists both rows for Production and Preview, with the rule that neither ever takes a `NEXT_PUBLIC_` prefix.
- **AC-14**: No SEO surface reads cookies, headers, the session or the visitor's region: game page metadata reads only `params` and `getGame`, list metadata only `searchParams` and the list read, and `gameJsonLd` only the normalized `Game`. Nothing user specific (status, score, timestamps) reaches metadata, JSON-LD or the sitemap. `robots.txt`, `sitemap.xml` and `opengraph-image` stay prerendered, and the game page, `/games` and the five list pages keep their prerendered shells, checked by `request-scope.test.ts` coverage of the new code and by `pnpm build` listing those routes as partially prerendered.
- **AC-15**: The change ships through `docs/deploy.md`: the PR preview is checked with `vercel curl`, then production after merge: `/sitemap.xml` lists games, a game page has its canonical, `og:image` and `VideoGame` JSON-LD with no `noindex`, `/games` and one list page have canonicals, the GAMES tab shows, and one live game URL passes the Schema Markup Validator (validator.schema.org) with a `VideoGame` item and zero errors. Google has no `VideoGame` rich result, so its Rich Results Test would only say "no items detected". A failed launch is undone with Vercel Instant Rollback (section 8).

## Decision

**Chosen option**: Option 1: One launch release on the existing SEO and legal modules.

Turn games on in one release that reuses `catalogMetadata`, `jsonLdScript`, the sitemap and the legal constants exactly as movies and shows use them, and delete the games flag rather than flip it.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking the metadata and JSON-LD in the running app · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) only if the game page or a list page loses its static shell.

## Feature design

**Data model sketch**: none. No table, column or migration changes. Catalog data stays unstored (no catalog cache, spec 0008).

**State transitions**: none.

**API surface** (pages and modules, no new endpoint):
| Surface | Change | Inputs | Outputs | Auth | Errors |
|---|---|---|---|---|---|
| `app/games/[id]/page.tsx` `generateMetadata` | found branch indexable | `params.id` | title, description, canonical, OG and X | public | malformed, not found, hidden, failed: noindex (AC-2) |
| `app/games/[id]/page.tsx` found branch | renders `JsonLd` | `Game` | `VideoGame` script | public | none rendered outside the found branch |
| `lib/seo/json-ld.ts` `gameJsonLd()` | new, pure | `GameJsonLdInput` (structural) | JSON-LD object | n/a | none |
| `lib/landing-metadata.ts` | `gamesMetadata` takes the `/games` path; `gameListMetadata` removed; `catalogListMetadata` takes any `CatalogList` | `searchParams` | metadata | public | `IgdbError` or `TmdbError`: noindex |
| `app/games/{slug}/page.tsx` (five) | `generateMetadata` instead of a static `metadata` | `searchParams` | metadata | public | as above |
| `app/sitemap.ts`, `lib/seo/sitemap.ts` | games landing, list paths, game ids | none | entries | public | `IgdbError` drops game ids (AC-7) |
| `lib/legal/operator.ts` | `IGDB_ATTRIBUTION` | none | string | n/a | none |
| `components/layout/site-footer.tsx`, `app/terms/page.tsx` | IGDB credit | none | markup | public | none |
| `lib/env.ts` and the flag's call sites | flag removed | none | none | n/a | none |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Game metadata | canonical, `og:url` | `absoluteUrl("/games/{id}")` from the parsed id, never the request URL |
| Game metadata | share image | `Game.artUrl` (t_1080p), else `Game.screenshotUrls[0]` (t_1080p), else `Game.coverUrl`, else `siteCardUrl()` |
| Game metadata | title, description | unchanged, from `Game.name`, `Game.releaseYear`, `Game.summary` (spec 0025, AC-10) |
| `gameJsonLd` | `image` | `Game.coverUrl` (the portrait cover, as `movieJsonLd` uses the poster) |
| `gameJsonLd` | `datePublished` | `Game.releaseDate`, the UTC day of `first_release_date` |
| `gameJsonLd` | `genre`, `gamePlatform` | `Game.genres[].name`, `Game.platforms[].name` |
| `gameJsonLd` | `author`, `publisher` | `Game.developers`, `Game.publishers` (spec 0031, AC-5 order and dedupe) |
| List metadata | indexable or not, page count | `readTaggedCatalogGridPage(list, page)` results and `lastListPage()` |
| List metadata | today (discover windows) | `requestTodayUtc()` after `connection()`, inside the existing `readTaggedGamePage` |
| Sitemap | game ids | `getPopularGames(POPULAR_GAME_LISTS.popular)`, first 200 (`GAME_SITEMAP_LIMIT`) |
| Sitemap | games list paths | `catalogListsFor("game").map(listPath)` |
| Footer, `/terms` | credit text, link | `IGDB_ATTRIBUTION`, `IGDB_HOME_URL` in `lib/legal/operator.ts` |
| `/terms` | last updated | `LEGAL_LAST_UPDATED`, bumped by hand |
| Terms record | quotes, dates, compliance | you, from the AC-11 browser read |

**Key invariants**:
- Canonicals are built from ids and registry paths, never the request URL. Only a list page's `?page=N` (N > 1) may carry a query.
- Every non found branch stays `noindex`, so an IGDB outage or a hidden game never gets indexed.
- No rating of any kind in metadata or JSON-LD (`lib/seo/AGENTS.md`).
- `lib/seo/` stays pure: `gameJsonLd` takes a structural input type, with no runtime import of `lib/igdb`.
- Every sitemap game is linked from a public page (the Popular list), as every sitemap movie and show is.
- `IGDB_ATTRIBUTION`, like `TMDB_ATTRIBUTION`, has one home.

**Security model**: everything here is public catalog data. No SEO surface imports `lib/supabase/` or reads request state (AC-14). JSON-LD text from IGDB is third party input, escaped by `jsonLdScript()`. The IGDB credentials stay server only; adding them to Preview gives them no `NEXT_PUBLIC_` prefix, and `security-boundary.test.ts` still holds. No processor changes: IGDB receives no user data, so `PROCESSORS` and `/privacy` stay as they are.

**Configuration required**:
- `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`: added to Vercel Preview (already in Production since 2026-10-24).
- `NEXT_PUBLIC_GAMES_LIBRARY`: removed from Vercel Preview, `.env.example` and `.env.local`.

**Critical test scenarios**:
- Happy path: a found game with art gets a canonical, `og:image` set to its art, no `robots`, and a `VideoGame` script with authors and publishers, verifies **AC-1**, **AC-3**
- Image fallback: art missing uses the first screenshot; both missing uses the cover; all missing uses the site card, verifies **AC-1**
- Not found, hidden and failed games stay noindex with no JSON-LD, verifies **AC-2**
- `gameJsonLd` drops empty genres, platforms, companies and a null date, and never emits `aggregateRating`, verifies **AC-3**
- List metadata: page 1 with games indexed; page 3 of a list with no count but results indexed; an empty page and an `IgdbError` noindex, verifies **AC-5**
- Sitemap order with games, 200 game cap and dedupe; an `IgdbError` keeps everything but game ids and caches for minutes; a non indexable build is empty, verifies **AC-6**, **AC-7**
- Footer and `/terms` render the IGDB credit; the boundary test fails on a pasted literal, verifies **AC-8**, **AC-9**
- With no flag set, the GAMES tab shows and `?type=game` works on every library page and search; the no flag name test passes, verifies **AC-12**
- Request scope tests cover the new metadata and JSON-LD, verifies **AC-14**

## Build plan

Tracer Bullet: the terms read comes first because its result can change the credit text; then one thin indexable thread (a game page, end to end into the sitemap), then the strands around it.

1. **Terms check (you, in a browser)**: read IGDB's API docs, its FAQ and the Twitch Developer Services Agreement; record the quotes, dates and compliance verdict in `rationale.md`, *IGDB terms check*; look for an official logo file, satisfies **AC-11**, **AC-10**
2. **Thin thread, one game page**: `gameJsonLd` and its tests, the found branch metadata and `JsonLd` on `/games/[id]`, the not found and failed branches unchanged, the sitemap's game ids from the Popular read with failure isolation, the request scope coverage, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-7**, **AC-14**
3. **Landing and list pages**: `/games` canonical, `catalogListMetadata` widened with the results rule, `generateMetadata` on the five list pages, `/games` and the five list paths in the sitemap, satisfies **AC-4**, **AC-5**, **AC-6**
4. **Credits**: `IGDB_ATTRIBUTION` with its dated doc comment, the footer credit (and logo if found, with its hash test), the `/terms` section, the `LEGAL_LAST_UPDATED` bump, the boundary test, satisfies **AC-8**, **AC-9**, **AC-10**
5. **Remove the flag**: delete the two readers, `games-flag.ts` and every branch, update their tests and the comments that cite the flag, the no flag name test, `.env.example`, satisfies **AC-12**
6. **Deploy docs and Preview**: `docs/deploy.md` section 4 (IGDB rows, flag row and paragraph removed), the IGDB credentials into Preview and the flag out of it (you, with `vercel env`), satisfies **AC-13**, **AC-12**
7. **Launch**: typecheck, lint, test, build with `VERCEL_ENV=production` and a site URL to see the indexable sitemap locally, PR preview check, merge, production checks and the Schema Markup Validator, satisfies **AC-15**

## Migration plan

**Strategy**: no data migration. One release turns indexing on and removes the flag together.
**Phases**:
1. Preview: credentials added, flag removed, the PR's preview checked.
2. Production: merge deploys; run the AC-15 checks.
**Rollback**: Vercel Instant Rollback to the last production deployment (`docs/deploy.md`, section 8), then fix forward. Nothing in the database to undo.
**Risks**: a crawl of 200 game pages and the list pages meets IGDB's 4 requests a second per instance. `getGame` is cached for hours and the list reads share one entry, and a 429 surfaces as the failed branch, which is `noindex`, so a retry panel is never indexed. The accepted cost: a crawler that meets that branch sees `noindex` and may drop that game from the index until its next crawl; a 429 failure caches for `seconds`, so the next crawl normally gets the page. After a rollback, search engines may still hold game URLs for a while; they keep resolving, because the pages exist without the launch.

## Consequences

**Positive**:
- Games reach search and link previews with the same quality bar as movies and shows, through the same modules.
- One fewer flag: no dead branch to keep tested, and Preview matches Production.
- IGDB credit lives in one constant with a dated terms record behind it.

**Negative / tradeoffs**:
- The launch depends on a manual browser read; the automated fetch could not confirm the terms.
- No kill switch: hiding games again needs a rollback or a code change.
- List page metadata now makes the page's IGDB read during metadata, so a slow IGDB delays the head (shared cache entry, so no extra request).
- Removing the flag touches many files and tests at once.

**Neutral**:
- `AGENTS.md` lines on the flag, "game pages reach the sitemap only in G10", and the `lib/seo/AGENTS.md` sitemap description go stale; `/sync` updates them.
- `components/library/library-error-boundary.tsx` stays (it guards any thrown library error) but its comment no longer cites the flag.

## Follow-up

- [ ] `/sync` after merge: root `AGENTS.md` (Games section, the `NEXT_PUBLIC_GAMES_LIBRARY` and `game` bullets), `lib/seo/AGENTS.md` (sitemap and JSON-LD), `docs/scope/games.md` G10.
- [ ] Specs 0027 and 0028 mention the flag staying until G10; this spec settles their follow-up.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
