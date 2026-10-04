# 0018. Deploy and provider setup: Vercel and the existing Supabase Free project, email and password without confirmation, email delivery and Google deferred

**Date**: 2026-10-03
**Status**: Accepted

Scope feature: [20. Deploy and provider setup](../../scope/scope.md) · GA tier

## Summary

BeStats goes live on Vercel's free `vercel.app` address, backed by the existing Supabase cloud project on the Free plan. Every migration and every auth setting reaches the cloud from the repo (`supabase db push` and `supabase config push`, run by you from a written runbook), and a merge to `main` deploys once the checks pass. Production sends no email at all for now: sign up signs you in right away with no confirmation step, password recovery shows a "not available yet, write to us" notice, and Google sign in stays absent. Both real email and Google move under Deferred, together, because Google linking is only safe once addresses are confirmed.

## Requirements

**User stories**:
- As a visitor, I want to open the real BeStats address and browse the catalog, so I can use the app without running it myself.
- As a new user, I want to sign up with an email and password and be signed in straight away, so I can start tracking without waiting for an email that production can't send yet.
- As a user who forgot my password, I want an honest notice telling me how to get help, not a form that pretends to send something.
- As the operator, I want every database and auth setting in the cloud to come from the repo through a written runbook, so production can be rebuilt and nothing drifts silently.

**Acceptance criteria** (the contract). "The production project" means `kyatxtclyikcmkebjxan`, or the new EU project AC-3 creates; `<ref>` stands for its project ref everywhere below.

