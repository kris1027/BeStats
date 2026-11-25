# Deploying BeStats

This is the runbook for production, written for you, the operator. Every step is a recommendation you may run or skip. It follows spec [0018](specs/0018-deploy-and-provider-setup/index.md): Vercel hosts the app, the existing Supabase Free project holds the data, and everything Supabase knows comes from this repo. Since 2026-11-25 Netlify hosts the same build as a backup, and is the primary host while Vercel's quota is spent (section 13).

Steps that change Vercel, GitHub or the Supabase project are marked **remote**. Run them yourself from your own terminal. Since CLI v3, `db push --remote` and `config push` ask before they change the hosted project, and an agent can still answer for you or pass `--yes`, so never ask an agent to run one "just to see the diff".

## The facts

| What | Value | Where it is set |
|---|---|---|
| Production origin | `https://bestats-app.vercel.app` | a domain on Vercel project `bestats`; repeated in `NEXT_PUBLIC_SITE_URL` and `[remotes.production.auth]` |
| Supabase project | `kyatxtclyikcmkebjxan` (name `BeStats`, Free plan) | `[remotes.production]` in `supabase/config.toml` |
| Supabase region | `eu-central-1`, Frankfurt | `SUPABASE_REGION` in `apps/web/lib/legal/operator.ts` |
| Vercel function region | `fra1`, Frankfurt | `regions` in `apps/web/vercel.json` |
| Vercel Root Directory | `apps/web`, with files outside the root directory included | the Vercel project settings (spec 0034) |
| Supabase CLI | `3.2.0`, run as `pnpm exec supabase` | the root `package.json`, and the `database` job in `.github/workflows/checks.yml` |
| Node | 22 | the Vercel project settings, `NODE_VERSION` in `apps/web/netlify.toml`, and CI |
| Backup origin | `https://bestats-app.netlify.app` | Netlify site `bestats-app` (Free plan); in `[remotes.production.auth]` as a redirect only (section 13) |
| Netlify function region | Ohio (`us-east-2`) | Netlify's Free plan default; choosing one needs Pro |
| Netlify base and package directory | repo root, and `apps/web` | the Netlify site settings |
| Access token signing | ES256 (asymmetric) | Supabase dashboard, JWT Keys |

## 1. Link the CLI and check the project (remote, read only)

1. Log in once: `pnpm exec supabase login`. It opens a browser.
2. Link the repo: `pnpm exec supabase link --project-ref kyatxtclyikcmkebjxan`.
3. Check the region: `pnpm exec supabase projects list` should show `eu-central-1`. A region can't change. If you ever move to a new project, create it in an EU region, then replace the ref in `supabase/config.toml`, `SUPABASE_REGION` and this file.
4. Check the signing key: `curl https://kyatxtclyikcmkebjxan.supabase.co/auth/v1/.well-known/jwks.json` should list a key with `"alg":"ES256"` (or `RS256`). If it lists none, the project still uses the legacy shared secret: in the dashboard, under JWT Keys, create a standby asymmetric key and rotate to it before any real user signs up.

Checked on 2026-10-04: region `eu-central-1`, one `ES256` key served.

## 2. Push migrations before you merge them (remote)

A pull request that adds a file to `supabase/migrations/` should merge only after the migration is on the cloud project. Migrations stay backward compatible with the code that is live, so "push, then merge" never breaks production.

1. Check what is pending: `pnpm exec supabase migration list --remote`. Since CLI v3, the `db` and `migration` commands target your local stack unless you pass `--remote`. Local and remote columns should match apart from your new file.
2. Push: `pnpm exec supabase db push --remote`, and answer `y` after reading what it will apply (pressing Enter answers No). Never add `--include-seed`. The seed users `user-a@example.test` and `user-b@example.test` exist only on your local stack.
3. Run `migration list --remote` again. Every row should show the same version on both sides.
4. Merge the pull request.

Checked on 2026-10-04: all 20 migrations applied, local and remote identical.

## 3. Push auth settings from `config.toml` (remote)

Auth settings reach the cloud only through `pnpm exec supabase config push`. Never change them in the dashboard: the next push overwrites them, and the repo would stop describing production.

