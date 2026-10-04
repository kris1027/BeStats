# Deploying BeStats

This is the runbook for production, written for you, the operator. Every step is a recommendation you may run or skip. It follows spec [0018](specs/0018-deploy-and-provider-setup/index.md): Vercel hosts the app, the existing Supabase Free project holds the data, and everything Supabase knows comes from this repo.

Steps that change Vercel, GitHub or the Supabase project are marked **remote**. Run them yourself from your own terminal. The Supabase CLI applies `db push` and `config push` without asking when an agent shell runs it, so never ask an agent to run one "just to see the diff".

## The facts

| What | Value | Where it is set |
|---|---|---|
| Production origin | `https://bestats-sable.vercel.app` | assigned by Vercel to project `bestats`; repeated in `NEXT_PUBLIC_SITE_URL` and `[remotes.production.auth]` |
| Supabase project | `kyatxtclyikcmkebjxan` (name `BeStats`, Free plan) | `[remotes.production]` in `supabase/config.toml` |
| Supabase region | `eu-central-1`, Frankfurt | `SUPABASE_REGION` in `lib/legal/operator.ts` |
| Vercel function region | `fra1`, Frankfurt | `regions` in `vercel.json` |
| Supabase CLI | `2.117.0`, run as `pnpm exec supabase` | `package.json`, and the `database` job in `.github/workflows/checks.yml` |
| Node | 22 | the Vercel project settings, and CI |
| Access token signing | ES256 (asymmetric) | Supabase dashboard, JWT Keys |

## 1. Link the CLI and check the project (remote, read only)

1. Log in once: `pnpm exec supabase login`. It opens a browser.
2. Link the repo: `pnpm exec supabase link --project-ref kyatxtclyikcmkebjxan`.
3. Check the region: `pnpm exec supabase projects list` should show `eu-central-1`. A region can't change. If you ever move to a new project, create it in an EU region, then replace the ref in `supabase/config.toml`, `SUPABASE_REGION` and this file.
4. Check the signing key: `curl https://kyatxtclyikcmkebjxan.supabase.co/auth/v1/.well-known/jwks.json` should list a key with `"alg":"ES256"` (or `RS256`). If it lists none, the project still uses the legacy shared secret: in the dashboard, under JWT Keys, create a standby asymmetric key and rotate to it before any real user signs up.

Checked on 2026-10-04: region `eu-central-1`, one `ES256` key served.

## 2. Push migrations before you merge them (remote)

A pull request that adds a file to `supabase/migrations/` should merge only after the migration is on the cloud project. Migrations stay backward compatible with the code that is live, so "push, then merge" never breaks production.

1. Check what is pending: `pnpm exec supabase migration list --linked`. Local and remote columns should match apart from your new file.
2. Push: `pnpm exec supabase db push`. Never add `--include-seed`. The seed users `user-a@example.test` and `user-b@example.test` exist only on your local stack.
3. Run `migration list --linked` again. Every row should show the same version on both sides.
4. Merge the pull request.

Checked on 2026-10-04: all 20 migrations applied, local and remote identical.

## 3. Push auth settings from `config.toml` (remote)

Auth settings reach the cloud only through `pnpm exec supabase config push`. Never change them in the dashboard: the next push overwrites them, and the repo would stop describing production.

**How the production values get in.** The local stack and production share every setting in `supabase/config.toml` except two: `site_url` and `additional_redirect_urls`. Those live in the `[remotes.production.auth]` table, which the CLI merges in when the linked ref matches `[remotes.production] project_id`. This is the path in use (spec 0018 AC-8, first option). If a push diff ever shows `localhost` for either value, the CLI ignored the block: cancel, swap the two values in `[auth]` for the production ones, push, then restore the local values without committing the swap, and note it here.

**Routine.**
1. Run `pnpm exec supabase config push` in your own terminal and read the diff before you answer.
2. Accept only changes you made in `config.toml` on purpose. Anything else, cancel and investigate.
3. Run it a second time. It should report no differences, except the accepted ones below.

