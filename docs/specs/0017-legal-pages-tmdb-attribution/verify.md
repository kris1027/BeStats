# Verify: Legal pages and TMDB attribution · spec 0017 · updated 2026-10-03
_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Signed out at 1440px, open `/shows` and scroll to the bottom → the footer is one row: TMDB logo (14px tall) and the exact notice on the left, Privacy Policy, Terms of Service and `© BeStats · Krzysztof Obarzanek` on the right, with no year and no email → AC-1, AC-3, AC-4, AC-5
- [x] Repeat on `/movies/550`, `/sign-up` and an unknown URL such as `/nope` (a 404) → the same footer on each → AC-1
- [x] Signed in, open `/watchlist` → the same footer, nothing user specific in it → AC-1
- [x] Click the TMDB logo → `https://www.themoviedb.org` opens in a new tab → AC-2
- [x] Click Privacy Policy, then Terms of Service in the footer → each page opens with its `h1`, `Last updated 3 October 2026` (or the current `LEGAL_LAST_UPDATED`) and its sections in the AC-8 / AC-9 order → AC-7, AC-8, AC-9
- [x] Open `/privacy#cookies` directly → the Cookies heading lands below the sticky navbar, at 1440px and at 375px → AC-7
- [x] Read both pages against the Privacy Policy facts and Terms of Service facts tables in the spec → every fact is stated, nothing contradicts them, and analytics, ads, data sales, newsletters, payment data and profiling appear only as denials → AC-8, AC-9, AC-11
- [x] On both pages, the contact email is a `mailto:` link, and the UODO and TMDB links open in a new tab → AC-7, AC-10
- [x] Open `/sign-up` with the network throttled → the line `By creating an account, you agree to the Terms of Service and acknowledge the Privacy Policy.` shows while the form is still a skeleton, and both links work → AC-14
- [x] At 375px on `/privacy` and `/shows` → the footer stacks (logo and notice, links, © line), links are 44px tall, and nothing scrolls sideways → AC-5
- [x] Tab through the footer → each link shows the 2px focus ring → AC-5, AC-15
- [x] On `/sign-in` and the 404 (short pages) → the footer sits at the bottom of the viewport → AC-5

## Commands
- [x] `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` → all pass → AC-15
- [x] `pnpm build` → `/privacy` and `/terms` are in the route table and their prerendered HTML holds the full page; `/shows` and `/movies` stay `◐` → AC-1, AC-6 (see the note below)
- [x] `grep -c "otherwise approved by TMDB" .next/server/app/shows.html` after a build → 1, so the footer is in the static shell → AC-1, AC-3
- [x] `grep -c "By creating an account" .next/server/app/sign-up.html` → 1, so the sign up line is in the static shell → AC-14
- [x] Build with `NEXT_PUBLIC_SITE_URL` unset, then `pnpm start` → `/privacy` and `/terms` answer 200 with no `rel="canonical"` → AC-12
- [x] Build with `VERCEL_ENV=production` and a site URL, then open `/sitemap.xml` → `/privacy` and `/terms` follow `/movies` and `/shows`, before the first movie → AC-13
- [x] `curl -sI` `/privacy` and `/terms` with no cookie → 200, no `location` header → AC-6
- [x] Change one byte of `public/tmdb-logo.svg` and run `pnpm test components/layout/tmdb-logo` → it fails, then restore the file → AC-2

## Value sourcing
- [x] Change `CONTACT_EMAIL` in `lib/legal/operator.ts` temporarily → both pages show the new address, the footer shows none → AC-10
- [x] Change `LEGAL_LAST_UPDATED` to `2026-01-01` and run with `TZ=America/Los_Angeles pnpm dev` → both pages read `1 January 2026`, never `31 December 2025` → AC-7
- [x] Change the TMDB notice in `lib/tmdb/constants.ts` temporarily → the footer and `/terms` both follow, and `lib/tmdb/surface.test.ts` fails → AC-3
- [x] Remove Vercel from `PROCESSORS` temporarily → it disappears from Who processes your data → AC-10, AC-11

## Note on AC-6
The build marks `/privacy` and `/terms` as `◐`, not `○`. The page bodies are fully static, but the root layout's `AccountSlot` reads the session behind a Suspense boundary, so every page route in this app is partially prerendered (`/showcase` and `/_not-found` too). A `○` would need the account control out of the layout. `/architect` should amend AC-6 to "partially prerendered, with the whole page body in the static shell".

## Acceptance-criteria coverage
- AC-1 footer on every route, static shell · AC-2 logo link and hash · AC-3 notice constant · AC-4 links and © line · AC-5 layout, touch, focus · AC-6 public, static body, proxy · AC-7 reading column, date, anchors · AC-8 privacy sections · AC-9 terms sections · AC-10 operator module · AC-11 no false claims · AC-12 metadata, no canonical without site URL · AC-13 sitemap order · AC-14 sign up line · AC-15 checks and browser pass
