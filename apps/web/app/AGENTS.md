# app

Routes, plus the root files that shape them: `proxy.ts` and `next.config.ts`. The `cacheComponents` and `proxy.ts` basics are in root `AGENTS.md` "Commands and repo facts".

## Routing

- `/` is a temporary (307) redirect to `/shows` in `redirects()` in `next.config.ts`; there is no `app/page.tsx`.
- Library routes and their legacy redirects: [lib/catalog/AGENTS.md](../lib/catalog/AGENTS.md). A new private route registers in `PRIVATE_PATH_PREFIXES` ([lib/auth/AGENTS.md](../lib/auth/AGENTS.md)).
- `/games` is the games landing with five paged list pages (`/games/{slug}`), indexable and in the sitemap. Game detail pages keep their `index` meta, but they and season pages are disallowed in robots.txt and left out of the sitemap to protect Vercel's Active CPU budget ([lib/seo/AGENTS.md](../lib/seo/AGENTS.md)).
- `app/not-found.tsx` is the styled 404 for every unmatched URL. The game page answers a hidden game with a soft 404.
- `/showcase` is a static 404 in production and renders under `next dev` and Vitest.

## proxy.ts

- It answers a malformed title ID, season number or list slug under `/movies/`, `/shows/` and `/games/` with a real 404 before its auth check, using the pages' own parsers in `lib/catalog/ids.ts` and `lib/catalog/lists.ts`. A streamed page has already sent 200, so an unknown or adult ID is a soft 404 (`noindex`).
- The `matcher` skips image extensions everywhere except under those three prefixes, so `/movies/550.jpg` still reaches that rule; a new ID checked route needs the same exception.
- The `matcher` also skips `api/`, `robots.txt`, `sitemap.xml` and `opengraph-image`, each shared or prerendered, so no session refresh attaches `Set-Cookie` to them. A new metadata route needs the same exclusion and a case in `proxy.test.ts`.

## Images

Every image goes through `next/image` and the one `loaderFile`, `lib/images/loader.ts`, which hands TMDB URLs to `lib/tmdb/image-loader.ts` and IGDB covers to `lib/images/igdb-loader.ts`. The optimizer is closed (no `remotePatterns`, empty `localPatterns`; [prompts/close-image-optimizer.md](../prompts/close-image-optimizer.md)): a new host gets its own loader, and components reference images by URL rather than importing image files.

## Visitor region

Where to watch and the age rating chip read the country only from `getVisitorRegion()` in `lib/region.ts` (Vercel's `x-vercel-ip-country`, `US` fallback). Call it inside a streamed Suspense boundary only, never in a page shell, cached scope or SEO surface, and never store, log or send it to TMDB.

## Search rate limit

The `/api/search` rate limit is a Vercel Firewall rule, recorded only in [docs/deploy.md](../docs/deploy.md).
