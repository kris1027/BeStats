# app

Routes, plus the root files that shape them: `proxy.ts` and `next.config.ts`. The `cacheComponents` and `proxy.ts` basics are in root `AGENTS.md` "Commands and repo facts".

## Routing

- `turbopack.root` and `outputFileTracingRoot` in `next.config.ts` point at the workspace root, two folders up, so the build can resolve and ship files from `packages/*`.
- `/` is a temporary (307) redirect to `/shows` in `redirects()` in `next.config.ts`; there is no `app/page.tsx`.
- Library routes and their legacy redirects: [lib/catalog/AGENTS.md](../lib/catalog/AGENTS.md). A new private route registers in `PRIVATE_PATH_PREFIXES` ([lib/auth/AGENTS.md](../lib/auth/AGENTS.md)).
- The website is off in production (2026-11-21): a Vercel Firewall rule answers `403` to every page except `/api/`, `/privacy` and `/terms`, and robots.txt disallows everything ([docs/deploy.md](../../../docs/deploy.md), section 5). Routes still build and run locally.
- `/games` is the games landing with five paged list pages (`/games/{slug}`), indexable and in the sitemap. Game detail pages keep their `index` meta, but they and season pages are disallowed in robots.txt and left out of the sitemap to protect Vercel's Active CPU budget ([lib/seo/AGENTS.md](../lib/seo/AGENTS.md)).
- `app/not-found.tsx` is the styled 404 for every unmatched URL. The game page answers a hidden game with a soft 404.
- `/showcase` is a static 404 in production and renders under `next dev` and Vitest.

## /api/v1 (the mobile API)

- Every handler under `app/api/v1/` is exported as `export const GET = withV1({...})` from `lib/api/v1/with-v1.ts`; `with-v1.test.ts` fails on a handler that isn't (spec 0033, AC-4). `withV1` checks `X-BeStats-App-Version` (400 or 426; only `/config` sets `skipVersionCheck`), verifies the bearer token on `auth: "bearer"` routes, parses the path, query and body with the core schemas a route declares in `input` (a handler never parses its own; 400 before it runs), answers `{ error: { code, message } }`, sets `Cache-Control`, and logs every failure through `logV1Failure` (`lib/api/v1/log.ts`) or, for a refused token, `logAuthEvent(AUTH_EVENT.bearer)`.
- Public routes pass their `s-maxage` value as `cache`; every `me` answer is `private, no-store`, and every error `no-store`. Handlers return `v1Ok` or `v1Fail` and never build a `Response` themselves. `v1Ok(null, 204)` answers with no body at all (`POST /me/account/delete`), which the app reads as `null`. A scan in `with-v1.test.ts` checks every route's `cache` against spec 0035, so a new route fails until it is listed there.
- A repeated query key reaches the schema as an array (search's `genre` and `platform`); any other schema expects a string, so a repeated key there answers 400.
- `pnpm api:local` (`scripts/api-local.sh`, suites in `app/api/v1/*.local.ts`) runs the real routes, bearer check and RLS against the local Supabase stack with both seeded users. It is opt in, not part of `pnpm test`; run it after changing a v1 route, and clean up every row it writes so `pnpm test:db` still passes after it.
- Request and response shapes live in `packages/core/src/api/v1/`; a route test parses each body with its core schema.
- A write route calls the same command as its Server Action ([lib/tracking/AGENTS.md](../lib/tracking/AGENTS.md)) and answers through `trackingAnswer` (`lib/api/v1/tracking.ts`, with `bearerDeps`): a refusal maps through the resource's core error table and carries the action's word as `reason`. A restore route takes `restoreBodySchema(kind)` and checks that the cleared state names the path's title (and season, on the season restore), else 400. Route tests share `app/api/v1/test-kit.ts` and keep their own `vi.mock` lines.

## proxy.ts

- It answers a malformed title ID, season number or list slug under `/movies/`, `/shows/` and `/games/` with a real 404 before its auth check, using the pages' own parsers in `packages/core/src/catalog/ids.ts` and `packages/core/src/catalog/lists.ts`. A streamed page has already sent 200, so an unknown or adult ID is a soft 404 (`noindex`).
- The `matcher` skips image extensions everywhere except under those three prefixes, so `/movies/550.jpg` still reaches that rule; a new ID checked route needs the same exception.
- The `matcher` also skips `api/`, `.well-known/`, `robots.txt`, `sitemap.xml` and `opengraph-image`, each shared or prerendered, so no session refresh attaches `Set-Cookie` to them. A new metadata route needs the same exclusion and a case in `proxy.test.ts`.
- `public/.well-known/` holds the app link files, written only by `pnpm app-links` (never by hand); `next.config.ts` `headers()` serves both as `application/json`, since Apple's file has no extension and would otherwise verify nothing (prompts/mobile-deep-links.md).

## Images

Every image goes through `next/image` and the one `loaderFile`, `lib/images/loader.ts`, which steps TMDB and IGDB URLs down with `sizeImageUrl` from `@bestats/core/images/image-url`, the same rule the mobile app uses (spec 0035, Images). The optimizer is closed (no `remotePatterns`, empty `localPatterns`; [prompts/close-image-optimizer.md](../../../prompts/close-image-optimizer.md)): a new host gets its own ladder in that core file, and components reference images by URL rather than importing image files.

## Visitor region

Where to watch and the age rating chip read the country only from `getVisitorRegion()` in `lib/region.ts` (Vercel's `x-vercel-ip-country`, `US` fallback). Call it inside a streamed Suspense boundary only, never in a page shell, cached scope or SEO surface, and never store, log or send it to TMDB.

## Search rate limit

The `/api/search` rate limit is a Vercel Firewall rule, recorded only in [docs/deploy.md](../../../docs/deploy.md).
