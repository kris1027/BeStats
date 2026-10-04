# Verify: deploy and provider setup · spec 0018 · updated 2026-10-04
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This file covers build steps 3 (previews), 4 (legal, SEO and runbook) and 5 (hosted security proof)._

## UI / manual
- [x] Open a preview URL in a browser where you are signed out of Vercel → Vercel's login wall, not BeStats → AC-21
- [x] Open the same preview signed in to Vercel (or with a bypass token) → `/shows`, `/movies`, `/search?q=dune` and `/movies/550` render TMDB posters and data → AC-21
- [x] On the preview, look at the navbar → the signed out `Sign in` button, no account menu → AC-21
- [x] On the preview, open `/sign-in` and `/sign-up` → "Sign in isn't available on this deployment." in place of the form, with no email or password field → AC-21
- [x] On the preview, open `/watchlist?type=tv` → lands on `/sign-in?next=%2Fwatchlist%3Ftype%3Dtv` showing the notice → AC-21
- [x] On production, open `/sign-in` → the real form, not the notice (the check reads `publicEnvProblems()`, so a complete config must show the form) → AC-21

## Commands
- [x] `vercel env ls preview` → exactly `TMDB_READ_ACCESS_TOKEN` and `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY`; no Supabase variable, no secret key → AC-6
- [x] `curl -s -o /dev/null -w '%{http_code}' <preview>/shows` → `302` or `401` (protection on) → AC-21
- [x] `vercel curl /robots.txt --deployment <preview>` → `User-Agent: *` and `Disallow: /` → AC-21
- [x] `vercel curl /account --deployment <preview> -- -s -o /dev/null -w '%{http_code} %{redirect_url}'` → `307` to `/sign-in?next=%2Faccount` → AC-21
- [x] `grep additional_redirect_urls supabase/config.toml` → only the production origin and localhost entries, no `*.vercel.app` preview origin → AC-21
- [x] `pnpm vitest run proxy.test.ts "app/(auth)/sign-in/page.test.tsx" "app/(auth)/sign-up/page.test.tsx"` → all pass, including the no config redirect that never calls `createServerClient` → AC-21

## Step 4: legal, SEO and runbook
- [x] On production, open `/robots.txt` → `Allow: /` and `Sitemap: https://bestats-sable.vercel.app/sitemap.xml` → AC-22
- [x] On production, view the source of `/movies/550` → `<link rel="canonical">` and `og:url` both on `https://bestats-sable.vercel.app` → AC-22
- [x] `curl -s https://bestats-sable.vercel.app/sitemap.xml | grep -c '<loc>'` → a few hundred, with `/movies/<id>` and `/shows/<id>` entries, not just the four static routes → AC-22
- [ ] In Google Search Console, the sitemap shows as submitted and read → AC-22
- [x] On production, open `/privacy#transfers-outside-the-eea` → data stored and processed in the EU, the database in Frankfurt, Germany, and the Standard Contractual Clauses sentence → AC-23
- [x] On production `/privacy`, read "Why we use it" and Supabase's processor line → no mention of sending confirmation or recovery emails, no Google or email provider listed, Last updated 4 October 2026 → AC-23
- [x] `pnpm vitest run lib/legal app/privacy` → all pass, including the EU region test and the no account email test → AC-23
- [ ] Temporarily set `SUPABASE_REGION.code` to `us-east-1` and run `pnpm vitest run lib/legal/operator.test.ts` → the region test fails; revert → AC-23
- [x] Open `docs/deploy.md` → it covers linking at CLI `2.117.0` with the region and JWT key checks, `db push` before merge, `config push` with the diff review and the AC-8 path, Vercel variables per environment with the redeploy note, branch protection and the firewall settings, the AC-18 finding, restoring a paused project, rollback, `pnpm tmdb:live` and the sitemap check, the legal read through, and manual password help → AC-24
- [x] `pnpm exec supabase config diff` → only the three differences `docs/deploy.md` section 3 accepts (Twilio enabled, two pooler sizes) → AC-7, AC-24