**How the production values get in.** The local stack and production share every setting in `supabase/config.toml` except two: `site_url` and `additional_redirect_urls`. Those live in the `[remotes.production.auth]` table, which the CLI merges in when the linked ref matches `[remotes.production] project_id`. This is the path in use (spec 0018 AC-8, first option). If a push diff ever shows `localhost` for either value, the CLI ignored the block: cancel, swap the two values in `[auth]` for the production ones, push, then restore the local values without committing the swap, and note it here.

**Routine.**
1. Run `pnpm exec supabase config push` in your own terminal and read the diff before you answer `y` (pressing Enter answers No; unattended it refuses unless you pass `--yes`). Since CLI v3, a `SUPABASE_*` variable in your shell or in a `.env` file in the repo root or `supabase/` beats `config.toml` and is pushed too, so keep none there.
2. Accept only changes you made in `config.toml` on purpose. Anything else, cancel and investigate.
3. Run it a second time. It should report no differences, except the accepted ones below.

**What the hosted project carries** (checked on 2026-10-04 through the public `auth/v1/settings` endpoint where it exposes them): sign up enabled, confirmation off (`mailer_autoconfirm: true`), only the email provider enabled. From `config.toml`: `minimum_password_length = 8`, `jwt_expiry = 600`, `sign_in_sign_ups = 30`, `secure_password_change = false`, and the production `site_url` and redirect list above. Google and every other external provider stay disabled.

**Accepted differences.** The first push ran on 2026-10-04 from an agent shell, which applied it without stopping at the prompt, so its diff was never read. You ran the push again yourself later that day, and it wrote nothing: API, database and storage settings were up to date, and auth had only the difference below. `pnpm exec supabase config diff` (read only, safe to run any time) lists the differences below, which are accepted. Since the 2026-11-25 push (section 13) it lists only the two pooler values; that push also set `auth.sms.enable_confirmations` to `false` on the hosted project, harmless since phone sign up is off (`[auth.sms] enable_signup = false`), and `auth.sms.twilio.enabled` no longer shows.
- `db.pooler.default_pool_size` (`20` here, `15` hosted) and `db.pooler.max_client_conn` (`100` here, `200` hosted). The Management API has no field for these, so the hosted values are the Free plan's own. BeStats never connects through the pooler (it uses the Data API), so they don't matter.

The CLI also skips some declared properties without comparing them, such as `auth.rate_limit.email_sent` (needs custom SMTP), the `[storage.vector]` and `[storage.analytics]` limits, and the Apple and Twilio credentials. `config diff` names them under "not part of the current comparison". `[storage.vector] enabled = false` stays because the Free plan refuses vector buckets with a 402, which would fail every push.

If a later push shows anything beyond these, cancel and investigate.

**Not available on Free.** Leaked password protection (the breach check of spec 0005 AC-9) needs the Pro plan, so it stays off.

## 4. Vercel environment variables (remote)

Set them in the Vercel project, under Settings, Environment Variables. `apps/web/.env.example` documents each one with a placeholder.

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kyatxtclyikcmkebjxan.supabase.co` | not set |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key | not set |
| `TMDB_READ_ACCESS_TOKEN` | your TMDB read token (sensitive) | the same token |
| `NEXT_PUBLIC_SITE_URL` | `https://bestats-app.vercel.app`, no trailing slash | not set |
| `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` | `off` | `off` |
| `IGDB_CLIENT_ID` | your Twitch app's client id (sensitive) | the same id |
| `IGDB_CLIENT_SECRET` | your Twitch app's client secret (sensitive) | the same secret |

Never add a Supabase service role key, a secret key or a database password to any environment, and never give the TMDB token or either IGDB variable a `NEXT_PUBLIC_` prefix (`security-boundary.test.ts` fails if one does). Without the IGDB pair a deployment still builds, but every games read answers "Couldn't reach IGDB" and the sitemap lists no games (spec 0032, AC-7).

`NEXT_PUBLIC_` values are inlined at build time, so changing one (the email flag, for example) takes a redeploy, not just an edit. Games have no flag since spec 0032: the GAMES tab shows everywhere, so remove any leftover `NEXT_PUBLIC_GAMES_LIBRARY` from Preview. You can check the list with `vercel env ls`.

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