*Deployment and projects*
- **AC-1**: A push to `main` deploys to production through Vercel's Git integration at the recorded production origin (`https://bestats.vercel.app`, or the alias Vercel assigns if that name is taken). The Vercel project's Node version is set to 22 (matching CI), the build runs `pnpm build` with the committed lockfile and the pinned `packageManager` pnpm version, and serverless functions run in the Vercel region closest to the Supabase region (for example `fra1` for `eu-central-1`), pinned in a committed `vercel.json` `regions` entry. `/shows`, `/movies` and a title page render real TMDB data there.
- **AC-2**: GitHub branch protection on `main` requires the `checks` and `database` jobs of `.github/workflows/checks.yml` to pass before a pull request can merge, blocks direct pushes, includes administrators, and requires no approving review (you work alone). It is on before the first code change of this feature merges. The `database` job always reports a status, because its steps, not the job, are skipped when no `supabase/**` file changes.
- **AC-3**: The production project sits in an EU region. The region of an existing project can't change, so if `kyatxtclyikcmkebjxan` is outside the EU, the build stops before any migration is pushed, you create a new Free project in an EU region, and its ref replaces the old one everywhere this spec, `supabase/config.toml` and `docs/deploy.md` name it.
- **AC-4**: `supabase migration list --linked` shows every file in `supabase/migrations/` applied on the production project, with local and remote identical. No seed data reaches the cloud: `db push` never runs with `--include-seed`, and neither `user-a@example.test` nor `user-b@example.test` exists there. Every extension the migrations enable is available on the hosted project, and no migration depends on pgTAP (which only `supabase test db` uses locally).
- **AC-5**: Every table in the cloud `public` schema has Row Level Security enabled, and two real test accounts on the production project cannot read or change each other's watchlist, movie state, episode state, ratings or show status, including through a direct REST request carrying one user's access token and asking for the other's rows. The tokens come from `POST <supabase url>/auth/v1/token?grant_type=password` with the publishable key, never from the browser's `HttpOnly` cookies (`AGENTS.md` section 11, scope feature 19's sweep repeated against the cloud).
- **AC-6**: Vercel's Production environment holds exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (both for `<ref>`), `TMDB_READ_ACCESS_TOKEN`, `NEXT_PUBLIC_SITE_URL` set to the production origin with no trailing slash, and `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=off`. The Preview environment holds only `TMDB_READ_ACCESS_TOKEN` and `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=off`. No environment holds a Supabase service role key, a secret key or a database password, and no TMDB value carries a `NEXT_PUBLIC_` prefix.

*Hosted auth configuration*
- **AC-7**: `supabase config push`, run with the Supabase CLI pinned at `2.117.0` (the version CI uses), is the only way auth settings reach the production project. The first push's diff is read before accepting and recorded in `docs/deploy.md`; a second push afterwards shows no differences, apart from fields recorded there as accepted (a value the hosted Free plan normalises or refuses, such as `email_sent` without custom SMTP). The hosted project then carries: `enable_confirmations = false`, `enable_signup = true`, `minimum_password_length = 8`, `jwt_expiry = 600`, `sign_in_sign_ups = 30`, `token_refresh = 150`, `secure_password_change = false`, `site_url` equal to the production origin, and `additional_redirect_urls` equal to `["<origin>/auth/callback", "<origin>/**"]`. Google and every other external provider stay disabled.
- **AC-8**: The local stack mirrors production: `supabase/config.toml` sets `enable_confirmations = false`, and the only production differences live in a `[remotes.production]` block with `project_id = "<ref>"` and a `[remotes.production.auth]` table holding `site_url` and `additional_redirect_urls`. Before the first real push, `supabase config push` is run and its diff must show the production origin, not `localhost`. If it shows `localhost`, the CLI ignores the block, and the fallback is: replace the two values in `config.toml` with the production ones for the push only, push, then restore the local values without committing the swap. `docs/deploy.md` records which path is in use. Never set those two values in the dashboard, because the next push would overwrite them.
- **AC-9**: The production project signs access tokens with an asymmetric key (ES256 or RS256), so `getClaims()` verifies them without a network call. If it still used the legacy shared secret, it is migrated (standby key created, then rotated) before the first real user exists. Proven by the token header's `alg` and a key served at `<supabase url>/auth/v1/.well-known/jwks.json`.

*Sign up and recovery without email*
- **AC-10**: `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` is read only through a new `getAuthEmailDelivery()` in `lib/env.ts`, separate from `getPublicEnv()` so it works on a deployment with no Supabase variables (previews). It returns `on` or `off`; unset or empty means `off`; any other value throws an error naming the variable and never its value. Because `NEXT_PUBLIC_` values are inlined at build, changing the flag takes a redeploy.
- **AC-11**: Signing up with a new address and a valid password creates the account, signs the person in immediately, and redirects to the validated `next` path, or `/shows` when there is none. No `/check-email` step appears. This holds on the local stack and in production. If the flag is `off` but Supabase returns neither a session nor an error (confirmation still on in the cloud, for example a config push not yet run), the form shows `Sign up is unavailable right now. Please try again later.`, logs the mismatch without the address, and never routes to `/check-email`.
- **AC-12**: Signing up with an address that already has an account, while the flag is `off`, creates no session, changes nothing on the existing account, and shows `An account with this email already exists.` followed by a `Sign in instead` link to `/sign-in` carrying the same validated `next`. `AuthActionState` gains an optional link field for this, rendered by the sign up form. While the flag is `on`, the masked behaviour of spec 0005 AC-2 (the `/check-email` landing and its timing pad) is unchanged.
- **AC-13**: While the flag is `off`, nothing promises or sends an email:
  - `/sign-in` shows no `Forgot password?` link. The flag is read inside the existing Suspense boundary, so `/sign-in` keeps its prerendered shell.
  - `/forgot-password` and `/reset-password` render, inside the existing auth panel and with no form, `Password recovery by email isn't available yet. If you can't sign in, write to <CONTACT_EMAIL> from the address on your account and we'll help.`, with the address taken from `lib/legal/operator.ts`.
  - `/check-email` redirects to `/sign-in` through a build time rule in `redirects()` in `next.config.ts`, added only when the flag is `off`, so no page streams a redirect after a 200.
  - `resendConfirmationAction` and `requestPasswordResetAction` refuse on the server with the recovery notice copy and call no Supabase email API, even when posted to directly.
  - Sign in copy that mentions email is neutral: the unconfirmed address outcome says `This account can't sign in yet. Write to <CONTACT_EMAIL> for help.` and offers no resend.
  - `/auth/callback` is unchanged; with no email sent, nothing reaches it.

  While the flag is `on`, every one of these behaves exactly as spec 0005 describes. Existing tests that cover the `on` path stub the flag to `on`, and new tests cover `off`.
- **AC-14**: The change password form on `/account` still works for an email account in production: it requires the current password, applies the eight character rule, and saves the new one.
- **AC-15**: The Google button and its divider stay absent from `/sign-in` and `/sign-up`, as spec 0005 left them. No Google provider, client ID or secret exists in the repo, Vercel or the cloud project.

*Hosted security checks inherited from spec 0005*
- **AC-16**: On the production `https` origin, after a fresh sign in with the cookie jar cleared, every `sb-` cookie carries both `HttpOnly` and `Secure`, and `document.cookie` holds no `sb-` cookie (spec 0005 AC-25).
- **AC-17**: An access token issued by the production project lives 600 seconds: its `exp` minus its `iat` is 600, read from a token obtained as AC-5 describes.
- **AC-18**: Before relying on Supabase's IP keyed limits, the build establishes which IP address Supabase counts for a sign in made from a Server Action on Vercel: the visitor's (through a forwarded client IP header the hosted Auth server honours), or Vercel's own outbound address. The result is recorded in `docs/deploy.md`. The bucket that limits a password sign in is `token_refresh`, not `sign_in_sign_ups`: Supabase Auth applies the `token_refresh` limiter to every `/token` grant, password and session refresh alike, as a token bucket (burst 30, one try back every 2 seconds at 150 per five minutes), while `sign_in_sign_ups` covers sign ups, recovery, OTP and `PUT /user`. Either way, once that bucket is drained, the next attempt shows the rate limited copy, not a generic failure, and wrong current passwords on `/account` draw on the same bucket (spec 0005 AC-16 and AC-18, runtime half). If Supabase counts Vercel's address, the limit is effectively shared by every visitor; that is accepted for now, the shared rate limit risk is written into Consequences, and the comment beside `token_refresh` in `config.toml` says so. This is checked last, because a drained bucket blocks your own sign ins until it refills (about a minute).
- **AC-19**: The production browser bundle and served HTML contain no TMDB token, no service role or secret key, and no access or refresh token. The publishable key is the only Supabase credential present (spec 0005 AC-22, repeated on the deployed build).

*Public endpoint, previews and search engines*
- **AC-20**: A Vercel Firewall rate limit rule answers `429` once one IP address sends more than 60 requests to `/api/search` within 60 seconds. The navbar quick search treats any response that isn't OK, JSON body or not, as its existing error state, and an ordinary typing session never trips the rule. If the Hobby plan doesn't offer a rate limit rule, this criterion is reported blocked, the reason is recorded, and the per IP limit goes back under Deferred.
- **AC-21**: A preview deployment, opened by a signed in Vercel team member or with a protection bypass token (Vercel's default deployment protection stays on, so anonymous visitors get Vercel's login wall), renders the public catalog (`/shows`, `/movies`, `/search`, a title page) with TMDB data, shows the signed out navbar, and serves a `robots.txt` that disallows everything. With no Supabase variables, `/sign-in` and `/sign-up` show `Sign in isn't available on this deployment.` instead of a form, and the proxy sends every private path to `/sign-in` without calling Supabase. No preview origin appears in the Supabase redirect allow list.
- **AC-22**: On production, `robots.txt` allows crawling and names `<origin>/sitemap.xml`, canonical URLs and share cards use the production origin, and `/sitemap.xml` lists the static routes plus title entries. A sitemap with no title entries right after a deploy (a TMDB outage at build time) is caught by the runbook check and fixed by redeploying.

*Legal and operations*
- **AC-23**: The privacy policy describes production as it is:
  - `lib/legal/operator.ts` gains `SUPABASE_REGION = { code, name }` (for example `{ code: "eu-central-1", name: "Frankfurt, Germany" }`), and a test fails unless the code starts with `eu-`.
  - The "Transfers outside the EEA" section says your data is stored and processed in the EU (the database in `SUPABASE_REGION.name`, the app's functions in the matching Vercel region), and that Supabase and Vercel are US companies whose access for support and operations is covered by the EU Standard Contractual Clauses.
  - Supabase's `PROCESSORS` purpose no longer mentions sending emails, the "To send the emails your account needs" use is removed, no Google or email provider is added, and `LEGAL_LAST_UPDATED` is bumped. `lib/legal/boundary.test.ts` still passes.
- **AC-24**: `docs/deploy.md` exists and covers, as steps you may run or skip:
  - Linking the CLI at version `2.117.0`, plus the EU region and JWT key checks.
  - `supabase db push` before merging any pull request that adds a migration.
  - `supabase config push` with its diff review, the recorded accepted differences, and which AC-8 path is in use.
  - The Vercel environment variables per environment, plus the note that a flag change needs a redeploy.
  - Branch protection, and the firewall rule's exact settings.
  - The finding from AC-18.
  - Restoring a paused Free project.
  - Rolling back: Vercel Instant Rollback for code, a new forward migration for schema, a push of the previous `config.toml` for auth settings.
  - Running `pnpm tmdb:live` before a release, checking `/sitemap.xml` after a deploy, and submitting the sitemap in Google Search Console.
  - The legal read through gate from spec 0017.
  - Manual password help: how you check that a request plausibly comes from the account owner (it arrives from the account's address, and the sender can name titles on their watchlist, since addresses are unproven), and how you set a temporary password with a one off local script that calls the Supabase Admin API (`auth.admin.updateUserById`) with a secret key you paste in for that run only, never stored in the repo, Vercel or a file.

## Decision

**Chosen option**: Option 2: Production on Vercel and the existing Supabase Free project, configured from the repo, with email and Google deferred and confirmation switched off.

You deploy through Vercel's Git integration behind branch protection, push migrations and auth settings from the repo by hand through a runbook, and launch with email and password accounts that need no confirmation, while email delivery and Google sign in wait together under Deferred.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) · `vitest` (`.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
No schema change and no new migration. The cloud database receives the twenty existing migrations in `supabase/migrations/` unchanged. Accounts created while confirmation is off get `email_confirmed_at` set by Supabase at sign up; nothing in `public` stores anything new. Deleting a test account in the dashboard removes its rows through the existing `on delete cascade` foreign keys to `auth.users`, which step 5 confirms with a count before and after.

**State transitions**:
The email delivery flag has two states, and only an environment change plus a redeploy moves between them.
- `off` (the default, local and production today): sign up returns a session; recovery, resend and check email surfaces show a notice, refuse, or redirect; an existing address gets the plain "already exists" copy.
- `on` (when the deferred email work lands, together with `enable_confirmations = true` and an SMTP provider): every surface behaves as spec 0005 describes.

**API surface**:
| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `signUpAction` (changed) | Server Action | `email:string` (req), `password:string` (req), `next:string` (opt) | session returned: redirect to `safeNextPath(next)`. No session, flag `on`: redirect to `/check-email` (unchanged) | none | invalid input, short password, rate limited; flag `off`: `alreadyRegistered` with a sign in link, or `signUpUnavailable` when no session and no error |
| `resendConfirmationAction`, `requestPasswordResetAction` (changed) | Server Action | unchanged | flag `off`: refusal with the recovery notice copy, no Supabase call | none | none new |
| `signInAction` (copy change) | Server Action | unchanged | unchanged | none | flag `off`: neutral unconfirmed copy, no resend offer |
| `/sign-in`, `/sign-up` (changed) | page | unchanged | `Forgot password?` only when the flag is `on`; with incomplete Supabase env, the "not available on this deployment" notice instead of a form | none | none |
| `/forgot-password`, `/reset-password` (changed) | page | none when the flag is `off` | the AC-13 notice, no form | none | none |
| `/check-email` (changed) | redirect rule | `email`, `next` | flag `off`: `redirects()` sends it to `/sign-in`; flag `on`: unchanged page | none | none |
| `proxy.ts` (changed) | middleware | request path | incomplete Supabase env and a private path: redirect to `/sign-in` with no Supabase call | none | none |
| `/api/search` (unchanged code) | GET | `type`, `q` | as spec 0010 | none | new: `429` from the Vercel Firewall before the handler runs |
| `supabase db push` | CLI, run by you | linked project | migrations applied | your Supabase CLI login, on your machine only | a failing migration stops the push; fix forward |
| `supabase config push` | CLI, run by you | `supabase/config.toml` plus `[remotes.production]` | hosted settings | same | an unexpected diff: cancel and investigate |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Vercel production build | the production origin | the alias Vercel assigns to project `bestats` at creation (build step 1), recorded in `docs/deploy.md` and set as `NEXT_PUBLIC_SITE_URL` and `[remotes.production.auth]` `site_url` |
| Vercel production build | Supabase URL and publishable key | the production project's dashboard (Project Settings, API Keys), pasted into Vercel's Production environment |
| Vercel production build | function region | the Vercel region nearest `SUPABASE_REGION.code`, committed in `vercel.json` |
| every flag reader | whether email is delivered | `getAuthEmailDelivery()` over `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY`, unset or empty meaning `off` |
| `signUpAction` | whether to sign in, go to `/check-email`, or fail | `data.session` and `error` returned by `supabase.auth.signUp`, combined with the flag as the API table says |
| `signUpAction` | whether an address already exists | the `user_already_exists` code (or the empty identities shape) the action already detects |
| sign up form | the "already exists" copy and link | a new `alreadyRegistered` entry in `lib/auth/messages.ts`; link `/sign-in?next=<safeNextPath(next)>` in the new optional link field of `AuthActionState` |
| recovery notice, unconfirmed copy | the contact address | `CONTACT_EMAIL` in `lib/legal/operator.ts` |
| `/sign-in`, `/sign-up`, proxy | whether auth is configured on this deployment | `publicEnvProblems()` (existing) |
| privacy policy | the Supabase region | `supabase projects list` output read at build step 1, stored as `SUPABASE_REGION` in `lib/legal/operator.ts` |
| hosted auth settings | every value AC-7 lists | `supabase/config.toml`, with `[remotes.production.auth]` (or the AC-8 fallback) for the origin dependent two |
| AC-18 finding | which IP Supabase counts | observed at build step 5: a burst of wrong sign ins sent through the production app from one network, counting how many get through. One bucket keyed on the visitor's address lets through at most its burst plus its refills in the window (about 40 in 20 seconds, from the burst of 30 and the 2 second refill measured on the hosted project by the direct `/token` step in `verify.md`); clearly more means the limit is not keyed on one address tied to the visitor. That Vercel spreads the calls over a few outbound addresses is an inference, and the bucket count an estimate (successes divided by about 40, so 2 to 3 for about 100). Assumes the buckets sat idle for at least a minute before the burst |
| AC-5, AC-17 checks | access tokens | the password grant endpoint with the publishable key |
| Vercel Firewall rule | path, limit, window, key, action | this spec: `/api/search`, 60 requests, 60 seconds, per IP, respond `429` |
| robots and canonicals | indexable or not | `VERCEL_ENV` set by Vercel plus `NEXT_PUBLIC_SITE_URL` (spec 0016) |

**Key invariants**:
- The cloud project's schema comes only from `supabase/migrations/` through `supabase db push`, and its auth settings only from `supabase/config.toml` through `supabase config push`. No dashboard change to either. The only dashboard steps are the ones the CLI can't do: the JWT signing key rotation, restoring a paused project, and deleting test accounts.
- A pull request that adds a migration merges only after you have pushed that migration to the cloud. Migrations stay backward compatible with the code currently live, so "push migration, then merge" never breaks production.
- The flag only hides or shows UI and stops the email actions. Whether sign up signs someone in comes from what Supabase returned, so a flag and config that disagree can never fake a success (AC-11).
- No credential that bypasses Row Level Security exists anywhere the app can read it: not in Vercel, not in GitHub, not in `.env.example`, not in a committed file. The one off password help script takes the secret key as a pasted input for a single run.
- Preview origins never enter the redirect allow list, so no auth link can send a user to unmerged code.
- `.env.example` documents every variable Vercel holds, with placeholders only.
- Pages that read the flag keep their prerendered shells: the flag is read inside existing Suspense boundaries or at build time in `next.config.ts`, never in a way that makes a route dynamic.

**Security model**:
Personal data in scope: email addresses, password hashes held by Supabase Auth, and private tracking history, under GDPR with the operator as controller in Poland, stored and processed in the EU (AC-23). Ownership stays enforced by Row Level Security from spec 0001, now proven against the cloud (AC-5). Confirmation off means an address is unproven: anyone can sign up with someone else's address, which also lets them claim it first so its real owner can't sign up with it. The harm is bounded today, because no email is ever sent to that address and nothing else trusts it, and manual password help asks for more than the address (AC-24). It becomes an account takeover path only once Google linking exists, which is why Google waits for email. Signing up reveals whether an address has an account (AC-12). Supabase's sign in limit may be shared by all visitors rather than per visitor (AC-18), which trades brute force protection for a shared rate limit: one person sending wrong passwords quickly can make other visitors' sign ins fail while they keep sending. No new mutation touches money or access control; Supabase's auth audit log on the hosted project records sign ins and sign ups.

**Configuration required**:
- `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY`: `on` or `off`, unset or empty meaning `off`. Says whether this deployment can deliver auth emails. Read by `getAuthEmailDelivery()` in `lib/env.ts` and documented in `.env.example`.
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `TMDB_READ_ACCESS_TOKEN`: existing, now set per environment as AC-6 lists.
- `supabase/config.toml`: `enable_confirmations = false`, the `[remotes.production]` block, a comment that leaked password protection needs the Pro plan, and the AC-18 finding beside `[auth.rate_limit]`.
- `vercel.json`: the `regions` entry only.
- Accounts you set up by hand: a Vercel Hobby project named `bestats` linked to `kris1027/BeStats` with Node 22, a Supabase CLI login on your machine, and GitHub branch protection on `main`.

**Critical test scenarios**:
- Happy path: on the production site, sign up with a new address, land signed in on `/shows`, mark a movie watched, reload, and see it kept, verifies **AC-1**, **AC-4**, **AC-11**
- Failure case: sign up again with the same address and get the plain "already exists" copy with a sign in link and no session, verifies **AC-12**
- Failure case: with the flag `off` and a Supabase stub that returns no session and no error, the form shows "Sign up is unavailable right now" and never routes to `/check-email`, verifies **AC-11**
- Failure case: posting directly to the resend or reset action with the flag `off` makes no Supabase email call, verifies **AC-13**
- Failure case: rapid scripted calls to `/api/search` get `429` and the quick search shows its error state, verifies **AC-20**
- Failure case: exhausting the sign in bucket produces the rate limited copy, verifies **AC-18**
- Auth/permission: user A's token asking the REST API for user B's rows gets none, and writing to them fails, verifies **AC-5**
- Auth/permission: the bundle and HTML hold no secret key and no TMDB token, verifies **AC-19**
- Preview: with no Supabase variables, `/sign-in` shows the unavailable notice and `/watchlist` redirects without a Supabase call, verifies **AC-21**
- Unit: `getAuthEmailDelivery()` returns `off` for unset and empty, `on` and `off` as given, and throws naming the variable otherwise; the region constant test; the `on` path tests still pass with the flag stubbed `on`, verifies **AC-10**, **AC-13**, **AC-23**

## Build plan

Ordered as a Tracer Bullet: the first slice pushes one thin real thread through every layer (repo, cloud database, hosted auth, Vercel, a real signed in write) before any strand is thickened. Every step marked **remote** changes the cloud project, Vercel or GitHub and needs your explicit go ahead when `/develop` reaches it (`AGENTS.md` section 12).

1. **Thin thread to production (remote).**
   - Create the Vercel project `bestats` through the Git integration, set Node 22, and note the production alias it assigns.
   - Turn on branch protection for `main` as AC-2 describes.
   - Run `supabase login` and `supabase link --project-ref kyatxtclyikcmkebjxan` with the pinned CLI. Read the region from `supabase projects list`; if it isn't in the EU, stop and follow AC-3.
   - Check the JWT signing key type and migrate to an asymmetric key if it is legacy.
   - Set `enable_confirmations = false` in `supabase/config.toml` and add `[remotes.production]` with the real alias, then run `supabase config push` and read the diff (AC-8 decides the path). Run `supabase db push`, then a second `config push` to see no unaccepted differences.
   - Commit `vercel.json` with the matching function region in the same pull request as `config.toml` (`.env.example` gets the flag there too), set the AC-6 Production variables, and merge so it deploys.
   - On the live site, sign in with a test account created in the dashboard (not through sign up, which still points at `/check-email` until step 3) and mark a movie watched, then reload.

   Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
2. **The no email strand (code, local first).**
   - Add `getAuthEmailDelivery()` to `lib/env.ts`.
   - Change `signUpAction` as the API table says, with the `alreadyRegistered` link field and the `signUpUnavailable` outcome, and add both messages to `lib/auth/messages.ts`.
   - Make `resendConfirmationAction` and `requestPasswordResetAction` refuse with the flag `off`, and neutralise the unconfirmed sign in copy.
   - Hide `Forgot password?` inside the existing Suspense boundary, render the recovery notice on `/forgot-password` and `/reset-password`, and add the conditional `/check-email` rule to `redirects()`.
   - Stub the flag `on` in the existing tests of those paths, and add `off` tests for every changed surface.
   - Confirm `pnpm build` still reports `/sign-in`, `/sign-up`, `/shows` and `/movies` with prerendered shells.
   - Verify in the running local app (now mirroring production) with `next-dev-loop`, then merge so it deploys, and sign up for real on production.

   Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**, **AC-15**.
3. **Previews (code plus remote).** Make `/sign-in` and `/sign-up` show the unavailable notice, and make the proxy send private paths to `/sign-in`, both when `publicEnvProblems()` reports a gap; unit test both. Set the Preview variables, open a preview of a throwaway branch with a bypass token, and check the catalog, the signed out navbar, the notice and the disallowing `robots.txt`. Satisfies **AC-6**, **AC-21**.
4. **Legal, SEO and the runbook (code plus remote).**
   - Add `SUPABASE_REGION` and its EU test to `lib/legal/operator.ts`, rewrite the Transfers section, update Supabase's `PROCESSORS` purpose, and bump `LEGAL_LAST_UPDATED`.
   - Write `docs/deploy.md` with every AC-24 step, including the recorded config diff and the AC-8 path in use.
   - After the deploy, check `robots.txt`, a canonical and `/sitemap.xml` on production, and submit the sitemap in Search Console.

   Satisfies **AC-22**, **AC-23**, **AC-24**.
5. **Hosted security proof (remote; ordered so the rate limit runs last).**
   - Check `sb-` cookie flags after a fresh sign in.
   - Get two users' tokens from the password grant endpoint, then decode one for `exp` minus `iat` and `alg`, and run the two user isolation check through the REST API.
   - List the `public` tables and their RLS state, and grep the production bundle and HTML for secret shapes.
   - Confirm the Hobby plan offers a Firewall rate limit rule. If so, add it as AC-20 describes and prove it with a short scripted burst plus a normal typing session; if not, record the blocker.
   - Then establish the AC-18 finding and drain the password sign in bucket (`token_refresh`) through the app, including through `/account`'s current password field, and record the finding in `docs/deploy.md` and `config.toml`.
   - Finally delete the test accounts in the dashboard and confirm their rows are gone.

   Satisfies **AC-5**, **AC-9**, **AC-14**, **AC-16**, **AC-17**, **AC-18**, **AC-19**, **AC-20**, **AC-24**.
6. **Launch gate (you).** Read `/privacy` and `/terms` in full on production and adjust anything untrue (spec 0017's release blocker), and run `pnpm tmdb:live` once. Satisfies **AC-23**, **AC-24**.

## Consequences

**Positive**:
- BeStats is reachable on a real `https` origin, and the security properties earlier specs could only unit test (`Secure` cookies, hosted rate limits, token lifetime, RLS on the cloud) get proven live.
- The cloud project can be rebuilt from the repo: schema from migrations, auth from `config.toml`, the rest from `docs/deploy.md`.
- Data and compute both stay in the EU.
- No new provider, no new processor, no new secret in GitHub, and $0 a month.
- Local and production behave the same, so what you test locally is what users get.

**Negative / tradeoffs**:
- Anyone can sign up with an address they don't own, or claim a real person's address first. Nobody is told, because nothing is emailed. Those accounts keep `email_confirmed_at` set forever, so when Google sign in returns, Supabase could link a Google login to such an account. The deferred work must guard against that even after confirmation is switched back on.
- Sign up reveals whether an address is registered (AC-12). This reverses spec 0005 AC-2's masking in production.
- If Supabase counts Vercel's address rather than the visitor's (AC-18), one person sending wrong passwords quickly makes some sign ins, current password checks and session refreshes fail for everyone for as long as they keep sending (each bucket lets one try through every 2 seconds). Sign ups use the separate `sign_in_sign_ups` bucket. Because Vercel spreads the calls over a few addresses, one person also gets a few buckets, so brute force protection is a few times looser than one bucket. Ordinary traffic barely competes: with `jwt_expiry = 600`, a signed in visitor's session refresh costs about one try per 10 minutes, far below 150 per five minutes per bucket.
- A forgotten password can only be fixed by writing to you, and the fix is a manual script run with a secret key, guarded only by a weak ownership check.
- Spec 0005 AC-1, AC-2, AC-3, AC-6, AC-7, AC-8, AC-23 and AC-24 describe the dormant `on` path; in production today they don't apply. Its local browser steps for confirmation and recovery can't run while local mirrors production, so only unit tests guard that path until email returns.
- Spec 0005 AC-9's breach refusal can never be verified on Free: leaked password protection is a Pro plan feature.
- The Free project pauses after about a week without activity, and while paused every private page fails until you restore it by hand. There are no automatic backups.
- Migrations and config pushes depend on you following the runbook order. A forgotten `db push` means a deploy whose code expects a table that isn't there yet.
- Changing the email flag takes a redeploy, not just an environment edit.
- Vercel's Hobby plan is for non commercial use only, which matches BeStats today but constrains it later.
- The firewall rule lives in Vercel's dashboard, not the repo; `docs/deploy.md` is its only record.

**Neutral**:
- Google stays absent, which keeps spec 0005's recorded divergence from the sign in artboard in place.
- Error monitoring and analytics stay deferred; you have Vercel's runtime logs (short retention on Hobby) and Supabase's logs.
- `secure_password_change` stays off until email returns, because its fallback is an emailed code.
- Previews are visible only to you and anyone you give a bypass token.

## Follow-up

- [ ] Scope: narrow feature 20's done when line to email and password without confirmation (done at spec capture), and replace the `/api/search` Deferred line with the result of build step 5.
- [ ] Scope Deferred, one line (agreed): **Email delivery and Google sign in**. An SMTP provider (a domain of your own, or Gmail SMTP), `enable_confirmations = true` and the flag `on`, password recovery back, a full browser pass of spec 0005's email steps, the Google button restored, a pre account takeover guard for accounts created while confirmation was off, `secure_password_change = true`, Google and the email provider added to `PROCESSORS`, and leaked password protection if you move to Pro.
- [ ] If AC-18 finds a shared bucket, consider a Vercel Firewall rule on sign in and sign up posts per IP when the plan allows a second rule, or forwarding the client IP if Supabase adds a supported way.
- [ ] `/sync` should mark spec 0005 as partly changed by this spec (sign up, recovery and AC-2 masking in production), and add `docs/deploy.md`, `vercel.json`, `getAuthEmailDelivery()` and the flag to the root `AGENTS.md` repo facts.
- [x] Spec 0005 AC-18 and the `[auth.rate_limit]` comment in `supabase/config.toml` corrected (2026-10-04): password sign ins draw on `token_refresh`, not `sign_in_sign_ups`.
- [ ] Spec 0005's follow up on Supabase linking identities by verified email moves to the deferred Google work, where it matters.
- [ ] Revisit the Free plan if pausing or the missing backups bite, or before inviting more than a handful of users.
