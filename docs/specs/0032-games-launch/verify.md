# Verify: Games launch · spec 0032 · updated 2026-10-26
_Steps derived from spec 0032 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Build locally with `VERCEL_ENV=production NEXT_PUBLIC_SITE_URL=https://bestats.example pnpm build`, then `PORT=3123 pnpm start` with the same two variables, so the indexable branch is what you check.

## UI / manual
- [x] Open `/games/1942` → `<link rel="canonical" href="…/games/1942">`, no `<meta name="robots">`, `og:image` is the game's `t_1080p` art, title `The Witcher 3: Wild Hunt (2015) · BeStats` → AC-1
- [x] Open a game with no art but screenshots, then one with only a cover → `og:image` is the first screenshot, then the cover → AC-1 (Value sourcing: share image)
- [x] Open `/games/999999999` and a hidden game (a DLC id) → `noindex`, no canonical, no `og:url`, no `application/ld+json`, and any `og:*` or `twitter:*` field is the site default, never the game's → AC-2
- [x] With IGDB credentials removed, open `/games/1942` → retry panel, `noindex`, no JSON-LD → AC-2
- [x] View source of `/games/1942` → one `VideoGame` script with `name`, `url`, `image` (the cover), `datePublished`, `description`, `genre`, `gamePlatform`, `author` and `publisher` as `Organization`s, no `rating` anywhere → AC-3 (Value sourcing: `image`, `datePublished`, `genre`, `gamePlatform`, `author`, `publisher`)
- [x] Open `/games` → canonical `…/games`, site card `og:image`, no `noindex` → AC-4
- [x] Open `/games/popular`, `/games/recently-released?page=3` → each has its own canonical; `/games/top-rated?page=51` and `?page=abc` are `noindex` with no canonical → AC-5 (Value sourcing: list indexability)
- [x] Open `/sitemap.xml` → `/movies`, `/shows`, `/games`, five movie, five show, five games list pages, `/privacy`, `/terms`, movies, shows, then up to 200 `/games/{id}`; all absolute → AC-6 (Value sourcing: game ids, games list paths)
- [x] Look at the footer on `/shows` at 1440px and 390px → TMDB logo and notice, then the IGDB logo and "Game data and images from IGDB.com" as one link to igdb.com in a new tab, logo no taller than TMDB's → AC-8, AC-10
- [x] Open `/terms` → section "Catalog data, TMDB and IGDB" ends with the three IGDB paragraphs in order; Last updated 26 October 2026 → AC-9
- [x] With no flag set anywhere: GAMES tab on `/shows`, `/watchlist?type=game` (signed in) shows Want to play, `/search?type=game&q=zelda` returns games, `GET /api/search?type=game&q=zelda` answers 200 → AC-12
- [x] Open a Preview deployment with `vercel curl /games/1942 --deployment <url>` → the game renders (credentials present in Preview) → AC-13
- [x] After merge, on production: `/sitemap.xml` lists games; `/games/1942` has canonical, `og:image`, `VideoGame` JSON-LD and no `noindex`; `/games` and `/games/popular` have canonicals; GAMES tab shows; validator.schema.org on `https://bestats-sable.vercel.app/games/1942` finds a `VideoGame` with zero errors → AC-15

## Commands
- [x] `pnpm test` → all green, including `app/sitemap.test.ts`, `lib/seo/sitemap.test.ts`, `lib/seo/json-ld.test.ts`, `lib/landing-metadata.test.ts`, `components/layout/igdb-logo.test.ts`, `security-boundary.test.ts` → AC-1 to AC-12, AC-14
- [x] Mock `getPopularGames` to reject with `IgdbError("unauthorized")` → sitemap keeps every other entry and picks `cacheLife("minutes")`; an `IgdbValidationError` fails the build → AC-7 (in `app/sitemap.test.ts`)
- [x] `pnpm build` → `/games`, `/games/[id]` and the five list pages are `◐` (partial prerender), `/sitemap.xml`, `/robots.txt`, `/opengraph-image` are `○` → AC-14
- [x] `git grep NEXT_PUBLIC_GAMES_LIBRARY -- ':!docs'` → only `security-boundary.test.ts` builds the name from fragments, so no match → AC-12
- [x] `vercel env ls` → `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in Production and Preview, no `NEXT_PUBLIC_GAMES_LIBRARY` → AC-12, AC-13

## Acceptance-criteria coverage
- AC-1 to AC-3: game page steps · AC-4, AC-5: landing and list steps · AC-6, AC-7: sitemap step and the IGDB failure command · AC-8 to AC-10: footer and `/terms` steps · AC-11: the record in `rationale.md`, *IGDB terms check* · AC-12: no flag steps and the grep · AC-13: Preview step and `vercel env ls` · AC-14: build command and request scope tests · AC-15: production step
