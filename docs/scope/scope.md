# Scope: BeStats

A movie and TV tracking web app powered by TMDB. Anyone can browse and search the catalog; signed in users keep a private watchlist, watch history, statuses and ratings.

**Build approach:** Tracer Bullet (prove the whole pipe works with one thin real thread, then thicken one strand at a time, always end to end).
**Workflow:** Beta (after develop, run `/check verify` then `/test`). Features that hold private data or enforce the rating and status rules carry a `· GA` tag, which adds a fresh model review and `/document`. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

_The stack, tooling and product rules (ratings, progress, statuses, security) live only in `AGENTS.md`; this file does not repeat them. Specs below only record the decisions `AGENTS.md` leaves open. Every UI feature waits on files in `design/`, which does not exist yet._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack and scaffold | Foundation | done |
| 2 | Coding standards and tooling | Foundation | done |
| 3 | Data model and security policies | Foundation | done |
| 4 | TMDB integration module | Foundation | done |
| 5 | Design system and UI foundation | Foundation | done |
| 6 | Authentication | Slice 1 | in-progress |
| 7 | Movie page | Slice 1 | planned |
| 8 | Movie tracking | Slice 1 | planned |
| 9 | Watchlist and movie history | Slice 1 | planned |
| 10 | TV show page | Slice 2 | planned |
| 11 | Search and filters | Slice 3 | planned |
| 12 | Episode and season tracking | Slice 4 | planned |
| 13 | Calculated season and show ratings | Slice 5 | planned |
| 14 | TV status and progress | Slice 6 | planned |
| 15 | Up Next | Slice 7 | planned |
| 16 | Automatic completion | Slice 7 | planned |
| 17 | SEO metadata and sitemap | Slice 8 | planned |
| 18 | Legal pages and TMDB attribution | Slice 8 | planned |
| 19 | Security and acceptance verification | Slice 8 | planned |
| 20 | Deploy and provider setup | Slice 8 | planned |

## Foundations

### 1. Stack and scaffold · done
Set up the stack defined in `AGENTS.md` section 6. Today only a bare Next.js app with Tailwind exists; Supabase clients, shadcn/ui, Zod and `.env.example` are missing.
**Done when:** TypeScript stays in strict mode (already on in `tsconfig.json`), and the app boots and builds with Supabase client setup, shadcn/ui, Zod and a committed `.env.example` with placeholders, and no secret can reach the browser bundle.
- [x] Finish the scaffold: `/develop stack and scaffold`
Code in `app/`, `lib/env.ts`, `lib/supabase/`, `proxy.ts`

### 2. Coding standards and tooling · done
Capture conventions from the real project, then install the checks every later slice relies on (type check, lint and format, test runner). The tool choices (Biome replacing ESLint) are in `AGENTS.md` section 6.
**Done when:** `AGENTS.md` matches the installed tooling, ESLint is removed, and type check, Biome and a test runner run clean.
- [x] Capture conventions and tooling choices: `/audit`
- [x] Design it (spec): `/architect coding standards and tooling`
- [x] Install the tooling: `/develop tooling`
- [x] Check it runs clean: `/test`
Code in `biome.json`, `vitest.config.ts`, `vitest.setup.ts`, `.github/workflows/checks.yml`, `supabase/tests/`
spec [0003](../specs/0003-lint-format-and-test-tooling.md)

### 3. Data model and security policies · done · GA
The costliest thing to redo. Movie state, TV tracking state, episode state and catalog identity (media type plus TMDB ID), with constraints and row level security from the first migration.
**Done when:** migrations create every table with ownership, uniqueness and rating bounds; RLS blocks any cross user read or write; repeated writes never duplicate rows.
- [x] Design it (spec): `/architect data model and security policies`
- [x] Build it: `/develop data model and security policies`
  - [x] Local Supabase stack running, declarative schema workflow configured — AC-1
  - [x] Two enums, three tables, constraints, episode index and both triggers authored — AC-1, AC-7, AC-8, AC-9, AC-12
  - [x] RLS enabled and forced, twelve policies, grants to authenticated and revokes from anon — AC-2, AC-4, AC-5
  - [x] Migration generated and reviewed, advisors clean, reset reproducible twice — AC-1, AC-2
  - [x] Seed fixture, pgTAP suite, generated types with a drift check, service role absence confirmed — AC-3 to AC-6, AC-10 to AC-15
