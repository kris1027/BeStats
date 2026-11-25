# Netlify as a second host

## Goal

Make the same `apps/web` deployable to Netlify as well as Vercel, so the phone app keeps working when one host runs out of its free quota. On 2026-11-25 Vercel production answered `402` on every path, `/api/v1` included, so the iPhone app has no API. Netlify becomes the primary host. Vercel keeps its configuration unchanged and is the fallback. The code and docs call Netlify "the backup host" for its role beside Vercel, which stays the configured production origin; it is primary while Vercel's quota is spent, so nothing legal depends on which host is serving. Both serve the same "website off, API on" shape (prompts/web-off-keep-api.md).

## Inspected

- `apps/web/vercel.json`: only `regions: ["fra1"]`. Root Directory `apps/web`, files outside it included, and Node 22 are Vercel dashboard settings (`docs/deploy.md`, The facts).
- `docs/deploy.md` sections 4, 5, 8 and 12: the env table, the three Vercel Firewall rules (`Rate limit api search`, AI Bots Deny, `Website off, API on`), rollback, and the mobile release.
- `apps/web/deploy-config.test.ts`: pins `supabase/config.toml` production auth values and `vercel.json`.
- `apps/web/lib/region.ts` and `packages/core/src/catalog/region.ts`: the visitor country comes only from `x-vercel-ip-country`. `lib/region-boundary.test.ts` allows that header string only in `lib/region.ts`.
- `apps/web/lib/seo/site.ts`: `isIndexableDeployment()` needs `VERCEL_ENV === "production"`, so a Netlify build is never indexable with no change. `app/robots.ts` disallows everything on every host.
- `packages/core/src/legal/operator.ts` (`PROCESSORS`, `LEGAL_LAST_UPDATED`, `SUPABASE_REGION` JSDoc), `apps/web/app/privacy/page.tsx` (the country Vercel derives; "Transfers outside the EEA" says the server functions run in the matching Vercel region), `docs/store-privacy-labels.md`.
- `supabase/config.toml` `[remotes.production.auth]`: `site_url` and `additional_redirect_urls` name only the Vercel origin.
- `packages/core/src/links/app-links.ts` and `apps/mobile/app.json`: app links are bound to `bestats-app.vercel.app`.
- `apps/mobile/.env.production.local`: `EXPO_PUBLIC_API_BASE_URL=https://bestats-app.vercel.app`, used by the owner's local release build.
- `apps/web/app/`: top-level routes `(auth)` (sign-in, sign-up, forgot-password, reset-password, check-email), `account`, `api`, `auth`, `coming-soon`, `finished`, `games`, `movies`, `playing`, `privacy`, `search`, `showcase`, `shows`, `terms`, `up-next`, `upcoming`, `want-to-play`, `watched`, `watchlist`, plus `/`, `robots.txt`, `sitemap.xml`, `opengraph-image`, `favicon.ico`.
- `AGENTS.md` (sections 6, 11, 12; legal facts rule), `apps/web/app/AGENTS.md`, `apps/web/lib/seo/AGENTS.md`.

