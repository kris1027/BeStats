# Deploy and provider setup

## Goal

Put BeStats live on Vercel's free `vercel.app` address, backed by the existing Supabase Free project, with every migration and auth setting pushed from the repo. Production sends no email: sign up signs you in straight away, recovery shows a contact notice, and Google stays absent. Governed by spec 0018 (`docs/specs/0018-deploy-and-provider-setup/index.md`), scope feature 20, GA tier.

## Inspected

- Spec 0018 `index.md` (AC-1 to AC-24, build plan steps 1 to 6) and the scope row for feature 20.
- `app/(auth)/actions.ts` (`signUpAction` masks an existing address with `/check-email` and a timing pad; `resendConfirmationAction`, `requestPasswordResetAction`, `signInAction`), `app/(auth)/*` pages and forms, `lib/auth/messages.ts`, `lib/auth/action-state.ts`.
- `lib/env.ts` (`getPublicEnv()`, `publicEnvProblems()`), `next.config.ts` (`redirects()`), `proxy.ts`.
- `lib/legal/operator.ts` (`PROCESSORS`, `LEGAL_LAST_UPDATED`), `app/privacy/page.tsx` ("Transfers outside the EEA").
- `supabase/config.toml` (`enable_confirmations = true`, `site_url` and redirects on localhost), `supabase/migrations/` (20 files, no pgTAP dependency), `.github/workflows/checks.yml` (`checks` and `database` jobs; `database` skips steps, not the job), `.env.example`.
- Tooling on this machine: Vercel CLI 59 logged in as `kris1027`; `gh` logged in as `kris1027`; Supabase CLI `2.117.0` installed through `pnpm`, **not logged in**. No `vercel.json` and no `.vercel/` link yet.
- No design in `design/` covers the new notices; they reuse the existing auth panel (see Decisions).

## Skills used

`supabase` and `supabase-postgres-best-practices` (CLI link, `db push`, `config push`, RLS sweep), `next-dev-loop` (local runtime check of the no email strand), `vitest` (unit tests for the flag and the changed actions).

## Decisions and assumptions

1. **Order follows the spec's tracer bullet.** Step 1 (the thin remote thread) goes first, then the code strands. Each step that changes Vercel, GitHub or the cloud project is a separate go ahead from you when I reach it; approving this plan approves the code work and the order, not the remote commands themselves.
2. **Who runs what.** You run `pnpm exec supabase login` (it opens a browser), anything in the Supabase dashboard (JWT key rotation, test account creation and deletion), the Vercel Firewall rule, and Search Console. I can run, after your go ahead each time: `gh api` for branch protection, `vercel` CLI for the project link and environment variables, and `pnpm exec supabase link / db push / config push` once you are logged in. You may prefer to run any of those yourself; the runbook will list them either way.
3. **Region.** I read it from `supabase projects list` after you log in. If it is not an EU region, I stop (AC-3) and you create a new EU Free project; its ref replaces `kyatxtclyikcmkebjxan` everywhere.
4. **One pull request per build step**, all from `feat/...` branches, merged only after `checks` and `database` pass. This branch carries the spec and scope edits plus step 1.
5. **New notices reuse the existing auth panel** (the same card the sign in and forgot password pages use): heading as today, the AC-13 or AC-21 sentence as body copy, no form. No new component styles.
6. **Date boundary:** not relevant to this feature.

## Expected files

- New: `vercel.json` (`regions` only), `docs/deploy.md` (the AC-24 runbook), tests for `getAuthEmailDelivery()`, the `off` paths and the region constant.
- Changed: `supabase/config.toml` (`enable_confirmations = false`, `[remotes.production]`, leaked password and rate limit comments), `.env.example` (the flag), `lib/env.ts`, `app/(auth)/actions.ts` and `actions.test.ts`, `lib/auth/messages.ts`, `lib/auth/action-state.ts`, `app/(auth)/sign-in/*`, `sign-up/*`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `next.config.ts`, `proxy.ts` and its test, `lib/legal/operator.ts`, `app/privacy/page.tsx`, spec 0018 status line, scope feature 20 boxes.

## Requirements by step