**What the hosted project carries** (checked on 2026-10-04 through the public `auth/v1/settings` endpoint where it exposes them): sign up enabled, confirmation off (`mailer_autoconfirm: true`), only the email provider enabled. From `config.toml`: `minimum_password_length = 8`, `jwt_expiry = 600`, `sign_in_sign_ups = 30`, `secure_password_change = false`, and the production `site_url` and redirect list above. Google and every other external provider stay disabled.

**Accepted differences.** The first push ran on 2026-10-04 from an agent shell, which applied it without stopping at the prompt, so its diff was never read. You ran the push again yourself later that day, and it wrote nothing: API, database and storage settings were up to date, and auth had only the difference below. `pnpm exec supabase config diff` (read only, safe to run any time) lists the same three differences. All three are accepted:
- `auth.sms.twilio.enabled`: `false` here, `true` on the hosted project. The CLI can switch SMS providers but can't turn the active one off. Harmless, because phone sign up is off (`[auth.sms] enable_signup = false`) and the hosted settings list email as the only enabled provider.
- `db.pooler.default_pool_size` (`20` here, `15` hosted) and `db.pooler.max_client_conn` (`100` here, `200` hosted). The Management API has no field for these, so the hosted values are the Free plan's own. BeStats never connects through the pooler (it uses the Data API), so they don't matter.

The CLI also skips some declared properties without comparing them, such as `auth.rate_limit.email_sent` (needs custom SMTP), the `[storage.vector]` and `[storage.analytics]` limits, and the Apple and Twilio credentials. `config diff` names them under "not part of the current comparison". `[storage.vector] enabled = false` stays because the Free plan refuses vector buckets with a 402, which would fail every push.

If a later push shows anything beyond these, cancel and investigate.

**Not available on Free.** Leaked password protection (the breach check of spec 0005 AC-9) needs the Pro plan, so it stays off.

## 4. Vercel environment variables (remote)

Set them in the Vercel project, under Settings, Environment Variables. `.env.example` documents each one with a placeholder.

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kyatxtclyikcmkebjxan.supabase.co` | not set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key | not set |
| `TMDB_READ_ACCESS_TOKEN` | your TMDB read token (sensitive) | the same token |
| `NEXT_PUBLIC_SITE_URL` | `https://bestats-sable.vercel.app`, no trailing slash | not set |
| `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` | `off` | `off` |

Never add a Supabase service role key, a secret key or a database password to any environment, and never give the TMDB token a `NEXT_PUBLIC_` prefix.

`NEXT_PUBLIC_` values are inlined at build time, so changing one (the email flag, for example) takes a redeploy, not just an edit. You can check the list with `vercel env ls`.

**Previews** have no Supabase variables on purpose. They show the catalog, a signed out navbar, `Sign in isn't available on this deployment.` on `/sign-in` and `/sign-up`, and a `robots.txt` that disallows everything. Vercel's deployment protection stays on, so only you (signed in to Vercel) or someone holding the protection bypass token can open one. `vercel curl <path> --deployment <url>` opens a preview with the bypass for a quick check. No preview origin ever goes into the Supabase redirect list.

Checked on 2026-10-04: the variables match this table, and a preview of `feat/deploy-previews` passed every one of those checks behind the login wall.

## 5. Branch protection and the firewall rule (remote)

**Branch protection on `main`** (GitHub, Settings, Branches): require the `checks` and `database` status checks, include administrators, require a pull request with 0 approving reviews, no force pushes, no deletion. Check it with `gh api repos/kris1027/BeStats/branches/main/protection`. Checked on 2026-10-04: all of that is on.

**Vercel Firewall rate limit on `/api/search`** (spec 0018 AC-20). Exact settings:
- Rule type: rate limit
- Condition: request path equals `/api/search`
- Limit: 60 requests per 60 seconds, fixed window
- Key: IP address
- Action: respond `429`

