# Verify: Design system and UI foundation · spec 0004 · updated 2026-09-21

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run `pnpm dev` first. The showcase route at `/showcase` renders every token,
primitive and state in one place, so most visual steps below happen there.

## Commands

- [ ] `pnpm typecheck` → passes → AC-21
- [ ] `pnpm lint:ci` → passes with no warnings → AC-21
- [ ] `pnpm test` → passes → AC-20, AC-21
- [ ] `pnpm build` → `/shows`, `/movies` and `/showcase` all listed as `○ (Static)`, no `instant = false` anywhere in `app/` → AC-18, AC-21
- [ ] `grep -ri "geist" app/ components/ lib/` → no matches → AC-2
- [ ] `grep -n "\.dark\|@custom-variant dark" app/globals.css` → no matches → AC-1
- [ ] `grep -rn "#FFC526\|#50C6E5\|#29CEA3\|#101416\|#08090C\|#090A0D\|#0C1419" app/ components/ --include="*.tsx"` → no matches, every value lives only in `globals.css` → AC-3, AC-4
- [ ] `pnpm build && pnpm start -p 3100`, then `curl -o /dev/null -w '%{http_code}' localhost:3100/showcase` → `404` → AC-19
- [ ] Same server: `curl -o /dev/null -w '%{http_code} %{redirect_url}' localhost:3100/` → `307` to `/shows` → AC-17
- [ ] Same server: `grep -rl "TMDB_READ_ACCESS_TOKEN\|SERVICE_ROLE" .next/static` → no matches → AGENTS.md section 11

## UI / manual

### Theme and type

- [ ] Open `/shows`, inspect `<body>` → computed background is `rgb(0, 0, 0)` and `:root` declares `color-scheme: dark` → AC-1
- [ ] Same page, computed `font-family` on `<body>` → starts with `Inter`; the network panel requests no Geist font file → AC-2
- [ ] On `/showcase`, inspect any glass pill → its computed `background` has the plate layer on `padding-box` and the rim on `border-box`, over a `1.5px` transparent border; no `border-image` anywhere → AC-3
- [ ] On `/showcase` under *Glass surfaces*, the rim follows the corner on the pill, the card, the panel and the selected pill, with no squared corners → AC-3

### The plate rule

- [ ] On `/showcase` under *The plate rule*, compare the two tiles: **Correct** is crisp white on a dark plate; **No plate** is barely legible on the cream artwork → AC-5
- [ ] On `/showcase`, the rating badge over the light poster in the grid is readable at a glance → AC-5

### Focus and keyboard

- [ ] On `/shows`, press Tab repeatedly → the brand, both tabs and Sign in each show a 2px near white ring at 2px offset → AC-6
- [ ] Click the same elements with a mouse → no ring is left behind → AC-6
- [ ] On `/showcase`, Tab to a badge sitting on a poster and to a button on flat black → the ring is visible against both → AC-6

### Poster card and grid

- [ ] On `/showcase`, the card with a poster and the card with none occupy the same footprint; toggling one to `posterUrl={null}` does not shift the row → AC-8
- [ ] Inspect the poster `<img>` → `fill` inside an `aspect-2/3` container, with a `sizes` string whose breakpoints match the column counts below → AC-8
- [ ] The card with no poster shows a film icon and its own title, with no invented placeholder image → AC-8
- [ ] Resize through 390, 640, 768, 1024, 1280 → the grid shows 2, 3, 4, 5 then 6 columns → AC-9
- [ ] At 390px wide, `document.documentElement.scrollWidth === clientWidth` → no horizontal page scroll → AC-9

### Badges

- [ ] On `/showcase` under *Badges*: the TMDB badge is amber, the personal score badge is cyan on its darker plate with a cyan rim, and both are fully rounded with plate, glass and rim → AC-10
- [ ] A TMDB badge with a null value renders nothing; a personal score with a null value renders "Not rated" → AC-10

### States and loading