1. **Thin thread (remote):** Vercel project `bestats` with Node 22 from the Git integration; branch protection on `main` (`checks` and `database` required, no direct pushes, admins included, no review); Supabase link, EU region and JWT key checks; `config push` diff read (AC-8 decides the `[remotes.production]` path or the swap fallback); `db push` with no seed; second `config push` clean; `vercel.json` region; AC-6 Production variables; a dashboard created test account signs in on production and a watched movie survives reload. AC-1 to AC-4, AC-6 to AC-9.
2. **No email strand (code):** `getAuthEmailDelivery()`; `signUpAction` signs in on a session, `alreadyRegistered` with a `Sign in instead` link, `signUpUnavailable` when no session and no error; resend and reset refuse on the server with no Supabase call; neutral unconfirmed copy; `Forgot password?` hidden inside the existing Suspense boundary; notices on `/forgot-password` and `/reset-password`; build time `/check-email` redirect. `on` path tests stub the flag `on`. AC-10 to AC-15.
3. **Previews:** "Sign in isn't available on this deployment." on `/sign-in` and `/sign-up` when `publicEnvProblems()` reports a gap; the proxy sends private paths to `/sign-in` with no Supabase call; Preview variables; a bypass token check. AC-6, AC-21.
4. **Legal, SEO, runbook:** `SUPABASE_REGION` plus its EU test, the rewritten Transfers section, Supabase's purpose without email, `LEGAL_LAST_UPDATED` bumped, `docs/deploy.md`, production `robots.txt`, canonical and sitemap checks. AC-22 to AC-24.
5. **Hosted security proof:** cookie flags, `exp - iat = 600`, `alg`, two user REST isolation, RLS sweep, bundle and HTML secret grep, firewall rule (or recorded blocker), then the AC-18 rate limit finding last, then test account deletion. AC-5, AC-9, AC-14, AC-16 to AC-20.
6. **Launch gate (you):** read `/privacy` and `/terms` on production, run `pnpm tmdb:live`.

## Security considerations

- No service role key, secret key or database password in Vercel, GitHub, `.env.example` or any committed file. The password help script in the runbook takes a pasted secret for one run only.
- Preview origins never enter the Supabase redirect allow list.
- `db push` never uses `--include-seed`; the verify fixtures never reach the cloud.
- Tokens for AC-5 and AC-17 come from the password grant endpoint with the publishable key, never from browser cookies, and are never written to a file or log.
- The flag only shapes UI and stops email calls; whether sign up signs someone in comes from Supabase's response.
- Known tradeoffs accepted by the spec: unproven addresses, sign up reveals registration, a possibly shared rate limit bucket.

## Acceptance criteria

Spec 0018 AC-1 to AC-24, verbatim. Feature done when: the deployed app signs users up and in with email and password against the cloud project with every migration applied, hosted auth settings match `supabase/config.toml`, environment variables target the intended projects, and no screen promises an email production can't send.

## Automated checks

After every code step: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (confirming `/sign-in`, `/sign-up`, `/shows`, `/movies` keep prerendered shells). After `config.toml` changes: `pnpm test:db` against a freshly reset local stack. CI runs `checks` and `database` on each pull request.

## Manual test steps

1. Open the production origin: `/shows`, `/movies` and a title page show TMDB data.
2. Sign up with a new address: you land signed in on `/shows`, no `/check-email`. Mark a movie watched, reload, it stays.
3. Sign up again with the same address: "An account with this email already exists." plus a `Sign in instead` link; no session.
4. `/sign-in` shows no `Forgot password?`; `/forgot-password` and `/reset-password` show the contact notice; `/check-email` redirects to `/sign-in`.
5. `/account`: change the password with the current one; sign out and back in with the new one.
6. In DevTools, every `sb-` cookie is `HttpOnly` and `Secure`; `document.cookie` has none.
7. Open a preview with a bypass token: catalog works, `/sign-in` shows the unavailable notice, `/watchlist` redirects, `robots.txt` disallows all.
8. `/robots.txt`, a canonical link and `/sitemap.xml` on production use the production origin and list titles.
9. Run the `docs/deploy.md` checks for isolation, token lifetime, bundle secrets, the `/api/search` burst and, last, the rate limit finding.
