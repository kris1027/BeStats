# 0004. Design system and UI foundation

**Date**: 2026-09-21
**Status**: In Progress

Scope feature: [5. Design system and UI foundation](../../scope/scope.md) · Beta tier

## Summary

BeStats gets one dark visual language, taken literally from the sixteen reference drawings in `design/`: a pure black page with translucent "glass" surfaces (panels that let a little of what is behind them show through) sitting on solid dark plates. This spec turns those drawings into code: one set of theme values, a small set of reusable pieces (buttons, inputs, pills, cards, skeletons), the shared loading, empty, error, missing poster and signed out states that the drawings never covered, and the top navigation bar that every page will sit under. It exists so that every later feature composes pieces that already exist instead of inventing a look of its own.

The one rule worth knowing before you build: a glass surface on its own is close to invisible over a poster. Real numbers are in `rationale.md`. Every glass surface that can land on artwork must paint its opaque plate first, and that is a correctness rule, not decoration.

## Requirements

**User stories**:

- As a visitor, I want every page to look like one product, so that nothing feels half finished or borrowed from somewhere else.
- As a keyboard user, I want to see where I am at all times, so that I can use BeStats without a mouse.
- As someone on a phone, I want the navigation and menu to work with my thumb, so that the app is usable away from a desk.
- As the engineer building feature 7 onward, I want the poster card, badges and empty states to already exist, so that I compose rather than invent.
- As the engineer reviewing a change, I want one place showing every piece and every state, so that drift is visible.

**Acceptance criteria**:

