# 0018. Deploy and provider setup: rationale

Decision record for [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

> ⚠️ Premise note: scope feature 20 was written to finish authentication for launch: Google sign in, real email delivery, and the five verify steps spec 0005 moved here. The answers narrowed it to deploying without either provider. That is a fair call for a free personal project with no domain, but it turns confirmation off, and that creates an account takeover path the moment Google returns, even if confirmation is switched back on first, because accounts created now stay marked confirmed. The right framing is that feature 20 ships a working, honest production without email, and the deferred email and Google work owns the guard. The spec says so in Consequences and in the Deferred line.

BeStats has nineteen finished features and runs only on your laptop. `AGENTS.md` section 6 fixes the hosts (Vercel for Next.js, Supabase Cloud for data and auth), and a cloud project `kyatxtclyikcmkebjxan` already exists with no schema. Nothing links the repo to either host yet, and earlier specs left a trail of work that only a real deployment can finish. Spec 0005 left `Secure` cookies, the hosted token lifetime, the breach check, the rate limits and the JWT key type. Spec 0010 left the per IP limit on the public `/api/search`. Spec 0016 left the production origin and `VERCEL_ENV`. Spec 0017 left the region in the privacy policy and a legal read through before release.

The forces are mostly about cost and honesty. BeStats is free and non commercial, run by one person in Poland, which puts it under GDPR as a controller and makes a $0 setup the natural target. You have no domain of your own, and every reputable email provider sends to arbitrary recipients only from a verified domain. Supabase's built in sender delivers only to team members, a couple an hour. So a sign up flow that waits for a confirmation email would stall for every real user. `AGENTS.md` section 11 forbids a false success state, and section 12 asks that schema changes stay reproducible through migrations, avoid dashboard only changes, and that remote migrations and deployment be explicitly approved.

The Free plan brings its own constraints: projects pause after about a week without activity, there are no automatic backups, and leaked password protection is a paid feature. Vercel's Hobby plan is restricted to non commercial use. With one developer there is no deploy race worth automating around, but there is a real risk of forgetting a step, which argues for a written runbook over memory.

Not deciding leaves the app unusable by anyone but you, leaves half of spec 0005's security claims unproven, and keeps the public search endpoint unlimited.

## Options considered

### Option 1: Full launch, with Google and real email

Buy a domain (or send through Gmail SMTP), configure an SMTP provider in Supabase, keep confirmation on, create the Google OAuth client, restore the Google button, and run all five moved verify steps. This is what scope feature 20 originally described.

**Pros**:
- Every promise of spec 0005 holds in production: masked sign up, confirmation, recovery.
- No account takeover path, because addresses are proven before Google can link to them.
- Closes the feature exactly as scoped.

**Cons**:
- Needs a domain and DNS work, or puts a personal Gmail account on the sending path with its daily limits.
- Adds Google and an email provider as processors, with policy changes and an OAuth consent screen to maintain.
- More setup than you chose to take on now.

### Option 2: Deploy now, no email, confirmation off, Google deferred (chosen)

Deploy to Vercel and the existing Free project, configured from the repo through `db push` and `config push`, with sign up signing people in immediately and every email dependent surface replaced by an honest notice behind a flag.

**Pros**:
- $0, no new provider, no new processor, no domain.
- Every surface tells the truth: nothing promises an email that will never come.
- The flag and the dormant code keep the way back to Option 1 short.

**Cons**:
- Unproven addresses, the takeover risk once Google returns, and an enumeration signal at sign up.
- No self service password recovery.
- The confirmation and recovery code goes untested in a browser until email returns.

### Option 3: Deploy now, keep confirmation on with Supabase's built in sender

Change no code; production uses Supabase's default mailer.

**Pros**:
- No code change and no security regression from spec 0005.

**Cons**:
- Real users never receive their confirmation, so sign up silently stalls for everyone except you. It is a false success state in practice, which section 11 rules out.

### Option 4: Google only in production, email sign up hidden

Restore Google sign in, turn email sign up off in production, keep email for local development.

**Pros**:
- Google proves the address, so there is no takeover path and no enumeration signal.
- No email needed for sign up.

**Cons**:
- Still needs the Google OAuth client and a processor change, which you chose to defer.
- Users who prefer a password have no way in, and the existing password accounts flow goes unused.

## Rationale

Option 2 fits the forces you set: a free project, no domain, and no appetite for new providers yet. Option 3 is ruled out because it leaves sign up broken for every real user while looking normal, the exact false success state `AGENTS.md` section 11 forbids. Options 1 and 4 are better products, and Option 1 is the safer one, but both need provider work you chose to defer. So the spec takes Option 2 and makes its costs explicit instead of hiding them. The takeover risk is written into Consequences and the Deferred line, so the future Google work can't skip it. The enumeration signal is accepted with clear copy because, without email, masking would only confuse real users while the behaviour still leaked (a new account signs in, an existing one doesn't).