## Step 5: hosted security proof
_Needs two throwaway production accounts. Sign them up through `POST <supabase url>/auth/v1/signup` with the publishable key, get tokens from `auth/v1/token?grant_type=password`, and delete them at the end (last step)._
- [x] Decode one access token → header `alg` is `ES256` and its `kid` is served at `<supabase url>/auth/v1/.well-known/jwks.json` → AC-9
- [x] Same token → `exp - iat` is `600` → AC-17
- [x] `pnpm exec supabase db query --linked "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where nspname = 'public' and relkind in ('r','p')"` → `user_episode_state`, `user_movie_state`, `user_show_state`, all `true` → AC-5
- [x] Each user inserts one row in each table with their own token → `201` three times each → AC-5
- [x] With A's token, `GET /rest/v1/<table>?select=*` on all three tables plus `user_watchlist_entries` and `user_up_next_shows` → only A's rows; adding `&user_id=eq.<B>` → `[]` → AC-5
- [x] With A's token, `PATCH` and `DELETE` on `?user_id=eq.<B>` (with `Prefer: return=representation`) → `200` and `[]` on every table → AC-5
- [x] With A's token, insert a row with `user_id` = B, upsert over B's row, and `PATCH` A's own row to `user_id` = B → each `403` with code `42501` → AC-5
- [x] With B's token, read B's rows → unchanged (rating 8, status `watching`, episode rating 9) → AC-5
- [x] Without a user token, `GET` any of the five → `401` → AC-5
- [x] In a browser with cookies cleared, sign in on production → the only `sb-` cookie has `HttpOnly` and `Secure`; `document.cookie` is empty → AC-16
- [x] Signed in, load `/watchlist`, `/account`, `/upcoming` and every script they reference → no `eyJ...` token, no `sb_secret_`, no `service_role`, no `TMDB_READ_ACCESS_TOKEN`, no `refresh_token` in the HTML; same for the public pages → AC-19
- [x] On `/account`, change the password with a seven character new one → "at least 8 characters"; with a wrong current one → "Your current password is not correct."; with the right one → "Your password has been changed.", and the password grant then accepts only the new password → AC-14
- [x] `vercel firewall overview` → one active custom rule → AC-20
- [x] Send 70 quick requests to `/api/search?type=movie&q=dune<n>` → 60 `200`, then `429` with `x-vercel-mitigated: deny`; `/shows` still `200` → AC-20
- [x] While limited, type in the navbar search → "Couldn't reach TMDB" with Try again; a minute later, typing a title → results → AC-20
- [ ] Send wrong passwords straight to `auth/v1/token` until `429` → it comes after about 30 to 36 on a fresh bucket, and turns back into `400` within seconds (a token bucket, one try back every 2 seconds, not a five minute block). This measures the burst and refill the next step's "about 40" rests on; it does not prove which address is counted → AC-18
- [ ] Wait at least a minute so the buckets refill, then from several browsers on one network, send about 150 wrong sign ins through the app in 20 seconds → clearly more than about 40 get "Those details did not match" (one bucket keyed on your address would allow about 40), and some show `You have reached the limit for now. Please wait a little and try again.`; wrong current passwords on `/account` during the burst show the same copy → AC-18
- [x] Read `docs/deploy.md` section 6 and the comment beside `token_refresh` in `supabase/config.toml` → both record the shared Vercel address finding and that `token_refresh`, not `sign_in_sign_ups`, limits password sign ins → AC-18, AC-24
- [x] Delete the two accounts (`delete from auth.users where id in (...)` on the linked project, or the dashboard) → their rows in all three tables count `0` afterwards → AC-5

## Acceptance-criteria coverage
- AC-6 (Preview half) · covered by `vercel env ls preview`
- AC-21 · covered by every UI step above plus the protection, robots, redirect, allow list and unit test commands
- Value sourcing, "whether auth is configured on this deployment" from `publicEnvProblems()` · covered by the preview notice step against the production form step (vary the config, see both outcomes)
- AC-22 · covered by the robots, canonical, sitemap and Search Console steps
- AC-23 · covered by the two `/privacy` steps, the unit tests and the region mutation check
- AC-24 · covered by the `docs/deploy.md` read through, including the firewall settings (section 5) and the AC-18 finding (section 6)
- Value sourcing, "privacy policy, the Supabase region" from `supabase projects list` → `SUPABASE_REGION` · covered by comparing `pnpm exec supabase projects list` (`eu-central-1`) with the rendered `/privacy` text
- AC-5 · covered by the RLS listing, the own rows, cross user read, update, delete, forged insert, upsert, reassign and anon steps, and the cascade count after deletion
- AC-9, AC-17 · covered by the token decode and the JWKS step
- AC-14 · covered by the `/account` password change steps
- AC-16 · covered by the cookie step
- AC-18 · covered by the direct bucket shape step, the counted parallel burst with `/account`, and the recorded finding
- AC-19 · covered by the signed in and public bundle scans
- AC-20 · covered by the firewall overview, the burst, and the quick search error state
- Value sourcing, "AC-18 finding, which IP Supabase counts" · covered by counting how many of a one network burst through the app get through, against what one bucket on your address would allow
- Value sourcing, "AC-5, AC-17 checks, access tokens" from the password grant · covered by the token steps
- Value sourcing, "Vercel Firewall rule" settings · covered by the overview and the 60 then `429` burst