- [ ] On `/showcase` under *States*, all three panels are centred glass on the panel plate at the panel radius, capped at 28rem, with a 32px icon in a muted circle → AC-11
- [ ] The error panel shows a retry action; the signed out panel shows a sign in link → AC-11
- [ ] Remove the `action` prop from the error panel in the showcase → the render throws rather than showing a dead end; put it back → AC-11
- [ ] Under *Loading*, the skeletons match the shape of the poster, the pill and the caption line, and pulse at about 2 seconds → AC-12
- [ ] Turn on Reduce Motion (macOS System Settings, or the browser's emulate CSS media feature) and reload → the pulse stops entirely rather than slowing → AC-12

### Shell

- [ ] On `/shows` at 1440px, the navbar is one row: brand, tabs, Sign in; scroll the page → content passes underneath a blurred bar that stays put → AC-13, AC-16
- [ ] At 390px, the navbar is two rows: brand and Sign in above a centred tab control → AC-13
- [ ] Follow a link to an anchored heading → the heading is not hidden behind the sticky bar → AC-13
- [ ] Click MOVIES → the URL becomes `/movies`, MOVIES lights up and carries `aria-current="page"`; press the browser back button → SHOWS lights up again with no stale state → AC-14
- [ ] Open `/movies/anything` directly → MOVIES is still selected, which proves selection comes from the path and not from client state → AC-14
- [x] On `/showcase` under *Overlays*, open the menu with Enter → focus lands inside the sheet; Tab cycles without leaving it; the page behind does not scroll; Escape closes it and focus returns to the menu button → AC-15 (Tab containment and scroll lock confirmed in a real browser; focus entry, Escape and focus return also asserted in `mobile-menu-sheet.test.tsx`)
- [ ] With the sheet open, inspect the page behind → it is hidden from assistive technology (`aria-hidden` or `inert`) → AC-15
- [ ] Inspect the navbar and the menu backdrop → both carry a 16px backdrop blur with no saturation change; a glass pill on flat black carries none → AC-16

### Contrast

- [ ] Sample each foreground and background pair the shipped UI uses against the brightest point of its glass gradient → body text at 4.5:1 or better, large text and interface boundaries at 3:1 or better; compare against the table in `rationale.md` → AC-7

## Value sourcing coverage

One step per row of the spec's Value sourcing table, exercising the edge that
breaks if the source is wrong.

- [ ] Selected media tab comes from the pathname: open `/movies` in a fresh tab with JavaScript throttled → MOVIES is already selected in the server rendered HTML → AC-14
- [ ] Poster URL comes from `imageUrl` in `lib/tmdb/images.ts`: confirm each caller passes `PosterCard` the absolute URL `imageUrl` returns, then pass a raw TMDB path instead → `next/image` treats it as a local file and the optimiser fails the request, which is why the conversion belongs at the caller → AC-8
- [ ] Poster dimensions come from the aspect ratio, not fixed pixels: render the same card at 390px and at 1440px → the frame stays 2:3 at both → AC-8
- [ ] The rim comes from the two layer technique: set a large `border-radius` on a glass surface → the rim follows it rather than squaring off → AC-3
- [ ] Blur comes from `--blur-glass`: change it in `globals.css` → the navbar and the menu backdrop both change, and nothing else does → AC-16
- [ ] The `/` destination and status come from `next.config.ts`: confirm the response is 307, not 308, so a browser does not cache it permanently → AC-17
- [ ] The showcase 404 comes from the `NODE_ENV` guard: `next dev` renders the page, a production build serves 404 → AC-19
- [ ] The missing poster fallback text comes from the `title` prop: render a card with a very long title and no poster → the tile shows that title truncated, never invented text → AC-8
- [ ] The TMDB star colour comes from `--color-rating-tmdb`: change the token → the star changes and the personal score star does not → AC-4
- [ ] The personal score colour comes from `--color-score-personal`: change the token → the score star and its rim change, and the TMDB star does not → AC-4
- [ ] The plate under a glass surface comes from the plate tokens: change `--color-glass-plate-panel` → the state panels change and the badges do not → AC-4, AC-5
- [ ] Focus colour comes from `--ring`: change the token → every focus ring changes, and no cyan or green appears → AC-6
- [ ] Skeleton shape comes from the same tokens as the real component: swap a `PosterCardSkeleton` for a `PosterCard` → nothing on the page moves → AC-12
- [ ] The retry action comes from the caller: the panel refuses to render an `error` variant without one → AC-11
- [ ] Type sizes come from the two sign in artboards: compare the rendered heading, label, field, button and link sizes against `design/desktop-sign-in-page.svg`, which is at true CSS scale → AC-7

## Acceptance-criteria coverage

- AC-1 · body background and no dark structure · covered by the theme steps and the `globals.css` grep
- AC-2 · Inter, no Geist · covered by the font steps and the `geist` grep
- AC-3 · three gradients plus shadow as utilities, rounded rim · covered by the glass surface steps and the hex grep
- AC-4 · semantic and product tokens · covered by the hex grep and the four token sourcing steps
- AC-5 · plate under every glass surface over artwork · covered by the plate rule steps
- AC-6 · focus ring · covered by the focus and keyboard steps
- AC-7 · WCAG AA · covered by the contrast step and the audit table in `rationale.md`
- AC-8 · poster card and fallback · covered by the poster card steps
- AC-9 · grid columns and 390px · covered by the two resize steps
- AC-10 · glass pill and its two badges · covered by the badge steps
- AC-11 · state panel and its enforced action · covered by the state steps
- AC-12 · skeletons and reduced motion · covered by the loading steps
- AC-13 · sticky navbar, two layouts · covered by the shell steps
- AC-14 · tabs as path derived links · covered by the tab steps
- AC-15 · modal menu sheet · covered by the overlay steps
- AC-16 · 16px blur, only where surfaces overlap · covered by the blur steps
- AC-17 · `/` redirect · covered by the curl step
- AC-18 · Server Components, routes prerender · covered by the build step
- AC-19 · showcase guarded in production · covered by the curl step
- AC-20 · Testing Library coverage · covered by `pnpm test`
- AC-21 · all four checks pass · covered by the command block
