# Verify: deploy and provider setup · spec 0018 · updated 2026-10-04
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This file covers build step 3 (previews) so far; add later steps as they land._

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

## Acceptance-criteria coverage
- AC-6 (Preview half) · covered by `vercel env ls preview`
- AC-21 · covered by every UI step above plus the protection, robots, redirect, allow list and unit test commands
- Value sourcing, "whether auth is configured on this deployment" from `publicEnvProblems()` · covered by the preview notice step against the production form step (vary the config, see both outcomes)
