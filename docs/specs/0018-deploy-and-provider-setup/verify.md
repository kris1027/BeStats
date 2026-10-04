# Verify: deploy and provider setup · spec 0018 · updated 2026-10-04
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This file covers build steps 3 (previews) and 4 (legal, SEO and runbook) so far; add later steps as they land._

## UI / manual
- [ ] Open a preview URL in a browser where you are signed out of Vercel → Vercel's login wall, not BeStats → AC-21
- [ ] Open the same preview signed in to Vercel (or with a bypass token) → `/shows`, `/movies`, `/search?q=dune` and `/movies/550` render TMDB posters and data → AC-21
- [ ] On the preview, look at the navbar → the signed out `Sign in` button, no account menu → AC-21
- [ ] On the preview, open `/sign-in` and `/sign-up` → "Sign in isn't available on this deployment." in place of the form, with no email or password field → AC-21
- [ ] On the preview, open `/watchlist?type=tv` → lands on `/sign-in?next=%2Fwatchlist%3Ftype%3Dtv` showing the notice → AC-21
- [ ] On production, open `/sign-in` → the real form, not the notice (the check reads `publicEnvProblems()`, so a complete config must show the form) → AC-21

## Commands
- [ ] `vercel env ls preview` → exactly `TMDB_READ_ACCESS_TOKEN` and `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY`; no Supabase variable, no secret key → AC-6
- [ ] `curl -s -o /dev/null -w '%{http_code}' <preview>/shows` → `302` or `401` (protection on) → AC-21
- [ ] `vercel curl /robots.txt --deployment <preview>` → `User-Agent: *` and `Disallow: /` → AC-21
- [ ] `vercel curl /account --deployment <preview> -- -s -o /dev/null -w '%{http_code} %{redirect_url}'` → `307` to `/sign-in?next=%2Faccount` → AC-21
- [ ] `grep additional_redirect_urls supabase/config.toml` → only the production origin and localhost entries, no `*.vercel.app` preview origin → AC-21
- [ ] `pnpm vitest run proxy.test.ts "app/(auth)/sign-in/page.test.tsx" "app/(auth)/sign-up/page.test.tsx"` → all pass, including the no config redirect that never calls `createServerClient` → AC-21

## Step 4: legal, SEO and runbook
- [ ] On production, open `/robots.txt` → `Allow: /` and `Sitemap: https://bestats-sable.vercel.app/sitemap.xml` → AC-22
- [ ] On production, view the source of `/movies/550` → `<link rel="canonical">` and `og:url` both on `https://bestats-sable.vercel.app` → AC-22
- [ ] `curl -s https://bestats-sable.vercel.app/sitemap.xml | grep -c '<loc>'` → a few hundred, with `/movies/<id>` and `/shows/<id>` entries, not just the four static routes → AC-22
- [ ] In Google Search Console, the sitemap shows as submitted and read → AC-22
- [ ] On production, open `/privacy#transfers-outside-the-eea` → data stored and processed in the EU, the database in Frankfurt, Germany, and the Standard Contractual Clauses sentence → AC-23
- [ ] On production `/privacy`, read "Why we use it" and Supabase's processor line → no mention of sending confirmation or recovery emails, no Google or email provider listed, Last updated 4 October 2026 → AC-23
- [ ] `pnpm vitest run lib/legal app/privacy` → all pass, including the EU region test and the no account email test → AC-23
- [ ] Temporarily set `SUPABASE_REGION.code` to `us-east-1` and run `pnpm vitest run lib/legal/operator.test.ts` → the region test fails; revert → AC-23
- [ ] Open `docs/deploy.md` → it covers linking at CLI `2.117.0` with the region and JWT key checks, `db push` before merge, `config push` with the diff review and the AC-8 path, Vercel variables per environment with the redeploy note, branch protection and the firewall settings, the AC-18 finding, restoring a paused project, rollback, `pnpm tmdb:live` and the sitemap check, the legal read through, and manual password help → AC-24
- [ ] `docs/deploy.md` section 3 records the diff of a `config push` you ran yourself (not the placeholder paragraph) → AC-7, AC-24

## Acceptance-criteria coverage
- AC-6 (Preview half) · covered by `vercel env ls preview`
- AC-21 · covered by every UI step above plus the protection, robots, redirect, allow list and unit test commands
- Value sourcing, "whether auth is configured on this deployment" from `publicEnvProblems()` · covered by the preview notice step against the production form step (vary the config, see both outcomes)
- AC-22 · covered by the robots, canonical, sitemap and Search Console steps
- AC-23 · covered by the two `/privacy` steps, the unit tests and the region mutation check
- AC-24 · covered by the `docs/deploy.md` read through; AC-18's finding and the firewall rule stay open until build step 5
- Value sourcing, "privacy policy, the Supabase region" from `supabase projects list` → `SUPABASE_REGION` · covered by comparing `pnpm exec supabase projects list` (`eu-central-1`) with the rendered `/privacy` text
