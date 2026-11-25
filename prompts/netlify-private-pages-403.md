# Private pages answer 403 on Netlify

## Goal

On the Netlify host, every website page answers `403` with the static "website is off" body, private pages included. Today `/watchlist`, `/account` and every other private path answer `307` to `/sign-in`, which then answers `403` (docs/deploy.md, section 13, check 1). A malformed catalog URL such as `/movies/abc` answers `404` the same way. Vercel is unchanged.

## Inspected

- `apps/web/proxy.ts`: runs on every page path (the matcher skips only `api/`, `.well-known/`, `robots.txt`, `sitemap.xml`, `opengraph-image`, `_next/static`, `_next/image`, the favicon and image files outside `/movies/`, `/shows/` and `/games/`). In order: a malformed catalog id is rewritten to a `404`, a missing auth config sends a private GET to `/sign-in`, then the session refresh, then a signed out private GET is redirected to `/sign-in`.
- The deployed Netlify build: `@netlify/plugin-nextjs` 5.16.9 turns the proxy into one edge function, `___netlify-edge-handler-node-middleware`, with the matcher above as its pattern and no excluded patterns (`.netlify/edge-functions/manifest.json`). Netlify runs edge functions before `netlify.toml` redirects, so the proxy's own `307` or `404` wins over the forced `403` rules. A path the proxy passes through (`/movies`) does reach the `403` rule.
- `apps/web/netlify.toml`: the forced `403` rules, `to = "/403.html"`, and `apps/web/public/403.html`.
- `apps/web/deploy-config.test.ts`: the Netlify allow list (`/api`, `/_next`, `/privacy`, `/terms`, `/robots.txt`, `/favicon.ico`, the two logos).
- `apps/web/proxy.test.ts`: matcher cases, the catalog id rule, the incomplete config branch, the legal pages.
- `apps/web/lib/env.ts` (public values, validated lazily) and `lib/seo/site.ts` (reads `VERCEL_ENV` directly, a server-only host fact).
- `docs/deploy.md` section 13, `apps/web/app/AGENTS.md` (Routing, proxy.ts).

## Skills used

None beyond the repo's own docs. No schema, Supabase or catalog change.

## Decisions and assumptions

1. **A server-only flag, `WEBSITE_OFF=on`, set only on Netlify.** When it is on, the proxy answers `403` first, before the catalog id rule and before any Supabase call, for every matched path except `/privacy` and `/terms`. The response carries the body of `public/403.html` itself, with status `403`; a test keeps the two identical. (Amended 2026-11-25: the first deploy rewrote to `/403.html`, and Netlify served the rewritten static file with its own `200`, so pages answered `200` and `/movies` lost its `403`. Production was rolled back to the previous deploy within minutes.) Not `NEXT_PUBLIC_`: the browser never needs it.
2. **Vercel doesn't set it**, so on Vercel the Firewall rule keeps doing this job and the proxy behaves exactly as today. Local runs and CI don't set it either.
3. **`netlify.toml` keeps its forced `403` rules.** The proxy's matcher skips `sitemap.xml`, `opengraph-image` and image paths, so those still need the CDN rules, and the rules cost no function call for paths the proxy doesn't match. The two layers deny the same set, and a test checks they agree on the allow list.
4. **Every page request still runs the edge function.** Netlify offers no way to skip the plugin's generated edge function for chosen paths from `netlify.toml`, so this fixes the status code, not the invocation. What it saves is the Supabase `getClaims` work on those requests.
5. **Read at runtime through one helper,** `websiteOff()` in `lib/env.ts`, which reads `process.env.WEBSITE_OFF` as a literal property access (the file's existing rule) and is true only for `on`. Assumption: Netlify passes site variables to the edge function at runtime. If the first deploy shows it doesn't, the fallback is to inline the value at build time through `env` in `next.config.ts`, as a plan change I'd bring back to you.

## Expected files

1. `apps/web/lib/env.ts`: `websiteOff()`, with JSDoc citing `app/AGENTS.md` (Routing).
2. `apps/web/proxy.ts`: the `403` branch first in `proxy()`, with a `WEBSITE_OFF_ALLOWED` set (`/privacy`, `/terms`).
3. `apps/web/proxy.test.ts`: with the flag on, `/watchlist`, `/account`, `/movies`, `/movies/abc` and `/sign-in` answer `403` with the `403.html` body and no rewrite header, with no Supabase client created; `/privacy` and `/terms` pass through; with the flag off or unset, today's behavior is unchanged.
4. `apps/web/deploy-config.test.ts`: the proxy's allowed pages equal the page routes on the Netlify allow list.
5. `apps/web/.env.example`: `WEBSITE_OFF` documented, unset by default.
6. `docs/deploy.md` section 13: add `WEBSITE_OFF=on` to the Netlify env table, correct check 1, record the recheck. `apps/web/app/AGENTS.md`: the proxy line.

Branch `feat/netlify-private-403`, small commits: env helper with tests, proxy branch with tests, docs.

## Requirements

- R1: with `WEBSITE_OFF=on`, every page path the proxy matches answers `403` with the `403.html` body, except `/privacy` and `/terms`.
- R2: with the flag unset, `proxy.ts` behaves exactly as today (existing tests unchanged and passing).
- R3: the `403` branch makes no Supabase call and sets no cookie.
- R4: `/api/*`, `robots.txt`, the favicon and the logos are unaffected (the matcher already skips them).

## Security considerations

- The flag only narrows what is served. Unset, nothing changes; no path that is private today becomes reachable.
- `requireUser()` and RLS stay the real boundary (AGENTS.md section 11). This is a hosting rule, not an auth rule.
- No secret, no new public env value. The `403` answer sets no cookie, so nothing user specific can be cached with it.

## Acceptance criteria

- AC-1: on Netlify, `curl -sI` on `/watchlist`, `/account`, `/up-next` and `/movies/abc` answers `403`, with no `Location` header.
- AC-2: `/movies`, `/`, `/sign-in` and `/sitemap.xml` still answer `403`; `/privacy`, `/terms`, `/robots.txt` and `/api/v1/config` still answer `200`.
- AC-3: the proxy tests in Expected files pass, and every existing proxy test passes unchanged.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (proxy and env change).

## Manual test steps

1. Set `WEBSITE_OFF=on` on the Netlify site (I can do it with `netlify env:set` once you approve).
2. Deploy from the repo root: `npx netlify-cli@latest deploy --prod --filter @bestats/web`. This costs 15 of your 300 monthly credits.
3. Run AC-1 and AC-2 with `curl`, and check the extras route and a signed-out `me` route still answer as before.
4. Locally, `pnpm dev` with no flag: `/watchlist` still redirects to `/sign-in`.

## Needs the owner

- Approval of this plan, the flag name, and the 15 credit deploy.
