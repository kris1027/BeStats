# 0017. Legal pages and TMDB attribution: a site footer, privacy and terms pages, and the sign up notice

**Date**: 2026-10-03
**Status**: Proposed

Scope feature: [18. Legal pages and TMDB attribution](../../scope/scope.md) · Beta tier

## Summary

BeStats gets a slim footer on every page that carries the TMDB notice and logo and links to two new public pages: a privacy policy at `/privacy` and terms of use at `/terms`. The sign up form gains one line under the button that links both. The policy is written for a single individual running the site from Poland, for an EU audience (GDPR), and states only what the code and the providers actually do today. Nothing here reads the session, so every public route keeps its prerendered shell.

Two things are deliberately not done by this spec: it does not claim TMDB's terms are met until a person has read the current terms (the network here could not reach themoviedb.org), and it does not pretend the policy is legal advice. Both are gates in the build plan.

## Requirements

**User stories**:
- As a visitor, I want to see what BeStats keeps about me and who to ask, before I create an account.
- As someone signing up, I want the terms and the privacy policy one click away from the form.
- As the owner, I want TMDB credited the way its terms require on every page that shows its data, so the API access is not at risk.
- As a Polish or EU resident, I want my GDPR rights and the supervisory authority named, and a way to have my data erased.

**Acceptance criteria** (the contract):

*Attribution*

- **AC-1**: Before any other build step, a person reads TMDB's current API terms and logo guidance (https://www.themoviedb.org/api-terms-of-use, https://www.themoviedb.org/about/logos-attribution) and records the wording, the allowed logo variants and the placement rule in `rationale.md` under "TMDB requirements as read on {date}". The research cache (`docs/.agent-cache/research/tmdb-api-facts.md` section 8) is secondhand and is not enough.
- **AC-2**: `SiteFooter` renders `TMDB_ATTRIBUTION` from `lib/tmdb` verbatim, so the wording has one home, plus the approved TMDB logo linking to `https://www.themoviedb.org`. A test fails if the footer text drifts from the constant.
- **AC-3**: The logo is a file a person adds at `public/tmdb-logo.svg`, copied unmodified from TMDB's logos page: no recolouring, no change of aspect ratio. `SiteFooter` draws it at a fixed height with its intrinsic aspect ratio, visibly smaller than the BeStats name, with `alt="TMDB"`. A test fails if the file is missing.
- **AC-4**: The footer appears on every route that uses the root layout, including the auth pages, the private pages and the 404, so there is no page showing TMDB data without the notice.

*Pages*

- **AC-5**: `/privacy` and `/terms` are static, prerendered routes with no request read, no Suspense boundary and no client component. The route table shows `○`.
- **AC-6**: Each page has one `h1`, section headings in order, a "Last updated" date taken from one constant in `lib/legal/`, and a prose column no wider than `max-w-3xl`. Both pass at 320px with no sideways scroll.
- **AC-7**: Both pages are public and indexable: `catalogMetadata()` gives each a title, a description and a canonical, they are added to the sitemap after the two landings, and neither joins `PRIVATE_PATH_PREFIXES` or the proxy matcher.
- **AC-8**: The operator's name and contact come from one module, `lib/legal/operator.ts`. The build fails (a unit test, not a runtime throw) while the name is still the placeholder `TODO`, so a production build cannot ship an anonymous controller.
- **AC-9**: Every statement in the policy is backed by the inventory in `rationale.md` ("What BeStats actually processes"). The policy names no provider, region, retention period or cookie that the inventory does not list.

*Privacy policy content* (GDPR, Poland)