- **AC-1**: `app/globals.css` defines exactly one palette. There is no `.dark` block, no `@custom-variant dark`, and no light values. `color-scheme: dark` is declared, and the rendered `body` background is `#000000`.
- **AC-2**: Inter is loaded through `next/font/google` as the variable font, with `subsets: ["latin"]` and `display: "swap"`, and mapped to `--font-sans`. One file covers weights 400 through 800. `Geist` and `Geist_Mono` no longer appear in `app/layout.tsx`, and no Geist font file is requested by the running app.
- **AC-3**: The three gradients and the drop shadow exist once, as Tailwind v4 custom utilities in `app/globals.css`, named `glass`, `glass-rim`, `glass-selected`, `glass-plate` and `glass-shadow`. No component restates a gradient colour stop inline. The rim is drawn with the two layer background technique (plate gradient on `padding-box`, rim gradient on `border-box`, over a transparent 1.5px border) so that it follows `border-radius`; `border-image` is not used, because it does not respect rounded corners.
- **AC-4**: The shadcn semantic tokens (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`) resolve to the black palette. Product tokens exist for the three meaning carrying colours (TMDB amber `#FFC526`, personal score cyan `#50C6E5`, Planned green `#29CEA3`), for the four plates (`--color-glass-plate` `#101416` for controls and badges, `--color-glass-plate-panel` `#08090C` for panels, `--color-glass-plate-sheet` `#090A0D` for the menu sheet and overlays, `--color-glass-plate-score` `#0C1419` for the personal score badge), and for the radius scale (`--radius` `0.75rem` for cards, `--radius-panel` `1.5rem` for panels and sheets; pills are fully rounded). None of these values is written as a literal outside the token definitions.
- **AC-5**: Every glass surface that can render over artwork paints an opaque plate underneath it first. The rule is enforced at the component level (`GlassPill`, `PosterCard`'s badge and control slots, `MobileMenuSheet`, `StatePanel`), not by the raw utility, so the showcase route can demonstrate the correct and the plate-less case side by side.
- **AC-6**: Focus is a 2px `#F6F7F8` outline with a 2px offset, driven by the `--ring` token and triggered on `:focus-visible` only, so a mouse click leaves no ring behind. It is visible on every interactive element over black, over glass and over poster artwork, and every interactive piece is reachable and operable by keyboard alone.
- **AC-7**: Every foreground and background pair the shipped UI actually uses meets WCAG AA, measured against the brightest point of the glass gradient over its plate: 4.5:1 for body text, 3:1 for large text and interface boundaries. Any value adjusted away from `design/` to reach that bar is listed in `rationale.md`.
- **AC-8**: A poster card renders its image with `next/image` using `fill` inside an `aspect-[2/3]` container, with a `sizes` string matching the grid in AC-9, plus a rim, a title caption, and named slots for a top right badge and a bottom control row. When the poster is missing it renders a glass fallback tile with a lucide film icon and the title at an identical footprint, so the grid does not shift.
- **AC-9**: The poster grid is mobile first with these column counts: 2 at base, 3 at `sm`, 4 at `md`, 5 at `lg`, 6 at `xl`. It is usable with no horizontal page scroll at 390px wide.
- **AC-10**: A glass pill badge primitive exists with icon and label slots and the geometry of the rating badge in `design/show-movie-card.svg`, which is the canonical pill: fully rounded, plate then glass then rim. (`badge-legend.svg` draws the marks without a pill and is the source for the icons and colours only.) Two worked examples ship with it: the TMDB rating badge in amber and the personal score badge in cyan on the score plate with its cyan rim.
- **AC-11**: One state panel primitive covers the empty, error and signed out cases, rendered as a centred glass panel on `--color-glass-plate-panel` at `--radius-panel`, max width 28rem, containing a 32px lucide icon in a muted circle, a heading at 18px weight 600, body copy at 15px in the muted foreground, and an action slot rendered as the pill button. The error variant always renders a retry action and the signed out variant always renders a sign in link. Neither can be rendered without one.
- **AC-12**: Loading is glass skeletons in the shape of the content they replace (poster tile, badge pill, title line), streamed through Suspense boundaries, pulsing at 2 seconds ease in out, with the pulse suppressed under `prefers-reduced-motion`.
- **AC-13**: The navigation bar is sticky at the top with real backdrop blur, in its signed out form, with a desktop layout and a distinct two row mobile layout that swap at Tailwind's `md`. Content scrolls underneath it and anchored headings are not hidden behind it.
- **AC-14**: The SHOWS and MOVIES control renders as links to `/shows` and `/movies`, with the selected state derived from the current path, not from client state.
- **AC-15**: The mobile menu is a modal dialog sheet. Focus moves into it on open, is trapped while open, and returns to the menu button on close. Escape dismisses it, background scrolling is locked, and the page behind is hidden from assistive technology.
- **AC-16**: Backdrop blur is a 16px blur with no saturation adjustment, applied only to surfaces that overlap content: the navigation bar, the mobile menu sheet, and badges sitting on posters. Glass over flat black carries no blur.
- **AC-17**: `/` redirects to `/shows` through the `redirects()` array in `next.config.ts` as a temporary (307) redirect, not through a Server Component, so no render is involved and the redirect is never cached permanently by a browser. `/shows` and `/movies` are placeholder pages rendering the shell and the empty state panel. `app/page.tsx` and all other Next.js starter content are deleted.
- **AC-18**: Components are Server Components by default. The only client boundaries are the mobile menu toggle and the segmented control's active state, neither of which reads a server dynamic API, so neither forces a route out of the static shell. `pnpm build` prerenders `/shows` and `/movies` with no `instant = false` opt out.
- **AC-19**: A development only showcase route renders every token, primitive, badge, and state side by side, including the correct and plate-less glass surfaces from AC-5. It calls `notFound()` when `NODE_ENV` is `production`, so it prerenders to a static 404 in a production build while still rendering under `next dev` and under Vitest.
- **AC-20**: Testing Library tests cover, for the interactive pieces, keyboard operation, visible focus, and correct roles, plus the dialog sheet's focus trap and return.
- **AC-21**: `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` and `pnpm build` all pass.

## Decision

**Chosen option**: Option 2: Token layer plus adapted shadcn primitives plus the app shell.

Extract the design language from `design/` into Tailwind v4 theme tokens and a handful of custom glass utilities, build the primitives by generating shadcn components and restyling them to the references, and ship the sticky navigation shell, poster card, grid and shared state patterns as the first real consumers of that system.

**Implementation skills**: `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`)

## Rationale

Reasoning, the options weighed, the contrast audit and the artboard scale audit: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. This feature persists nothing and reads no database. The only durable artifacts are CSS custom properties and React components. Stage (b) of the design conversation was recorded as not applicable rather than skipped.

**State transitions**: one, the mobile menu.

```
closed --(menu button, Enter/Space/click)--> open
open   --(close button | Escape | route change | outside click)--> closed
```

On entering `open`, focus moves to the sheet and the page behind becomes inert. On returning to `closed`, focus returns to the menu button that opened it.

**Component surface** (the equivalent of an API table for a UI foundation; "server" means it renders with no client JavaScript):

| Component | Props (key ones) | Server / client | Notes |
|---|---|---|---|
| `AppShell` (root layout) | `children` | server | Sticky navbar plus page region plus scroll padding offset |
| `Navbar` | `variant: "signed-out"` | server | Signed in variants belong to feature 6 |
| `MediaTypeTabs` | none | client | Reads the current path to mark the selected tab |
| `MobileMenuSheet` | `children` | client | Base UI dialog; trap, Escape, scroll lock, focus return |
| `GlassPill` | `icon`, `children`, `tone: "neutral" \| "score"` | server | Plate, glass, rim, fully rounded; the badge shell |
| `TmdbRatingBadge` | `value: number \| null` | server | Amber star; renders nothing when value is null |
| `PersonalScoreBadge` | `value: number \| null` | server | Cyan star and cyan rim; "Not rated" when null |
| `PosterCard` | `title`, `posterPath \| null`, `href`, `badge?`, `controls?` | server | 2:3 frame, rim, caption, named slots |
| `PosterGrid` | `children` | server | Mobile first column growth |
| `StatePanel` | `variant: "empty" \| "error" \| "signed-out"`, `title`, `description`, `action` | server | Action required for `error` and `signed-out` |
| `Skeleton` | `shape: "poster" \| "pill" \| "line"` | server | Pulse suppressed under reduced motion |
| Adapted shadcn: `Button`, `Input`, `Card`, `Dialog`, `ToggleGroup` | per shadcn | mixed | Generated with the CLI, then restyled |

**Resolved values** (settled here so the build never infers them; the derivation is in `rationale.md`):

| Thing | Value |
|---|---|
| Rim technique | Two layer background: plate gradient on `padding-box`, `glass-rim` gradient on `border-box`, over a transparent 1.5px border. Not `border-image`, which ignores `border-radius` |
| Plates | control and badge `#101416` · panel `#08090C` · sheet and overlay `#090A0D` · personal score badge `#0C1419` |
| Radii | pill fully rounded · card `--radius` `0.75rem` · panel and sheet `--radius-panel` `1.5rem` |
| Backdrop blur | 16px, no saturation, only on navbar, menu sheet, and badges over posters |
| Focus | 2px `#F6F7F8`, 2px offset, `:focus-visible` only |
| Font | Inter variable via `next/font/google`, `subsets: ["latin"]`, `display: "swap"` |
| Grid columns | 2 base · 3 `sm` · 4 `md` · 5 `lg` · 6 `xl` |
| Poster sizing | `next/image` with `fill` inside `aspect-[2/3]`, `sizes` matching the grid above |
| Skeleton pulse | 2s ease in out, suppressed under `prefers-reduced-motion` |
| State panel | centred glass panel, max width 28rem, `--radius-panel`, 32px lucide icon in a muted circle, heading 18/600, body 15 muted, action as the pill button |
| Home redirect | `redirects()` in `next.config.ts`, `/` to `/shows`, temporary (307) |
| Showcase exclusion | `notFound()` when `NODE_ENV` is `production` |
| Type scale | from the two sign in artboards, the only 1x references: heading 36/-1, subtitle 16, label 15/600, field 16, button 18/700, link 14, divider 13 |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render the selected media tab | which of SHOWS / MOVIES is selected | the current pathname, read in the client island (AC-14); never client state |
| Render a poster | the image URL | `buildImageUrl` in `lib/tmdb/images.ts` (spec 0002); `image.tmdb.org` is the only allowed remote pattern in `next.config.ts` |
| Render a poster | the image dimensions | no fixed pixels: `fill` inside an `aspect-[2/3]` container, with `sizes` derived from the AC-9 column counts, so the artboard scale uncertainty never reaches the build (AC-8) |
| Render any glass rim | the rounded gradient stroke | the two layer background technique in Resolved values, not `border-image` (AC-3) |
| Render a blurred surface | the blur radius | Resolved values, 16px; `design/` deliberately supplies none, since the drawings state the glass is simulated (AC-16) |
| Redirect from `/` | the destination and status | `next.config.ts` `redirects()`, 307 to `/shows` (AC-17) |
| Render the showcase route in production | a 404 | the `NODE_ENV` guard in Resolved values (AC-19) |
| Render a missing poster | the fallback text | the `title` prop already passed to the card; no metadata is invented (AGENTS.md section 3) |
| Render a TMDB rating badge | the star colour | `--color-rating-tmdb` (AC-4) |
| Render a personal score badge | the star and rim colour | `--color-score-personal` (AC-4); kept visually distinct from TMDB per AGENTS.md section 9 |
| Render any glass surface | the plate colour beneath it | `--color-glass-plate` for controls, `--color-glass-plate-panel` for large panels (AC-5) |
| Render focus | the ring colour and width | `--ring` (AC-6); deliberately not the cyan or green, which carry meaning |
| Render a skeleton | the shape and footprint | the same tokens the real component uses, so no layout shift on swap (AC-12) |
| Render the state panel | the retry action | supplied by the calling feature; the panel refuses to render an `error` variant without one (AC-11) |
| Render type at any size | the pixel value | the sign in artboards, which are the only true scale references; every other artboard is divided by its export scale (see the artboard scale audit in `rationale.md`) |

**Key invariants**:

- Glass is never the only layer over artwork. Plate first, then glass, then rim. Enforced by the components that own a glass surface, not by the raw utility, and demonstrated against the plate-less case in the showcase.
- The three meaning carrying colours appear only as tokens. Amber always means a TMDB community rating, cyan always means the user's own score, green always means Planned. No other element borrows them, including focus.
- Gradient colour stops exist in exactly one file, `app/globals.css`.
- A state panel in the `error` or `signed-out` variant always offers a way forward.
- The static shell stays a Server Component. A new client boundary in the shell is a decision, not a convenience.

**Security model**: no user data, no authentication and no authorisation are in scope. The navigation bar ships only its signed out form, so no account information reaches any component here. No compliance scope applies. Note for later: the signed in navbar and the account initial arrive with feature 6, and must not be built by reading a client supplied identity.

**Configuration required**: none. No new environment variables, secrets, or third party credentials. Inter is fetched through `next/font/google` at build time, which needs no key.

**Critical test scenarios**:

- Happy path: `/` redirects to `/shows`, the shell renders with the sticky blurred navbar, and the placeholder page shows the empty state panel, verifies **AC-13**, **AC-17**.
- Happy path: a poster card with a real poster and a poster card with `posterPath: null` occupy identical space in the grid, verifies **AC-8**.
- Failure case: the glass pill rendered over a light poster without its plate is visibly unreadable, and the showcase shows this beside the correct version so the rule is not theoretical, verifies **AC-5**.
- Failure case: `prefers-reduced-motion` suppresses the skeleton pulse rather than leaving a permanently animating page, verifies **AC-12**.
- Keyboard: tabbing through the navbar reaches the brand, both tabs and the sign in button, each showing the near white ring at 2px with offset, verifies **AC-6**.
- Keyboard: opening the mobile menu moves focus into the sheet, tab cycles within it, Escape closes it, and focus lands back on the menu button, verifies **AC-15**.
- Auth/permission: not applicable to this feature; the shell ships signed out only. The signed out state panel variant renders a sign in link that goes nowhere useful until feature 6, which is expected and noted, verifies **AC-11**.
- Build: `pnpm build` prerenders all three routes with no `instant = false`, verifies **AC-18**, **AC-21**.

## Build plan

Ordered by the project's **Tracer Bullet** approach. Tasks 1 to 3 are the thin thread: theme tokens, one glass utility, and one real route rendering through the real shell, proven in the running app before anything is thickened. Tasks 4 onward add one strand at a time, each ending in something visible.

1. Replace the palette in `app/globals.css` with the single black theme, remap the shadcn semantic tokens, add the product tokens (three accents, four plates, two radii), delete the `.dark` block and the dark variant, declare `color-scheme: dark`. Swap Geist for the Inter variable font in `app/layout.tsx`, satisfies **AC-1**, **AC-2**, **AC-4**
2. Add the `glass`, `glass-rim`, `glass-selected`, `glass-plate` and `glass-shadow` custom utilities, using the two layer background technique for the rim, plus the `:focus-visible` ring rule on the `--ring` token. Confirm the rim follows `border-radius` on a pill, a card and a panel before moving on, satisfies **AC-3**, **AC-6**
3. The thin thread end to end: root layout with the sticky blurred desktop navbar in signed out form, the `/` to `/shows` redirect in `next.config.ts`, deletion of `app/page.tsx` and the starter content, and `/shows` and `/movies` as placeholder pages rendering a first cut of the empty state panel. Verify it in the running app with the `next-dev-loop` skill before continuing, and confirm the artboard scale inference against what you see, satisfies **AC-13**, **AC-16**, **AC-17**, **AC-18**
4. Thicken the shell: the two row mobile navbar, the SHOWS and MOVIES links with path derived selection, and the mobile menu dialog sheet with its trap, Escape, scroll lock and focus return, satisfies **AC-14**, **AC-15**
5. Generate the needed shadcn components with the CLI and restyle each to the references: button, input, card, dialog, toggle group. Confirm while doing so that `@base-ui/react`'s Dialog really does provide the focus trap, scroll lock, inert background and focus return that AC-15 assumes; if it does not, implement the missing part explicitly. Record which components were generated and what changed, satisfies **AC-15**, **AC-21**
6. Build the glass pill badge primitive to the geometry of the rating badge in `design/show-movie-card.svg`, plus its two worked examples, the TMDB rating badge and the personal score badge on the score plate. The remaining six legend badges stay with the features that own their behaviour, satisfies **AC-5**, **AC-10**
7. Build the poster card, the missing poster fallback tile, and the responsive poster grid, satisfies **AC-8**, **AC-9**
8. Finish the state panel with all three variants and the enforced action, and add the skeleton shapes with reduced motion handling, satisfies **AC-11**, **AC-12**
9. Run the contrast audit against the real rendered surfaces, adjust any value that misses AA by the smallest amount that passes, and record every adjustment in `rationale.md`, satisfies **AC-7**
10. Build the showcase route covering every token, primitive, badge and state, including the plate rule demonstration, with the `NODE_ENV` guard, and confirm a production build serves it as a 404 while `next dev` still renders it, satisfies **AC-19**, **AC-5**
11. Write the Testing Library tests for keyboard operation, visible focus, roles and the dialog focus trap, satisfies **AC-20**
12. Run `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` and `pnpm build`, and verify the changed flows in the running app, satisfies **AC-21**

## Consequences

**Positive**:

- Every later UI feature composes existing pieces. Features 7, 9, 10, 11 and 15 inherit the card, grid, badges and state patterns rather than each deriving them.
- One palette and one gradient definition means a visual change happens in one file.
- The plate rule is captured as a testable invariant rather than tribal knowledge, which is the failure mode this design would otherwise hit repeatedly.
- Server Components by default keeps the static shell large, which is what `cacheComponents` rewards now and what the partial prefetching work would reward later.
- Accessibility is settled up front at the token level, so focus and contrast do not have to be argued per feature.

**Negative / tradeoffs**:

- Using lucide for the badge marks means the Planned bookmark, the stop square, the play circle and the two stars will not match the reference geometry exactly. The badge legend is a deliberate visual vocabulary, so this is a real fidelity loss, consciously accepted in exchange for one icon source and no hand maintained SVG.
- Dropping the light palette means adding a light theme later is a restructure, not a toggle. Given every reference is black only, that is the right bet, but it is a bet.
- `/shows` and `/movies` ship as placeholders with no owning feature in the scope. Unowned placeholders tend to linger.
- The showcase route and its tests are maintenance that produces no user facing value. If they are not updated alongside changes they become misleading, which is worse than not having them.
- Backdrop blur on the navbar costs compositing work on every scroll, and on low end phones a full width blurred bar is the most expensive thing on the page.

**Neutral**:

- `components/` and `hooks/` are created for the first time; `components.json` already points at them.
- The Next.js starter content in `app/page.tsx` is deleted, which is a visible change to anyone running the app today.
- The scale of the `design/` artboards varies, so `/develop` normalises them rather than reading pixel values directly. The method is recorded in `rationale.md`.

## Follow-up

- [ ] The scope has no browse or home feature, so `/shows` and `/movies` will carry placeholder pages with no owner. Consider enrolling a browse feature in `docs/scope/scope.md` so the placeholders get an owner rather than lingering.
- [ ] Only the two sign in artboards are at true CSS scale. The navbar and page artboards are exported at roughly 2x and the derived values in this spec are an inference. Confirm them visually in the running app during task 3, and correct this spec if the inference is wrong.
- [ ] The six remaining legend badges (Planned, Plan, Stop watching, Watch again, Next episode, Release date) are specified here as a vocabulary but built by features 8, 12, 14 and 15. Check at each of those that the shared pill is reused rather than re-derived.
- [x] The UI conventions this spec establishes (the plate rule, the token vocabulary, the server by default policy) are recorded in `components/AGENTS.md`, with the root `AGENTS.md` pointing at it.
- [x] Assumption confirmed in build task 3: `usePathname` in the segmented control reads no server dynamic API, so the shell stays in the static shell under `cacheComponents` and the routes still prerender.
- [ ] Assumption partly confirmed in build task 5: the installed `@base-ui/react` Dialog supplies the inert background, Escape close and focus return, and `mobile-menu-sheet.test.tsx` asserts them. Tab containment and scroll locking are browser only, so jsdom cannot assert them; the two AC-15 steps in `verify.md` still need a real browser pass.
- [ ] `next-cache-components-optimizer` is installed and relevant to keeping these routes instant, but this feature only needs the routes to prerender. Revisit once real content pages exist.