Status: not set up yet. It is part of build step 5. If the Hobby plan offers no rate limit rule, record that here and the per IP limit returns to the scope's Deferred list.

## 6. Which IP address Supabase counts (AC-18)

Sign ins run in a Server Action on Vercel, so Supabase may count the visitor's address or Vercel's outbound address against `sign_in_sign_ups` (30 per five minutes). If it counts Vercel's, the limit is shared by everyone, and one person sending thirty wrong passwords locks every visitor out for five minutes.

Finding: not established yet. Build step 5 checks it last, from two different networks, because exhausting the bucket also blocks your own sign ins. Record the result here and beside `[auth.rate_limit]` in `supabase/config.toml`.

## 7. Restoring a paused project (remote)

A Free project pauses after about a week without activity. While paused, every private page fails and sign in errors, though the public catalog still works because it reads only TMDB.

1. Open the Supabase dashboard, select `BeStats`, and choose Restore project.
2. Wait until its status is healthy (`pnpm exec supabase projects list` shows `ACTIVE_HEALTHY`).
3. Sign in on production and open `/watchlist` to confirm.

There are no automatic backups on Free. If losing data would hurt, revisit the plan (scope, Deferred).

## 8. Rolling back

- **Code:** Vercel Instant Rollback. In the Vercel project, Deployments, pick the last good production deployment and promote it. Then fix forward on a branch.
- **Schema:** never edit or delete an applied migration. Write a new forward migration that undoes the change, push it (step 2), then merge.
- **Auth settings:** check out the previous `supabase/config.toml` (`git show <good commit>:supabase/config.toml`), push it (step 3), then commit the revert so the repo matches production again.

## 9. Before and after a release

1. Before: run `pnpm tmdb:live` to confirm TMDB answers with your token.
2. After the deploy: open `https://bestats-sable.vercel.app/sitemap.xml`. It should list `/movies`, `/shows`, `/privacy`, `/terms` and a few hundred title pages. A sitemap with only the static routes means TMDB failed at build time: redeploy from Vercel.
3. Check `https://bestats-sable.vercel.app/robots.txt` allows crawling and names the sitemap.
4. Once, submit the sitemap in Google Search Console (add the origin as a URL prefix property, verify it, then Sitemaps, `sitemap.xml`).

Checked on 2026-10-04: `robots.txt` allows crawling and names the sitemap, `/movies/550` carries a canonical on the production origin, and the sitemap lists 402 URLs (398 titles). The Search Console submission is still yours to do.

## 10. The legal read through (release gate)

Before you invite anyone, read `/privacy` and `/terms` in full on production and fix anything that isn't true of the app as it runs (spec 0017). Any legal fact you change lives in `lib/legal/operator.ts`; bump `LEGAL_LAST_UPDATED` with it.

## 11. Manual password help

Production sends no email, so a person who forgets their password writes to the contact address the recovery page shows.

**Check it is plausibly the owner.** Addresses are unproven while confirmation is off, so an email from the address is not enough on its own. Reply asking them to name a few titles on their watchlist, and compare with their rows in the dashboard (Table Editor, `user_movie_state` and `user_show_state`, filtered by their user id from Authentication, Users). If you're unsure, don't reset.

**Set a temporary password** with a one off script on your machine. Copy a secret key from the dashboard (Project Settings, API Keys) just for this run. Never store it in the repo, Vercel, a file or your shell history.

```sh
read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY
node --input-type=module -e '
import { createClient } from "@supabase/supabase-js";
const [userId, password] = process.argv.slice(1);
const admin = createClient("https://kyatxtclyikcmkebjxan.supabase.co", process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await admin.auth.admin.updateUserById(userId, { password });
console.log(error ? `failed: ${error.message}` : "password updated");
' <user id> '<temporary password, at least 8 characters>'
unset SUPABASE_SECRET_KEY
```

Run it from the repo root so `@supabase/supabase-js` resolves. Send the temporary password, and ask them to change it at once on `/account`. If you created the secret key only for this, delete it in the dashboard afterwards.