- [x] Verify it: `/check verify data model and security policies`
- [x] Test it: `/test data model and security policies`
- [x] Review it (fresh model): `/check review data model and security policies`
- [x] Document it: `/document data model and security policies`
Code in `supabase/schemas/`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`, `lib/supabase/database.types.ts`, `scripts/db-types-check.sh`
spec [0001](../specs/0001-user-tracking-schema-and-rls/index.md)

### 4. TMDB integration module · done
A server only module for authenticated TMDB requests: normalized responses, caching with a refresh policy, rate limit and failure handling, English first metadata.
**Done when:** movie, TV, season and episode data load through one server module, the token never reaches the browser, and a TMDB failure returns a handled error, not a crash.
- [x] Design it (spec): `/architect TMDB integration module`
- [x] Build it: `/develop TMDB integration module`
  - [x] Packages, `.env.example`, the `cacheComponents` flag and the module skeleton with `server-only` — AC-1, AC-2, AC-4, AC-20, AC-22
  - [x] Request client: Bearer auth, timeout, typed errors, bounded retry, structured logging, image URLs — AC-3, AC-10 to AC-12, AC-20, AC-21, AC-26, AC-27
  - [x] The movie thread end to end, verified in the running app, with its fixture tests and the secret boundary proven — AC-5 to AC-9, AC-13, AC-23, AC-2
  - [x] TV, seasons and specials, the bounded batch helpers, and `getShowEpisodes` with its completeness flag — AC-14, AC-15, AC-19, AC-25
  - [x] Search, discover, genres, the barrel, the full fixture suite, the opt in live check and the final build — AC-7, AC-16 to AC-18, AC-23, AC-24
- [x] Verify it: `/check verify TMDB integration module`
- [x] Test it: `/test TMDB integration module`
Code in `lib/tmdb/`, `next.config.ts`, `vitest.live.mts`, `security-boundary.test.ts`
spec [0002](../specs/0002-tmdb-integration-module/index.md)

### 5. Design system and UI foundation · done
Base components adapted from the reference designs, plus loading, empty, error and missing image patterns. The sixteen references now exist in `design/`.
**Done when:** base components match `design/`, work by keyboard with visible focus, and cover the shared loading, empty and error states on desktop and mobile.
- [x] Design it (spec): `/architect design system and UI foundation`
- [x] Build it: `/develop design system and UI foundation`
  - [x] Theme foundation: one black palette, Inter, the shadcn remap, product tokens, glass utilities with the rounded rim technique, focus ring — AC-1 to AC-4, AC-6
  - [x] The thin thread end to end: root layout, sticky blurred navbar, the `/` redirect, placeholder `/shows` and `/movies`, verified in the running app — AC-13, AC-16, AC-17, AC-18
  - [x] Shell thickened and primitives adapted: mobile navbar, tab links, the menu dialog sheet, the generated shadcn components — AC-14, AC-15
  - [x] Content pieces: the glass pill and its two badges, poster card with the missing image fallback, the grid, the state panel, the skeletons — AC-5, AC-8 to AC-12
  - [x] Proof: contrast audit recorded, showcase route with its production guard, accessibility tests, full checks — AC-7, AC-19 to AC-21
- [x] Verify it: `/check verify design system and UI foundation`
- [x] Test it: `/test design system and UI foundation`
Code in `app/globals.css`, `app/layout.tsx`, `app/{shows,movies,showcase}/`, `components/`, `next.config.ts`
spec [0004](../specs/0004-design-system-and-ui-foundation/index.md)

## Slice 1: Core movie loop

The thin real thread: browse a movie, sign in, track it, see it in your list. Every layer is real, breadth is deferred.

### 6. Authentication · in-progress · GA
Email and password sign in, email verification, sign out, password recovery, and session handling that private routes can trust. Google sign in moved to feature 20 with the rest of the provider setup, because it cannot be verified without a Google OAuth client.
**Done when:** a visitor can sign up, verify their address, sign in, sign out and recover a password; private routes reject signed out visitors at both the redirect and the server; a new password can be set without the current one only from a recovery link; and the forms never reveal whether an address has an account.
- [x] Design it (spec): `/architect authentication`
- [x] Build it: `/develop authentication`
  - [x] Configuration and shared rules: the site URL variable, the `[auth]` block, and the shared schemas, action state, path guard, message and log modules — AC-9, AC-11, AC-18, AC-23
  - [x] The thin thread end to end: sign in, sign out, the private account page, the proxy guard and `requireUser`, verified in the running app — AC-4, AC-5, AC-10, AC-12, AC-15
  - [x] The navbar account slot inside its Suspense boundary, passed into both navbar forms, with the layout purity test — AC-13, AC-14
  - [x] The sign up strand: sign up, check email with resend, the callback, and the neutral existing address branch — AC-1, AC-2, AC-3, AC-6
  - [x] The recovery strand and change password, then hardening and proof: expired sessions, noindex, logging, the test suite, accessibility and the bundle check — AC-7, AC-8, AC-16, AC-17, AC-19 to AC-22
  - [x] Corrections from the verify run: gate `resetPasswordAction` on a recovery session, spend that session on one reset by signing out globally, and carry `next` through the two cross links between sign in and sign up — AC-24, AC-8, AC-10
  - [x] The revocation window from verify run 2: `jwt_expiry = 600` on the local stack, confirmed on a restarted stack, so a revoked session stops working within ten minutes — AC-8
  - [x] The mapping tests from verify run 3, plus classifying a breach by `reasons` not message text: a 429 and an `over_email_send_rate_limit` error classify as rate limited, a breach refusal as breached, a length refusal as too short. The five steps the local stack cannot run move to feature 20 — AC-9, AC-18
  - [x] Corrections from the fresh model review: the session cookies become `HttpOnly` (and `Secure` on an `https` site URL) through one shared options function, guarded by a boundary test; the control character fix to `next` already landed through /debug — AC-25, AC-11
- [x] Verify it: `/check verify authentication`
- [x] Test it: `/test authentication`
- [x] Review it (fresh model): `/check review authentication`
- [x] Document it: `/document authentication`
code in [lib/auth/](../../lib/auth/), [app/(auth)/](<../../app/(auth)/>), [app/account/](../../app/account/), [app/auth/callback/](../../app/auth/callback/), [components/auth/](../../components/auth/)
spec [0005](../specs/0005-authentication/index.md)

### 7. Movie page · needs a decision
Public movie detail page with poster, overview, cast, genres and the TMDB community rating, clearly labeled as TMDB. Also the first landing view to reach a movie.
**Done when:** a signed out visitor can open a movie, see cast and metadata, and missing images or fields render a sensible fallback without invented content.
- [ ] Design it (spec): `/architect movie page`

### 8. Movie tracking · needs a decision · GA
On the movie page, a signed in user can add to the watchlist, mark watched and rate from 1 to 10. Watched and rating stay separate.
**Done when:** watchlist, watched and rating survive reload and a second session; removing watched keeps the rating; failed writes show an error, not a false success.
- [ ] Design it (spec): `/architect movie tracking`

### 9. Watchlist and movie history · needs a decision
Private view of the watchlist and watched movies, with empty and signed out states. TV entries join it in feature 14. This feature also inherits the mobile menu sheet from feature 6: `MobileMenuSheet` exists but is wired only into `/showcase`, and the sheet `mobile-menu-open.svg` draws holds the Watchlist, Upcoming and Watched links that arrive here, so the menu button and the sheet belong with them (spec [0005](../specs/0005-authentication/index.md), Consequences).
**Done when:** a signed in user sees their own watchlist and watched movies with personal ratings labeled apart from TMDB ratings; a signed out visitor is sent to sign in; and, signed in at mobile width, the menu button opens a sheet holding those links plus the account block and Sign out, matching `mobile-menu-open.svg`.
- [ ] Design it (spec): `/architect watchlist and movie history`

## Slice 2: TV show page

### 10. TV show page · needs a decision
Public TV detail page with cast, seasons and episode lists (including season 0 specials), air dates and show status as reported by TMDB.
**Done when:** a visitor can open a show, browse seasons and episodes, and incomplete episode data or missing air dates display honestly.
- [ ] Design it (spec): `/architect TV show page`

## Slice 3: Search

### 11. Search and filters · needs a decision
Results page for movies or TV with a title query, genre, year and minimum TMDB rating filters, shareable URL parameters and pagination. Search and discovery endpoints differ, so the approach must be verified against TMDB.
**Done when:** every displayed result meets the selected filters, counts are never falsely unfiltered totals, filters survive opening a title and returning, and failures offer a retry.
- [ ] Design it (spec): `/architect search and filters`

## Slice 4: Episode tracking

### 12. Episode and season tracking · needs a decision · GA
Mark episodes watched and rate them from 1 to 10; mark a season watched, which covers only aired episodes and never overwrites ratings.
**Done when:** marking a season watched is idempotent, skips future and unknown date episodes, keeps existing ratings, and specials can be tracked and rated.
- [ ] Design it (spec): `/architect episode and season tracking`

## Slice 5: Calculated ratings

### 13. Calculated season and show ratings · GA
Domain functions for season rating (mean of rated episodes) and show rating (equal weight mean of rated regular seasons), shown as personal ratings to one decimal, or Not rated.
**Done when:** unrated episodes and seasons are excluded, season 0 is excluded, unequal season lengths do not change season weight, and no ratings shows Not rated, never zero.
- [ ] Build it: `/develop calculated season and show ratings`

## Slice 6: TV status and progress

### 14. TV status and progress · needs a decision · GA
Five statuses with manual choices kept apart from automatic ones, overall progress from aired regular episodes, and TV entries joining the private watchlist.
**Done when:** status changes preserve episode history and ratings; progress excludes specials and unaired episodes; a zero eligible total shows an empty state; the chosen air date boundary is documented.
- [ ] Design it (spec): `/architect TV status and progress`

## Slice 7: Up Next and completion

### 15. Up Next · needs a decision
Private view showing the first unwatched aired regular episode for each Watching show, or "You're up to date."
**Done when:** it picks the correct episode in season and episode order, ongoing shows caught up show "You're up to date", and On Hold and Dropped shows are excluded.
- [ ] Design it (spec): `/architect Up Next`

### 16. Automatic completion · needs a decision · GA
Move a show to Completed only when TMDB says ended or canceled and every aired regular episode is watched, using complete metadata only, and reversible when the condition changes.
**Done when:** a partial fetch never completes a show, manual On Hold, Dropped and chosen statuses are never overwritten, and auto completion reverts when new episodes appear.
- [ ] Design it (spec): `/architect automatic completion`

## Slice 8: Launch readiness

### 17. SEO metadata and sitemap
Titles, descriptions, social cards and a sitemap for the public catalog pages.
**Done when:** public movie, TV and search pages carry accurate metadata and a sitemap lists reachable public pages; private pages are not indexed.
- [ ] Design it (spec): `/architect SEO metadata and sitemap`

### 18. Legal pages and TMDB attribution · needs a decision
Privacy policy, terms, and the TMDB attribution and branding required by its current terms.
**Done when:** attribution meets TMDB's current requirements and privacy and terms pages are linked from the site footer and sign up.
- [ ] Design it (spec): `/architect legal pages and TMDB attribution`

### 19. Security and acceptance verification · GA
Run the full `AGENTS.md` section 13 checklist with two test users, including direct data requests, shared cache checks and secrets absent from bundles.
**Done when:** all 15 acceptance items are verified or reported blocked with the reason, and no cross user read or write succeeds.
- [ ] Verify it: `/check verify security and acceptance verification`
- [ ] Test it: `/test security and acceptance verification`

### 20. Deploy and provider setup · needs a decision · GA
Vercel deployment, Supabase Cloud project, Google OAuth and auth redirects for local and deployed environments, verified email delivery. Also restores the Google button and its divider to the sign in and sign up pages, in the slot spec 0005 reserves, and runs the five authentication verify steps the local stack cannot: the breach refusal, the Google only account on `/account`, and the three rate limit steps. Remote migrations and deployment need your explicit approval in the plan.
**Done when:** the deployed app signs users in with Google and with email, the Google button is back on the sign in and sign up pages and works, recovery and confirmation emails arrive at a real mailbox, and environment variables target the intended projects.
- [ ] Design it (spec): `/architect deploy and provider setup`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Public profiles and social features**: ruled out of the MVP by `AGENTS.md`
- **Error monitoring and product analytics**: not selected for this pass
- **Account deletion**: from spec 0005. Undesigned, and it needs an elevated server side call that nothing else in the app uses, so it deserves its own decision before it is built

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` with 2 to 5 milestones; the tier's closing boxes; any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` and milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is; `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; for Beta and GA the suggested point is after `/test` |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards and tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (before the workflow) and `dropped` (de scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· GA`) sets that one feature's rigor above the project default; no tag inherits Beta.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