Netlify facts, read on 2026-11-25:
- Next.js 16 with Cache Components deploys through Netlify's OpenNext adapter with no adapter configuration ([changelog](https://www.netlify.com/changelog/next-js-16-deploy-on-netlify/)).
- The function region can only be chosen on Pro or above. Free functions run in Ohio, `us-east-2` ([functions configuration](https://docs.netlify.com/build/functions/configuration/)).
- The Free plan gives 300 credits a month as a hard cap, and the site pauses when they run out. A production deploy costs 15 credits, compute 10 per GB-hour, requests 2 per 10,000. Deploy previews and failed deploys cost nothing ([credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)).
- Rate limiting: Free allows 2 code rules per project, keyed per domain and IP. They attach to `netlify.toml` redirects or a function's config. Dashboard rules and bot rules are Enterprise only ([rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)).
- Netlify's proxy sends the visitor country as `x-country` to functions (Netlify support forum). It is not in Netlify's reference docs, so the first deploy checks it.
- Netlify's DPA includes the EU Standard Contractual Clauses. Netlify pre-signs it, and the customer completes the appendix and emails it to Netlify ([DPA](https://www.netlify.com/pdf/netlify-dpa.pdf)).

## Skills used

`supabase` (adding the redirect URL to `config.toml`). No schema, RLS or cache change, so not `supabase-postgres-best-practices`.

## Decisions (agreed with the owner, 2026-11-25)

1. **One host is primary at a time, switched by hand.** No automatic failover in the app. Netlify is primary from now on, and the owner switches back only if Netlify runs short. Nothing on Vercel is removed or changed.
2. **Netlify serves what Vercel serves: website off, API on.** The same allow list: `/api/*`, `/_next/*`, `/privacy`, `/terms`, `/robots.txt`, `/favicon.ico`, `/tmdb-logo.svg`, `/igdb-logo.svg`.
3. **Free plan, site `bestats-app.netlify.app`** (or the closest free name), no custom domain.
4. **Deploys are manual.** The site is linked to GitHub with builds stopped. The owner deploys with "Trigger deploy" or `netlify deploy --build --prod` when switching hosts or shipping a fix the app needs, because every production deploy costs 15 of the 300 monthly credits.
5. **App links stay on `bestats-app.vercel.app`.** No Netlify associated domain and no `.well-known` change.
6. **The phone app switches by env value.** The owner sets `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env.production.local` and rebuilds the local release build. No EAS or TestFlight build exists yet.
7. **The country header is host neutral.** `regionFromHeaders` reads `x-vercel-ip-country` first, then `x-country`.
8. **Netlify is never indexable.** `isIndexableDeployment()` stays Vercel only; a test pins that a Netlify production build (`CONTEXT=production`, no `VERCEL_ENV`) is not indexable.
9. **Legal update in this PR.** Netlify joins `PROCESSORS`, `/privacy` names Ohio as where functions run when Netlify serves the app, and `LEGAL_LAST_UPDATED` and `docs/store-privacy-labels.md` are updated. The transfer line claims SCC coverage only once the owner has completed Netlify's DPA (see Needs the owner). Until then it claims no clauses, as Expo's line does (prompts/mobile-release-prep.md, decision 5).
10. **Functions in Ohio on Free.** Each Supabase call crosses the Atlantic. Accepted, since Netlify is a working backup and Vercel `fra1` stays the fast path.
11. **Website off is enforced at Netlify's CDN with `netlify.toml` redirects,** never in `proxy.ts`, so a blocked request runs no function. Rules use `force = true` and status `403` with a small static body, `public/403.html`. Rules in `netlify.toml` run before the adapter's own routing.
   - **Shape: an explicit deny list, not allow-then-deny.** Netlify has no "pass through" rule, and a self rewrite (`/api/* -> /api/:splat 200`) in front of the adapter is unproven. So the rules deny `/` and every top-level page route listed above (`/movies`, `/movies/*` and so on, plus `/sitemap.xml`, `/opengraph-image`, `/showcase`, `/auth/*` and the `(auth)` pages).
   - A test walks `app/` and fails when a new top-level route is neither denied nor allowed, so the list cannot drift.
   - An unknown path is not denied: it renders Next's 404 in a function, a small cost that is accepted.
12. **One rate limit rule:** `/api/*`, 300 requests per 60 seconds per IP, on a forced self rewrite `from = "/api/*" to = "/api/:splat" status = 200` carrying `[redirects.rate_limit]`. If the first deploy shows that self rewrite breaks any `/api` route, the rule is removed, as agreed, and `docs/deploy.md` records why.
13. **No AI bot deny on Netlify.** The `403` rules plus `robots.txt` already stop page renders.
14. **The owner runs every remote step;** I run none (`docs/deploy.md` preamble).

## Expected files

Branch `feat/netlify-mirror`, small conventional commits that each build:

1. `feat(web): read the visitor country from Netlify too`
   - `apps/web/lib/region.ts`: `regionFromHeaders` reads `x-vercel-ip-country ?? x-country`. JSDoc cites this plan.
   - `apps/web/lib/region.test.ts`: Netlify header alone, both headers (Vercel wins), neither.
   - `apps/web/lib/region-boundary.test.ts`: the "only in `lib/region.ts`" scan covers `"x-country"` too, and the TMDB scan rejects both header names.
   - `packages/core/src/catalog/region.ts`: JSDoc names both hosts. `XX` stays unknown.
2. `feat(web): netlify.toml for the backup host`
   - `apps/web/netlify.toml`:
     - `[build]`: `command = "pnpm --filter @bestats/web build"`. No `publish` key: Netlify's Next.js adapter sets it (amended after review, 2026-11-25).
     - `[build.environment]`: `NODE_VERSION = "22"`.
     - `[build.processing]` left alone.
     - The rate limit rule (decision 12), then the deny rules (decision 11).
     - No secrets.
   - `apps/web/public/403.html`: one plain line, "The BeStats website is off. The BeStats app still works.", plus a link to `/privacy`. No script.
   - `apps/web/deploy-config.test.ts`: parses `netlify.toml` with the existing flat TOML reader, extended for `[[redirects]]` arrays only if it needs to be. It pins Node 22, the build command, and the rate limit values. It also pins that every top-level route under `app/` (route groups expanded) is either on the allow list or denied, and that no allowed path (`/api/v1/config`, `/privacy`, `/terms`, `/robots.txt`, `/_next/static/x`, the logos, the favicon) matches a deny rule.
3. `feat(supabase): allow the Netlify origin as a redirect`
   - `supabase/config.toml` `[remotes.production.auth]`: add `https://bestats-app.netlify.app/auth/callback` and `https://bestats-app.netlify.app/**` to `additional_redirect_urls`. `site_url` stays on Vercel.
   - `deploy-config.test.ts` pins the new list.
4. `docs(legal): name Netlify as a host`
   - `packages/core/src/legal/operator.ts`:
     - `PROCESSORS` gains Netlify: "Hosts the website and the app's API when it serves the app in place of Vercel, and keeps request logs." Its name and function region live in `BACKUP_HOST`, which `/privacy` reads too.
     - `/terms` names no host or processor, so it needs no change.
     - The transfer line: Netlify is a United States company, and when it serves the app, the server functions run in Ohio, United States.
     - The Vercel purpose says "website and the app's API".
     - Bump `LEGAL_LAST_UPDATED`, and update the `SUPABASE_REGION` JSDoc.
   - `apps/web/app/privacy/page.tsx`:
     - The country line becomes "the approximate country our hosting provider derives".
     - "Transfers outside the EEA" says the database is in Frankfurt, and the server functions run in the matching Vercel region or, when Netlify serves the app, in Ohio, United States.
   - `apps/web/app/privacy/page.test.tsx`: updated assertions, plus Netlify's processor entry.
   - `docs/store-privacy-labels.md`: Netlify beside Vercel in the IP row, the approximate country note and the Play service provider list. The store URLs stay on Vercel until a store build ships.
5. `docs(deploy): run the Netlify backup host`
   - `docs/deploy.md`:
     - "The facts" gains the Netlify rows: origin, plan, function region, base and package directory, Node.
     - A new section 13, "Netlify backup host": site setup, the env table, manual deploys and their credit cost, switching the phone app, checks, the rate limit and site-off rules, the DPA step, and what Netlify lacks (AI bot deny, region choice).
   - `apps/web/.env.example`: the `NEXT_PUBLIC_SITE_URL` and `VERCEL_ENV` comments mention Netlify.
   - `AGENTS.md` Stack line and Commands line (`fra1` for Vercel, Ohio for Netlify), `apps/web/app/AGENTS.md` (site-off and region lines), `apps/web/lib/seo/AGENTS.md` (Netlify never indexable).

`apps/mobile/.env.production.local` is gitignored and stays the owner's edit.

## Requirements

- R1: `pnpm build` output is unchanged for Vercel. `vercel.json` and every Vercel-only path keep working.
- R2: on Netlify, `/api/v1/*` and `/api/search` answer as on Vercel, and `/privacy`, `/terms` and `/robots.txt` render.
- R3: on Netlify, `/`, `/movies`, `/movies/550`, `/watchlist`, `/sign-in`, `/sitemap.xml` and `/showcase` answer `403` with the static body, and no function log line appears for them.
- R4: the title extras routes pick the visitor's country on Netlify from `x-country`.
- R5: no secret appears in `netlify.toml` or any committed file. The TMDB and IGDB secrets are read only through their `env.ts` (`security-boundary.test.ts`).
- R6: Netlify answers `robots.txt` disallowing everything, and its build is not indexable.

## Security considerations

- Env values live only in Netlify's site settings, scoped to Builds and Functions. The TMDB token and the IGDB pair are marked secret there, and none gets a `NEXT_PUBLIC_` prefix. No service role key ever goes in.
- Private API answers already send `private` cache headers. Netlify's CDN honors `Cache-Control: private` and `no-store`, and the first deploy checks one private route for `cache-status` showing no hit.
- Deploy previews stay off, so no unprotected preview origin exists (Netlify Free has no password protection).
- Adding the Netlify origin to the Supabase redirect list widens where an auth redirect may land to one origin the owner controls.
- The `x-country` value is used as Vercel's is: never stored, logged or sent to TMDB.

## Acceptance criteria

- AC-1: `apps/web/netlify.toml` exists, and `deploy-config.test.ts` pins its values and its route coverage.
- AC-2: `regionFromHeaders` returns PL for `x-country: PL`, and prefers `x-vercel-ip-country` when both are present.
- AC-3: `/privacy` lists Netlify as a processor, names Ohio as where functions run on Netlify, and shows the new `Last updated`.
- AC-4: `config.toml` lists the Netlify redirect URLs, and the test pins them.
- AC-5: `docs/deploy.md` section 13 lets the owner set up, deploy, switch and check Netlify without asking.
- AC-6 (owner, after deploy): R2, R3, R4 and R6 hold on `bestats-app.netlify.app`, and the phone app signs in, browses and tracks against it.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (targeted: `region.test.ts`, `region-boundary.test.ts`, `deploy-config.test.ts`, `privacy/page.test.tsx`, `robots.test.ts`, `lib/legal/boundary.test.ts`), `pnpm build`. No database change, so no `pnpm test:db`. A local `netlify build` is not run: the Netlify CLI is not installed, and installing a global tool is outside this plan. The first real deploy is the check.

## Manual test steps

Local (me):
1. `pnpm dev`, then `curl -H "x-country: PL" localhost:3000/api/v1/movies/550/extras -H "X-BeStats-App-Version: <current>"` shows Poland's providers.
2. Open `/privacy` and read the hosting and transfer paragraphs.

Remote (owner, from `docs/deploy.md` section 13):
1. In Netlify, add a new project from GitHub `kris1027/BeStats`:
   - Base directory: empty (repo root).
   - Package directory: `apps/web`.
   - Site name: `bestats-app`.
   - Under Build settings, set Builds to Stopped and turn deploy previews and branch deploys off.
2. Add the env vars from the section 13 table, with `NEXT_PUBLIC_SITE_URL=https://bestats-app.netlify.app`.
3. Trigger one production deploy.
4. `curl -sI https://bestats-app.netlify.app/movies` answers `403`, while `/privacy` and `/api/v1/config` (with `X-BeStats-App-Version`) answer `200`, and `/robots.txt` disallows everything.
5. Send 310 quick requests to `/api/v1/config` from one address: some answer `429`, and every `/api` route still works afterwards. If the self rewrite broke `/api`, remove the rule and redeploy (decision 12).
6. `curl -s https://bestats-app.netlify.app/api/v1/movies/550/extras -H "X-BeStats-App-Version: <current>"` shows your own country's providers.
7. Run `pnpm exec supabase config push`. The diff should show only the two new redirect URLs.
8. Set `EXPO_PUBLIC_API_BASE_URL=https://bestats-app.netlify.app` in `apps/mobile/.env.production.local`, rebuild the local release build, then sign in, browse, search, and track a movie, an episode and a game.
9. Optional: complete and send Netlify's DPA. Once done, tell me, and the Netlify transfer line gains the SCC sentence.

## Needs the owner

- Every remote step above.
- While Vercel is paused, app links and the store privacy URLs on `bestats-app.vercel.app` don't resolve. Production sends no email, so no reset link is affected today.
- Netlify's free credits: about 20 production deploys a month at most before requests and compute. Watch Usage in the Netlify dashboard during the first week.