The rule is named `Rate limit api search`. The Hobby plan offers it. You can recreate it from the CLI (it stages a draft, then `publish` makes it live):

```sh
vercel firewall rules add "Rate limit api search" \
  --condition '{"type":"path","op":"eq","value":"/api/search"}' \
  --action rate_limit --rate-limit-algo fixed_window --rate-limit-keys ip \
  --rate-limit-requests 60 --rate-limit-window 60 --rate-limit-action rate_limit --yes
vercel firewall publish --yes
```

Check it with `vercel firewall overview` (one active custom rule).

Checked on 2026-10-04: a burst of 70 requests from one address got 60 answers of `200`, then `429` (`x-vercel-mitigated: deny`), while `/shows` kept answering `200`. With the limit reached, the navbar quick search showed its "Couldn't reach TMDB" error with Try again. A normal typing session sends one request per pause (the field debounces), so it stays far below the limit.

**Vercel Firewall AI Bots ruleset: Deny** (prompts/crawl-budget-cut.md). Set on 2026-10-28, when crawlers pushed Fluid Active CPU past the Hobby limit of 4 hours. It blocks AI crawlers such as ClaudeBot; search engines such as Googlebot are not affected and are steered by `robots.txt` instead. Set it from the CLI:

```sh
vercel firewall rules update ai-bots --action deny --yes
vercel firewall publish --yes
```

Check it with `vercel firewall status` (`AI Bots  Deny`). Checked on 2026-10-28: a ClaudeBot user agent on `/games/2554` gets `403`, and a plain request gets `200`.

Hobby refuses a second rate limit rule ("Rate limiting is not available for this plan") and any `header:` rate limit key, so crawlers cannot be rate limited while `Rate limit api search` exists.

**Widen that rule to the mobile API** (spec 0035, Rate limits; decided on 2026-11-19 in [prompts/mobile-api-v1.md](../prompts/mobile-api-v1.md)). Not applied yet: you take this step at deploy time, before the first store build ships. Spec 0035 asks for three rules (search 60, lists and genres 120, the rest of `/api/v1` 300 per minute per IP), but Hobby allows the one rule above, so it becomes one rule with one shared limit per IP:
- Condition: request path equals `/api/search`, **or** request path starts with `/api/v1/`
- Limit: proposed 300 requests per 60 seconds, fixed window, keyed by IP address (the spec's general `/api/v1` limit; mobile carriers put many users behind one IP, and the app's library and title screens call several routes per screen). This also loosens `/api/search` from 60. The number owes your approval before you apply it.
- Action: respond `429`; the app reads it as `rate_limited`.
- Rename the rule `Rate limit api` so its name matches its reach.

Set it in the Vercel dashboard (Firewall, the existing rule, Edit), then check it with `vercel firewall overview` (still one active custom rule) and a burst against `/api/v1/config` from one address. Record the checked date here. Spec 0035's Rate limits section records this single rule as the Hobby form of its three rule table.

**Website off, API on** ([prompts/web-off-keep-api.md](../prompts/web-off-keep-api.md)). Decided on 2026-11-21: the owner uses only the mobile app, so the website is switched off to keep the Hobby limits, and `/api/v1` keeps serving the app. The rule denies (`403`, no function runs) every path except these: anything under `/api/` and `/_next/`, plus `/privacy`, `/terms`, `/robots.txt`, `/favicon.ico`, `/tmdb-logo.svg` and `/igdb-logo.svg`. `robots.txt` disallows everything on every deployment (`app/robots.ts`), so crawlers read that and stop.

```sh
vercel firewall rules add "Website off, API on" \
  --condition '{"type":"path","op":"pre","value":"/api/","neg":true}' \
  --condition '{"type":"path","op":"pre","value":"/_next/","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/privacy","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/terms","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/robots.txt","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/favicon.ico","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/tmdb-logo.svg","neg":true}' \
  --condition '{"type":"path","op":"eq","value":"/igdb-logo.svg","neg":true}' \
  --action deny --yes
vercel firewall publish --yes
```