- **AC-10**: States who the controller is (the individual operator), the contact email, what is collected (email, password hash held by Supabase Auth, session cookies, the Viewer's tracking data: movie state and ratings, TV status, episode state and ratings), why and on which basis (contract for the account and tracking; legitimate interest for security and hosting logs), who receives it (Supabase for auth and database, Vercel for hosting; TMDB receives no personal data because the app calls it server side with its own token), and that it is not sold or used for advertising.
- **AC-11**: States the cookies: only the Supabase session cookies, strictly necessary, set after sign in; no analytics, advertising or preference cookies. If any of those is added later, this page and the spec change first.
- **AC-12**: States the GDPR rights (access, rectification, erasure, restriction, portability, objection, withdrawal of consent where consent is the basis), how to use them (email the contact), the response time of one month, the right to complain to the President of the Personal Data Protection Office (Prezes UODO), and that giving the data is voluntary but required to hold an account.
- **AC-13**: States where data is processed and the transfer mechanism only as far as the inventory records them. Where the Supabase or Vercel region is not yet known (feature 20), the page says the owner will name it before launch, and the build gate in AC-8 covers the region constant the same way.
- **AC-14**: States retention: account and tracking data are kept until the Viewer asks for erasure; deletion is by email until account deletion exists (see Follow-up), with a stated turnaround.

*Terms content*

- **AC-15**: States that BeStats is a free tracking application, not a streaming service, hosts no video and links to none; minimum age 16 (Poland's age of digital consent); the Viewer is responsible for their password; no abuse, scraping or automated bulk use; ratings and tracking data are the Viewer's own and private to them.
- **AC-16**: States that catalog data comes from TMDB, may be wrong or change, is not guaranteed, and that BeStats is not endorsed or certified by TMDB (the same sentence as AC-2, not a second wording).
- **AC-17**: States the service is provided as is, may change or end, the operator may close accounts that break the terms, liability is limited only as far as Polish and EU consumer law allows, Polish law governs without removing a consumer's mandatory rights, and how the terms are changed (new date, notice on the page).

*Sign up and navigation*

- **AC-18**: `/sign-up` shows one line below the Create account button: "By creating an account you agree to the Terms and acknowledge the Privacy Policy", each name a link. It is plain text with links, not a checkbox, and it adds no field to the form, so the action and its validation are unchanged. The links open in the same tab and carry no `next`.
- **AC-19**: The footer links to Privacy and Terms with 44px touch targets on mobile and 36px on desktop, and every link has the visible focus ring. The footer is a Server Component with no state.

*Boundaries and checks*

- **AC-20**: The footer and both pages read no cookie, header or Supabase client and import nothing from `lib/supabase/`. `app/layout.test.ts` and `app/layout-purity.test.ts` stay green, and `/shows` and `/movies/[id]` keep `◐` in the route table.
- **AC-21**: `design-tokens-boundary.test.ts` stays green: the footer and pages use tokens from `app/globals.css`, and the logo is a file under `public/`, never an inline SVG with colour literals in a component.
- **AC-22**: The footer sits at the foot of the viewport on a short page (the 404, the sign in card) and below the content on a long one. The layout `NAVBAR_HEIGHTS` guard in `app/layout.test.ts` is unaffected.
- **AC-23**: The sitemap spec's follow-up closes: `app/sitemap.ts` lists `/privacy` and `/terms`, and `app/sitemap.test.ts` covers them.

## Decision

**Chosen option**: Option 1: Footer on every page, two static pages, copy kept in components

Add `components/layout/site-footer.tsx` to the root layout after `<main>`, `app/privacy/page.tsx` and `app/terms/page.tsx` as static Server Components with their prose written in JSX, a small shared `components/legal/legal-page.tsx` for the heading, date and column, and `lib/legal/` for the operator, the last updated date and the region facts. No dependency, no table, no environment variable.

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) for keeping both pages and the layout prerenderable · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking the footer and sign up line in the running app

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Footer

`SiteFooter` is a server component in the root layout, a sibling of `<main>` and outside every Suspense boundary, since it reads nothing.

- Layout: one row from `md`, stacked below it. Left: the TMDB logo above `TMDB_ATTRIBUTION`. Right: the two links, Privacy and Terms, then "© {year} BeStats". The year comes from a constant bumped with the policy date, not `new Date()`, which would make the page read request time under `cacheComponents`.
- There is no reference in `design/` for a footer or a legal page. Per `AGENTS.md` section 3 the approach is proposed here and needs approval: reuse `glass-plate` and `rim`, the navbar's type scale, `text-muted-foreground`, and square, unframed prose for the legal pages (the detail pages are square too). No new token.
- The footer is quiet on purpose: TMDB's guidance, as the research cache reads it, wants the logo less prominent than the app's own branding. AC-1 confirms or corrects that before the footer is styled.
- The logo is drawn with `next/image` `unoptimized` (an SVG is already small and `next.config.ts` allows only `image.tmdb.org` for optimised remote images), at a fixed height and `width="auto"` ratio, so it never shifts the layout.

### Legal pages

`LegalPage({ title, updated, children })` renders the `h1`, a "Last updated {date}" line and a `prose`-style column; the headings inside are `h2` and `h3` written by hand. Prose lives in the page files, so a reviewer reads the policy in one place. Facts that must agree with the code live in `lib/legal/facts.ts` (provider names, cookie names, retention wording) and are rendered, not retyped, so the inventory in `rationale.md` and the page cannot drift silently; a unit test asserts the cookie names against the Supabase config the app actually sets.

### Operator and the placeholder gate

`lib/legal/operator.ts` exports `OPERATOR = { name, email }`. The email is `kris1027.dev@gmail.com`, chosen by the owner. The name is `"TODO"` until the owner supplies the full legal name of the individual (a GitHub handle is not one). A unit test fails while it is `TODO`. That test is meant to be red on this branch until the owner fills it in, and CI should be allowed to merge only with it green, which is feature 20's checklist item.

### Sign up line

`SignUpForm` renders the sentence under `AuthSubmitButton`, inside the same `<form>`, as `<p className="text-center text-xs text-muted-foreground">` with two `next/link`s. It is not a field, so `signUpAction` and its tests are untouched. No checkbox: the terms bind by use, and a checkbox would need a stored, withdrawable record of consent that no table holds.

### Sitemap

`app/sitemap.ts` appends `/privacy` and `/terms` after the two landings, absolute, no `lastmod`, only when the deployment is indexable, the same rule as the rest.

## Build plan

Tracer Bullet: the first slice proves the pipe from the layout to a visible footer and a real page; later slices thicken.

1. **Gate (human, before any code)**: read TMDB's current terms and logo page, record them in `rationale.md`, add `public/tmdb-logo.svg`, supply the operator's legal name, satisfies **AC-1**, **AC-3** (file), **AC-8**
2. Add `lib/legal/operator.ts` and `lib/legal/facts.ts`, `components/legal/legal-page.tsx`, a stub `app/privacy/page.tsx` and `app/terms/page.tsx` with metadata, and a `SiteFooter` with the links only, mounted in the root layout; check the route table and that `/shows` and `/movies/[id]` keep `◐`, satisfies **AC-5**, **AC-7** (metadata), **AC-19**, **AC-20**, **AC-22**
3. Add the TMDB notice and logo to the footer with the drift and file-exists tests, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-21**
4. Write the privacy policy against the inventory, satisfies **AC-6**, **AC-9** to **AC-14**
5. Write the terms of use, satisfies **AC-15** to **AC-17**
6. Add the sign up line, and the sitemap entries with their tests, satisfies **AC-18**, **AC-23**
7. Proof: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; then in the running app check the footer on a long page, the 404, `/sign-in` and a private page at 320px, 390px and desktop, signed out and signed in, satisfies **AC-4**, **AC-6**, **AC-19**, **AC-20**, **AC-22**

## Consequences

**Positive**:
- Every page credits TMDB with the one constant the integration module already owns.
- The policy and terms exist before launch, written for the jurisdiction the owner actually operates in, and tied to a checked inventory rather than boilerplate.
- No dependency, table, cookie or environment variable; both pages are static.

**Negative / tradeoffs**:
- **The policy promises erasure and export on request, but account deletion is deferred** (scope, Deferred; spec 0005). Until it ships, erasure is a manual email handled by the owner within one month, which is a real operational duty for a GDPR controller. A self-serve delete and export is the honest fix and is listed in Follow-up.
- The policy cannot name the Supabase or Vercel region until feature 20 creates the projects; the build gate makes that a visible blocker, not a silent gap.
- The text is English only (`AGENTS.md` section 3). A Polish resident may expect Polish; a translation is out of scope here.
- This is a drafted policy, not legal advice. A lawyer's read is advisable before public launch, particularly the liability and governing law clauses.
- A footer on every page costs about 120px of height on a short mobile page and makes the 404 and the auth card scroll slightly sooner.

**Neutral**:
- No migration. Rollback is reverting the commit.
- The Google sign in is not live (feature 20). When it ships, the policy must name Google as a sign in provider, and that edit is in Follow-up.

### Changes to earlier specs

- Spec 0002 (AC-22): `TMDB_ATTRIBUTION` now has its display home, the footer.
- Spec 0016: its follow-up about legal pages in the sitemap is resolved by AC-7 and AC-23.

## Follow-up

- [ ] Feature 20 (deploy): name the Supabase and Vercel regions in `lib/legal/facts.ts`, update the policy for Google sign in once the button returns, and confirm the footer renders on the deployed site.
- [ ] Account deletion and data export: a self-serve path so the policy's erasure and portability rights do not depend on an email. Needs its own spec (an elevated server call; spec 0005's Deferred note).
- [ ] If analytics, error monitoring or any non-essential cookie is ever added (scope, Deferred), amend the policy and add a consent mechanism before shipping it.
