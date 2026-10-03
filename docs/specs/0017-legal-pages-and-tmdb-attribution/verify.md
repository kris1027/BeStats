# Verify: Legal pages and TMDB attribution · spec 0017 · updated 2026-10-03
_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Gate (a person, before building)
- [ ] `rationale.md` "TMDB requirements as read on {date}" is filled from the live pages → AC-1
- [ ] `public/tmdb-logo.svg` is the unmodified logo from TMDB's logos page → AC-3
- [ ] `lib/legal/operator.ts` holds the owner's legal name instead of `TODO` → AC-8

## Commands
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` → all green, including the operator placeholder test → AC-8, AC-20, AC-21
- [ ] `pnpm build` → route table shows `○` for `/privacy` and `/terms`, and `◐` still shows for `/shows`, `/movies/[id]` → AC-5, AC-20
- [ ] `pnpm start`, `curl -s localhost:3000/sitemap.xml` on an indexable build → `/privacy` and `/terms` follow the two landings, absolute → AC-7, AC-23

## UI / manual (signed out)
- [ ] `/shows`, `/movies/550`, `/search?q=dune`, the 404 and `/sign-in` → each shows the footer with the verbatim TMDB sentence and the logo → AC-2, AC-4
- [ ] The logo's rendered ratio equals the file's, and it is visibly smaller than the BeStats name → AC-3
- [ ] `/privacy` and `/terms` at 320px, 390px and desktop → one `h1`, a last updated date, no sideways scroll, no clipped word → AC-6
- [ ] Tab through the footer → both links take a visible focus ring; targets measure 44px on mobile, 36px on desktop → AC-19
- [ ] A short page (the 404) → the footer sits at the foot of the viewport, not mid screen → AC-22
- [ ] `/sign-up` → the sentence sits under the button, both links open the right pages with no `next`, and submitting still works → AC-18
- [ ] View source of `/privacy` → no cookie set on the response, no `Set-Cookie` header → AC-20

## Content checks (a person reads the pages against the inventory)
- [ ] Every provider, cookie and retention statement in `/privacy` appears in the "What BeStats actually processes" table → AC-9, AC-10, AC-11, AC-13, AC-14
- [ ] Rights, one month response, and the Prezes UODO complaint line are present → AC-12
- [ ] Network panel on a title page → no request from the browser to `image.tmdb.org`, so "TMDB receives no personal data" holds; if one appears, the policy sentence changes → AC-10
- [ ] The terms state age 16, not a streaming service, TMDB not endorsing, as is, Polish law with consumer rights kept → AC-15, AC-16, AC-17

## Signed in
- [ ] `/watchlist`, `/upcoming` and `/account` → footer present, no layout shift, signed in state unaffected → AC-4, AC-20
- [ ] Sign out, then `/privacy` → same page, no redirect → AC-7

## Acceptance-criteria coverage
- AC-1 gate · AC-2, AC-3 footer steps and `components/layout/site-footer.test.tsx` · AC-4 route walk · AC-5 route table · AC-6 viewport steps · AC-7, AC-23 sitemap step and `app/sitemap.test.ts` · AC-8 `lib/legal/operator.test.ts` · AC-9 to AC-17 content checks · AC-18 sign up step and `app/(auth)/sign-up/sign-up-form.test.tsx` · AC-19 focus step · AC-20 `app/layout.test.ts`, `app/layout-purity.test.ts`, route table · AC-21 `design-tokens-boundary.test.ts` · AC-22 short page step