**When the app link files ship (release step 6, [prompts/mobile-deep-links.md](../prompts/mobile-deep-links.md)).** Universal Links and App Links only verify if Apple's and Google's fetchers can read the two files, and a reset link must reach `/reset-password/app` when the app is missing. Run `pnpm app-links --apple-team-id <TEAMID> --android-sha256 <FINGERPRINT>`, commit `apps/web/public/.well-known/`, then add two conditions to the rule above, `--condition '{"type":"path","op":"pre","value":"/.well-known/","neg":true}'` and `--condition '{"type":"path","op":"eq","value":"/reset-password/app","neg":true}'`, and publish. Check that `curl -sI https://bestats-app.vercel.app/.well-known/apple-app-site-association` answers `200` with `Content-Type: application/json` and no `Set-Cookie`.

Keep `/privacy` and `/terms` in that allow list: the app's About links to both on the API's origin ([prompts/mobile-about-legal-links.md](../prompts/mobile-about-legal-links.md)), and the store listings will link to them too.

Check it: `/movies` answers `403`, while `/privacy` and `/api/v1/lists/tv/trending` (with `X-BeStats-App-Version`) answer `200`. To reopen the website, run `vercel firewall rules disable "Website off, API on" --yes` and `vercel firewall publish --yes`, then restore the production branch of `app/robots.ts` from git history.

## 6. Which IP address Supabase counts (AC-18)

Sign ins run in a Server Action on Vercel, so Supabase may count the visitor's address or Vercel's outbound address. If it counts Vercel's, the limit is shared by everyone, and one person sending wrong passwords quickly makes sign in fail for every visitor.

**Which knob limits a password sign in.** Not `sign_in_sign_ups`. A password sign in is `POST auth/v1/token?grant_type=password`, and Supabase Auth limits every `/token` grant (password and session refresh alike) with the limiter built from `token_refresh` (150 per five minutes in `config.toml`). `sign_in_sign_ups` limits sign ups, password recovery, OTP and `PUT /user`. Source: `supabase/auth`, `internal/api/token.go` (`limiter := a.limiterOpts.Token`) and `internal/api/apilimiter/apilimiter.go`; the CLI maps `token_refresh` to `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` and `sign_in_sign_ups` to `GOTRUE_RATE_LIMIT_OTP`.

**It is a token bucket, not a five minute block** (`tollbooth.NewLimiter(rate/(60*5)).SetBurst(30)`). Each address starts with 30 tries and gets one back every 300/150 = 2 seconds. So a `429` turns back into `400` within seconds, and a drained bucket refills fully in about a minute. Session refreshes made by the proxy on Vercel draw on the same buckets as sign ins.

**Finding (2026-10-04): Supabase counts Vercel's addresses, not the visitor's.** How it was measured, from one network:

1. Wrong passwords sent straight to `auth/v1/token` from your own address until Supabase answered `429` (after 30 to 36 on a fresh bucket, fewer on a bucket not yet refilled, since one try comes back every 2 seconds).
2. Right after that `429`, a correct sign in through the production app succeeded in under a second. This step alone proves nothing: a try can refill between the two requests, and a second run saw `400` again moments later. Step 3 is the evidence.
3. Six browsers then sent 150 wrong sign ins through the app in about 20 seconds: about 100 got "Those details did not match", about 50 got `You have reached the limit for now. Please wait a little and try again.` Run alongside a burst, wrong current passwords on `/account` got the same rate limited copy, so they draw on the same buckets.
4. A minute later, correct sign ins worked again.

The mix in step 3 is the proof. All 150 came from one network, so one bucket keyed on the visitor's address would have let through about 40 (30 plus ten refills in 20 seconds), not about 100. Vercel sends these calls from a small pool of addresses, each with its own bucket. What that means for you:
- The limit is shared by every visitor. One person sending wrong passwords quickly makes some sign ins, current password checks and session refreshes fail for everyone (sign ups use the separate `sign_in_sign_ups` bucket), for as long as they keep sending (each bucket lets one try through every 2 seconds). Accepted for now (spec 0018, Consequences).
- One person gets a few buckets rather than one, so the brute force protection is a few times looser than one bucket: each bucket alone already allows a steady 150 tries per five minutes.
- If it bites, the follow up is a second Vercel Firewall rule on sign in and sign up posts per IP (spec 0018, Follow-up). The same note sits beside `[auth.rate_limit]` in `supabase/config.toml`.

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