The smaller calls follow the same logic. A flag rather than deleting the email surfaces keeps the way back to Option 1 down to configuration, and making the flag decide only visibility (while Supabase's actual answer decides sign in) means a mismatched flag and config can never show a false success. `db push` and `config push` from the repo, run by hand, satisfy section 12's "reproducible, no dashboard only changes, approved remote migrations" with no database credential in GitHub; a GitHub Action would race Vercel's build and make approval implicit. Vercel's Git integration behind branch protection gives "only green code deploys" with no deploy token to manage. Previews stay catalog only, because allowing their origins would let auth links lead into unmerged code running against real user data, and a second Supabase project is upkeep you don't need yet. The Vercel Firewall rule closes spec 0010's open limit without adding Upstash as a new processor, and its availability on Hobby is checked rather than assumed.

Mirroring production locally was your choice over keeping email on locally. It buys one behaviour everywhere, so what you test is what users get. The cost is that the dormant confirmation and recovery path can only be checked by unit tests until email returns, and the Deferred work should plan a full browser pass of spec 0005's email steps when it flips the flag back on.

### Interview record (2026-10-03)

- Production project: reuse `kyatxtclyikcmkebjxan`, on the Free plan, limits accepted.
- Previews: catalog only, no sign in.
- Domain: the free `vercel.app` subdomain, project `bestats`, falling back to the assigned alias.
- Email: deferred; production keeps email sign up with confirmation off.
- Google: deferred with email; both enrolled as one line under Deferred, not as scope features.
- Enumeration: accepted with plain copy. Recovery: hidden link plus a notice with the contact address. Flag: a public env var read through `getPublicEnv()`.
- Migrations: `supabase db push` by hand from a runbook. Auth settings: `supabase config push` from `config.toml`. Deploys: Vercel Git integration plus branch protection.
- `/api/search`: a Vercel Firewall rate limit rule. Pausing: accepted, restore step in the runbook. `secure_password_change`: noted under Deferred.
- JWT keys: check and migrate to asymmetric if needed. Search Console: a runbook step. Local stack: mirrors production.
- References: none.

### Calls made in the spec (recommended, not asked)

- Flag default `off`: both environments run without email, so an unset variable should never reveal a recovery form that can't deliver. Runner up: default `on`, which matches spec 0005 but would expose dead forms wherever the variable was forgotten.
- Firewall numbers, 60 requests per 60 seconds per IP: the quick search debounces keystrokes and the CDN absorbs repeats, so a person never comes close, while a scraper hits it within a minute. Runner up: 30 per minute, tighter but closer to a fast typist with many corrections.
- `/check-email` redirects to `/sign-in` when the flag is `off`, instead of showing a notice: nothing links to it any more, so a stale bookmark only needs a way forward.
- Runbook at `docs/deploy.md`: one file next to the specs and scope, read by people, not built by anything.
- Rollback: Vercel Instant Rollback for code, a forward migration for schema (migrations are never reversed on a live database), the previous `config.toml` pushed again for auth settings.
- Region stored as `SUPABASE_REGION` in `lib/legal/operator.ts`, because legal facts may live only there (`lib/legal/boundary.test.ts`).

### Cross check (2026-10-03, another model)

A read only Sonnet pass found sixteen items; you chose to apply every recommended fix. The ones that changed the design:

- The flag gets its own reader, `getAuthEmailDelivery()`, because `getPublicEnv()` throws on previews, which have no Supabase variables.
- Sign up with the flag `off` but no session returned now fails visibly instead of landing silently on `/sign-in`.
- The resend and reset actions refuse on the server, not just in the hidden UI.
- `/check-email` redirects through `next.config.ts`, so no page streams a redirect after a 200.
- The AC-8 fallback no longer uses the dashboard, which the next push would overwrite.
- Function region pinned to the EU, and the Transfers section rewritten.
- Supabase's IP keyed limits may see Vercel's address rather than the visitor's. The build establishes which, and accepts a shared bucket with the lockout risk recorded, rather than claiming a per visitor limit it can't prove.
- Build order fixed: the Vercel alias is known before the first config push, branch protection comes first, and the rate limit check runs last.
- Manual password help gets a procedure, and claiming someone else's address is recorded as a risk.