1. Before: run `pnpm tmdb:live` and `pnpm igdb:live` to confirm TMDB and IGDB answer with your credentials.
2. After the deploy: open `https://bestats-app.vercel.app/sitemap.xml`. It should list `/movies`, `/shows`, `/games`, the fifteen list pages, `/privacy`, `/terms`, then a few hundred movie and show pages and up to 200 game pages. A sitemap with only the static routes means TMDB failed at build time, and one with no `/games/{id}` entries means IGDB did: redeploy from Vercel.
3. Check `https://bestats-app.vercel.app/robots.txt` allows crawling and names the sitemap.
4. Once, submit the sitemap in Google Search Console (add the origin as a URL prefix property, verify it, then Sitemaps, `sitemap.xml`).

Checked on 2026-10-04: `robots.txt` allows crawling and names the sitemap, `/movies/550` carries a canonical on the production origin, and the sitemap lists 402 URLs (398 titles). The Search Console submission is still yours to do.

Moved on 2026-11-18: production moved from the Vercel-assigned alias to `https://bestats-app.vercel.app` (`bestats.vercel.app` belongs to another account). The 2026-10-04 checks above ran against the old alias. On 2026-11-18 steps 2 and 3 passed on the new origin (412 sitemap URLs, canonical and `og:url` on `/movies/550`), and the old alias was then removed from the project and answers 404. Adding the new origin as its own Search Console property is still yours to do.

## 10. The legal read through (release gate)

Before you invite anyone, read `/privacy` and `/terms` in full on production and fix anything that isn't true of the app as it runs (spec 0017). Any legal fact you change lives in `apps/web/lib/legal/operator.ts`; bump `LEGAL_LAST_UPDATED` with it.

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

Run it from `apps/web`, where `@supabase/supabase-js` is installed; from the repo root the import fails. Send the temporary password, and ask them to change it at once on `/account`. If you created the secret key only for this, delete it in the dashboard afterwards.

## 12. Mobile release (remote)

The store release of the phone app (spec [0033](specs/0033-mobile-app-expo/index.md), Build plan step 6). Everything the repo needs is in place ([prompts/mobile-release-prep.md](../prompts/mobile-release-prep.md)); these steps need your developer accounts, so they are yours. Run EAS as `npx eas-cli@latest <command>` from `apps/mobile`. Every step below is **remote**.

**Facts.** The EAS project, the bundle ID (permanent after the first upload), the build profiles with their update channels and the runtime version policy are listed once, in [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md), EAS section.

1. **Accounts.** Join the Apple Developer Program and create a Google Play Console account, both as kris1027, so the seller name matches the data controller on `/privacy`.
2. **Public values in EAS.** A store build bundles its JavaScript on EAS, so it can't read your `.env` files. Create the four values in the EAS `production` environment (and `preview` if you build that profile), visibility plain text, since they are all public: `EXPO_PUBLIC_API_BASE_URL=https://bestats-app.vercel.app`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the cloud values), `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY=off`. Never put a secret there (AGENTS.md section 11).
3. **Before the first upload,** recheck the spec's last Follow up item: the Expo SDK's React version and NativeWind v5's status.
4. **iOS.** `eas build --platform ios --profile production` (let EAS create the certificate and profile; `eas credentials --platform ios` shows, downloads or replaces them later), then `eas submit --platform ios --latest`. It creates the App Store Connect record the first time. Add yourself as an internal TestFlight tester.
5. **Android.** `eas build --platform android --profile production` (let EAS create the upload keystore; back it up with `eas credentials --platform android`, since Play needs that key for every later upload). Upload the first `.aab` to Play internal testing by hand in the Play Console, since Google requires the first upload there. Later uploads can use `eas submit --platform android` with a Play service account key, kept out of the repo.
6. **Privacy labels.** Type the answers from [store-privacy-labels.md](store-privacy-labels.md) into App Store Connect and the Play Console.
7. **App links.** Read the Team ID from your Apple account and the SHA 256 fingerprint of the **Play app signing** key from the Play Console (App integrity), then follow section 5, "When the app link files ship". Check that an https title link and a reset link open the installed store build (AC-16).
8. **Smoke test** on a TestFlight and a Play internal build: sign in, browse, search, track a movie, an episode and a game, open every library page (AC-17).
9. **Over the air fixes.** For a JavaScript only fix, `eas update --channel production --environment production --message "<what changed>"`. Try it on `preview` first. A change to native code or `app.json` needs a new build instead. A store build shows an update after up to two cold launches.

## 13. Netlify backup host (remote)

Netlify serves the same build as Vercel, so the phone app keeps working when one host runs out of its free quota ([prompts/netlify-mirror.md](../prompts/netlify-mirror.md)). One host is primary at a time, and you switch the phone app by hand. Nothing in sections 1 to 12 changes: Vercel's settings and firewall rules stay as they are.

**While Netlify is primary** (since 2026-11-25, Vercel's account blocked), `apps/web/vercel.json` sets `"git": { "deploymentEnabled": false }`, so a push or pull request builds nothing on Vercel and shows no failing Vercel check. To switch back to Vercel, remove that block and its test in `deploy-config.test.ts` in one PR; the merge to `main` then deploys production again.

**What the repo holds.** `apps/web/netlify.toml` sets the build command and Node 22, rate limits `/api/*`, and turns the website off. `deploy-config.test.ts` pins all of it, and fails when a new top-level route under `app/` is neither denied there nor on the allow list.

**The Free plan's limits** (read on 2026-11-25):
- 300 credits a month as a hard cap. When they run out, the site pauses until the next cycle.
- A production deploy costs 15 credits, so about 20 deploys a month at most, less what requests (2 credits per 10,000) and compute (10 per GB-hour) use. Failed deploys and rollbacks cost nothing.
- Functions run in Ohio. Every Supabase call crosses the Atlantic, so screens are slower than on Vercel `fra1`. `/privacy` says so through Netlify's line in `PROCESSORS`.
- No AI bot ruleset and no dashboard firewall rules. The `403` rules and `robots.txt` already stop page renders.

### Set up the site (once)

1. In Netlify, Add new project, Import from Git, pick `kris1027/BeStats`.
2. Base directory: leave empty (the repo root). Package directory: `apps/web`. Netlify reads `apps/web/netlify.toml` and uses its build command. Leave the publish directory to the Next.js adapter.
3. Site name: `bestats-app`, giving `https://bestats-app.netlify.app`. If it is taken, pick another, then update the redirect URLs in `supabase/config.toml` (`deploy-config.test.ts` reads the origin from there) and this section.
4. Project configuration, Build and deploy:
   - Continuous deployment, Build settings: set **Builds** to **Stopped**, so a merge to `main` costs no credits.
   - Deploy Previews: **Off**.
   - Branch deploys: **None**.
5. Environment variables, scoped to Builds and Functions, production context:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://kyatxtclyikcmkebjxan.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |
   | `TMDB_READ_ACCESS_TOKEN` | your TMDB read token (mark it secret) |
   | `NEXT_PUBLIC_SITE_URL` | `https://bestats-app.netlify.app`, no trailing slash |
   | `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` | `off` |
   | `IGDB_CLIENT_ID` | your Twitch app's client id (mark it secret) |
   | `IGDB_CLIENT_SECRET` | your Twitch app's client secret (mark it secret) |

   The rules from section 4 apply: no service role key, secret key or database password, and no `NEXT_PUBLIC_` prefix on the TMDB or IGDB values. Don't set `VERCEL_ENV`, so the build is never indexable.
6. Project configuration, Access & security, Visitor access: a new project sits behind **Netlify team login** for all deploys, so every path, `/api/v1` included, answers `401` with a login page. Set it to non-production deploys only (the API's `sso_login_context` is `non_production`). Password protection stays off.
7. Push the redirect URLs: run `pnpm exec supabase config push` (section 3). The diff should show only the two `bestats-app.netlify.app` entries in `additional_redirect_urls`, besides the accepted differences in section 3. Pushed on 2026-11-25. While the website is off, `/auth/*` answers `403` on Netlify as it does on Vercel, so the callback entry waits for the day sign in on the web comes back; today's app flows never redirect there.
8. Optional: complete the appendix of Netlify's DPA (`https://www.netlify.com/pdf/netlify-dpa.pdf`) and email it to Netlify. Once that's done, Netlify's transfer line in `PROCESSORS` may name the EU Standard Contractual Clauses, the same way Vercel's does. Bump `LEGAL_LAST_UPDATED` with that change.

### Deploy (by hand)

Netlify builds only when you ask. Deploy when you switch to Netlify, or when a fix the phone app needs has merged:
- In the dashboard: Deploys, Trigger deploy, Deploy project.
- Or from the repo root: `npx netlify-cli@latest deploy --prod --filter @bestats/web` (it asks you to log in and link the site the first time). Run it from the root, not from `apps/web`: the project's publish directory is `apps/web/.next` relative to the root, so a run inside `apps/web` looks for `apps/web/apps/web/.next` and fails. A CLI deploy builds on your machine with `apps/web/.env.local` loaded; the Netlify variables win where both exist, so keep nothing in `.env.local` that production must not carry.

A deploy that merged a migration still follows section 2: push the migration before you merge.

### Check it after the first deploy

The `X-BeStats-App-Version` value below is `MIN_APP_VERSION` from `packages/core/src/api/v1/version.ts`.

1. Website off: `curl -sI https://bestats-app.netlify.app/movies` answers `403`, and so do `/`, `/sign-in` and `/sitemap.xml`. A private page such as `/watchlist` answers `307` to `/sign-in`, which answers `403`: the Next.js proxy runs as a Netlify edge function, and edge functions run before `netlify.toml` redirects. No page renders, but each page request still costs one edge invocation.
2. API on: `curl -s https://bestats-app.netlify.app/api/v1/config -H "X-BeStats-App-Version: <version>"` answers `200` with the app config. `/privacy`, `/terms` and `/robots.txt` answer `200`, and `robots.txt` disallows everything.
3. Country: `curl -s https://bestats-app.netlify.app/api/v1/movies/550/extras -H "X-BeStats-App-Version: <version>"` lists your own country's watch providers. If it always lists the United States, Netlify sends no `x-country`, so report it.
4. Rate limit: send about 310 quick requests to `/api/v1/config` from one address. The last ones answer `429`, and a minute later every `/api` route answers again. If any `/api` route fails while unthrottled (a `404`, or a loop), the self rewrite broke it: delete the rate limit rule from `netlify.toml` together with its test, redeploy, and note it here.
5. Private answers stay private: `curl -sI` on a `me` route with a bearer token shows `cache-control: private, no-store` and no CDN cache hit in `cache-status`.

### Switch the phone app

The app reads its API origin from `EXPO_PUBLIC_API_BASE_URL`, baked in at build time.
1. In `apps/mobile/.env.production.local`, set `EXPO_PUBLIC_API_BASE_URL=https://bestats-app.netlify.app`. To switch back, set it to `https://bestats-app.vercel.app`.
2. Rebuild and install your local release build.
3. Sign in, browse, search, and track a movie, an episode and a game.

The app's About links to `/privacy` and `/terms` on the same origin, so they follow the switch. App links (Universal Links, App Links and the reset link) stay bound to `bestats-app.vercel.app` (section 5), so they don't work while Vercel is paused. Production sends no email, so no reset link is affected today.

Checked on 2026-11-25, first deploy (`6b06b21d414f59539972129d`):
1. `/`, `/movies`, `/movies/550`, `/shows`, `/games`, `/search`, `/sign-in`, `/showcase`, `/auth/callback`, `/sitemap.xml` and `/opengraph-image` answered `403` with the static body. `/watchlist` and `/account` answered `307` to `/sign-in` (see check 1).
2. `/api/v1/config` answered `200` (`{"minAppVersion":"1.0.0","apiVersion":1}`), and version `0.0.1` got `426`. `/privacy`, `/terms`, `/robots.txt`, the favicon and both logos answered `200`; `robots.txt` disallows everything, and `/privacy` names Ohio for Netlify.
3. `/api/v1/movies/550/extras` named Poland from Netlify's own country header; a client sent `x-country: DE` was ignored.
4. After about 320 requests in a minute, `/api` answered `429`; a minute later it answered again. Cached answers (`/api/v1/config`) still came from the CDN while limited.
5. `/api/v1/me/library` with no token answered `401` with `cache-control: private,no-store`. The extras answer was `private,max-age=300` with a CDN bypass.

