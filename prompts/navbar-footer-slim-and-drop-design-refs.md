# Slim navbar and footer, handle-only credit, drop `design/`

## Goal

Lighten the app shell. The navbar loses its background, border and blur, and every control in it shrinks to one 40px height. The footer loses its top border and tightens. The footer credit becomes `© BeStats · Crafted with love by kris1027`, linked to GitHub, and the legal pages name the operator by that handle instead of a legal name. The `design/` folder is deleted, and the living docs stop treating it as the source of truth.

## Inspected

- `components/layout/navbar.tsx`, `media-type-tabs.tsx`, `library-nav.tsx`, `account-slot.tsx`, `mobile-menu-sheet.tsx`, `site-footer.tsx` and their tests
- `components/search/navbar-search.tsx`, `quick-search.tsx`, `mobile-search-overlay.tsx`
- `components/ui/button.tsx` (sizes `sm`, `touch`, `icon`, `icon-touch`), `app/globals.css` (`@utility` blocks, `--blur-glass`)
- `lib/legal/operator.ts`, `boundary.test.ts`, `operator.test.ts`, `app/privacy/page.tsx`, `app/terms/page.tsx` and their tests
- `AGENTS.md`, `components/AGENTS.md`, `docs/scope/scope.md`, and every file that names `design/` (about 50; no test or build step reads the folder)

## Skills used

`mattpocock-skills:grilling` (decisions below). `next-dev-loop` for the runtime check.

## Decisions

### Navbar

1. **Sticky and transparent.** `<header>` keeps `sticky top-0 z-30` and drops `border-b border-border bg-background/70 backdrop-blur-glass`. Content scrolls visibly underneath. The pills stay readable through their own glass plates. The `BeStats` wordmark sits directly over content, and that is accepted. `scroll-padding-top` stays because the bar is still sticky.
2. **One 40px control height at every width:**
   - `MediaTypeTabs` and `LibraryNav variant="bar"` links: `h-9` → `h-7`. The pill padding becomes `p-[4.5px]`, so tab, padding and the 1.5px rim add up to exactly 40px (found during the runtime check: `p-1.5` measured 43px).
   - Desktop search field and its fallback (`QuickSearch` in the navbar, `NavbarSearchFallback`): `h-12` → `h-10`. Only the navbar instance shrinks: the `/search` page and the mobile overlay pass their own class, so `QuickSearch` takes the height through `className`.
   - Sign in, account and Sign out: `h-10`. Desktop avatar stays `size-7`. Mobile avatar goes from `size-9` to `size-8`, inside a 40px button.
   - Mobile search trigger, avatar button and menu trigger: `size-10`.
   - The bar's own padding tightens to `py-2` mobile and `md:py-2`, with `gap-2` between the mobile rows.
3. **Hidden 44px tap area on mobile (AGENTS.md section 3 still holds).** A new `@utility hit-area` in `globals.css` sets `position: relative`, plus an `::after` with `content: ""; position: absolute; inset: -3.5px`. The pseudo element is placed from the padding box, inside the 1.5px glass border, so the offset is the border plus 2px: 44px on a glass control, 47px on a borderless one. `hit-area-tab` (`inset: -9.5px -2px`) does the same for a 28px tab. The runtime check found that `-2px` gave only 41px. The glass utilities use no pseudo elements, so nothing collides. Every 40px navbar control carries `hit-area`, which is harmless on desktop. Two new button sizes, `bar` (`h-10 rounded-full px-4 text-[13px] font-bold hit-area`) and `icon-bar` (`size-10 rounded-full hit-area`), keep this in one place instead of overriding classes at each call site.
4. **The mobile menu sheet doesn't change.** It keeps 44px rows and buttons.

### Footer

5. Drop `border-t border-border`. Padding `py-6` → `py-4`, mobile gap `gap-4` → `gap-3`. Link tap areas stay as they are (`min-h-11`, `md:min-h-9`); they have no visible box.
6. The bottom line becomes `© BeStats · Crafted with love by kris1027`. Only `kris1027` is a link: it goes to `OPERATOR_GITHUB_URL`, uses `target="_blank" rel="noopener noreferrer"`, and wears the `FooterLink` colours (`text-text-link`, underline on hover).

### Legal

7. `OPERATOR_NAME` is removed. `lib/legal/operator.ts` gains `OPERATOR_HANDLE = "kris1027"` and `OPERATOR_GITHUB_URL = "https://github.com/kris1027"`. The privacy page (lines 48 and 213) and the terms page (lines 44 and 150) render the handle as a link to the GitHub profile, styled with `LEGAL_LINK_CLASS`. The contact email and the country stay.
8. `LEGAL_LAST_UPDATED` → `2026-10-06`, because the legal text changes (AGENTS.md rule, spec 0017).
9. You chose this knowing GDPR expects an identifiable controller. The GitHub profile carries your name, and the contact email stays on both pages.

### `design/` removal and docs

10. Delete `design/` (16 SVGs).
11. **New UI reference:** the current implementation plus `/showcase` (tokens, glass vocabulary, states). A new screen with no precedent gets its layout described in its plan and approved before it is built.
12. **Living docs that get rewritten:**
    - `AGENTS.md`: §2 step 3 ("relevant files in `design/`" → the existing UI and `/showcase`), §2 step 5 ("inspected code and designs" → "inspected code"), §3 (the reference paragraph and "Do not redesign supplied views"), §10 ("approved design" → "approved plan"), §13 item 14 (matches the existing UI and `/showcase`), §13 closing line ("reference designs"), §14 ("Follow the designs" → "Follow the existing UI"), and the repo facts line that lists `design/` and says `prompts/` doesn't exist. Also add one repo fact: the navbar is transparent, and its controls are 40px with a 44px `hit-area`.
    - `components/AGENTS.md`: the opening line (token inventory read out of the since-removed `design/`), the `components/ui/` line ("restyled to `design/`" → "restyled to the glass system"), and the backdrop blur rule (the navbar comes off the list).
    - `docs/scope/scope.md`: the header line "Every UI feature follows the artboards in `design/`" is replaced. Add a dated note: `design/` removed on 2026-10-06; the shipped UI and `/showcase` are the reference.
    - JSDoc and CSS comments in `app/` and `components/` (and `lib/tmdb/images.ts`) that cite `design/*.svg` or "the artboards": reworded to state the decision without the dead path. The spec citations (`spec 0004, AC-…`) stay, since those files still exist.
    - `navbar.tsx` JSDoc: the blur paragraph becomes the transparent bar and the 40px rule.
13. **Historical records that stay untouched:** `docs/specs/**`, `docs/reviews/**` and the existing `prompts/*.md`.

## Expected files

- `app/globals.css` (`hit-area` utility, comment fixes)
- `components/ui/button.tsx` (`bar`, `icon-bar` sizes)
- `components/layout/navbar.tsx`, `media-type-tabs.tsx`, `library-nav.tsx`, `account-slot.tsx`, `mobile-menu-sheet.tsx` (the trigger only), `site-footer.tsx`
- `components/search/navbar-search.tsx`, `quick-search.tsx`, `mobile-search-overlay.tsx` (the trigger only)
- `lib/legal/operator.ts`, `app/privacy/page.tsx`, `app/terms/page.tsx`
- Tests: `navbar.test.tsx`, `site-footer.test.tsx`, `operator.test.ts`, `boundary.test.ts`, `app/privacy/page.test.tsx`, `app/terms/page.test.tsx`, plus any class assertions on the changed sizes
- Comment-only edits in the remaining `design/`-citing files under `app/`, `components/` and `lib/`
- `AGENTS.md`, `components/AGENTS.md`, `docs/scope/scope.md`
- Deleted: `design/`

## Security

No change to auth, data or caching. The footer stays a Server Component that reads no request state (`app/layout-purity.test.ts`). The external link uses `noopener noreferrer`. The boundary test still requires every operator fact to come from `operator.ts`.

## Acceptance criteria

1. At any scroll position the navbar has no background, border or blur. Content is visible between and behind the controls, and the bar stays at the top.
2. At 1440px and 390px, every navbar control (tabs pill, library pill, search field or icon, Sign in, avatar, account, Sign out, menu) renders 40px tall.
3. On mobile each of those controls responds to taps across a 44×44px area.
4. The mobile menu sheet looks exactly as it did before.
5. The footer has no top border. Its last line reads `© BeStats · Crafted with love by kris1027`, and `kris1027` opens `https://github.com/kris1027` in a new tab.
6. `/privacy` and `/terms` contain no `Krzysztof Obarzanek`. They name `kris1027`, linked to GitHub, and show `Last updated` for 6 October 2026.
7. `design/` is gone, and nothing outside `docs/specs`, `docs/reviews` and `prompts/` mentions `design/`.
8. The `/search` page field and the mobile search overlay field keep their current height.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, plus `rg -n "design/" --glob '!docs/specs/**' --glob '!docs/reviews/**' --glob '!prompts/**' --glob '!node_modules/**'`, which must return nothing outside this plan.

## Manual test steps

1. `pnpm dev`, then open `/shows` at 1440px. Scroll the grid and check that posters show behind the bar with no tint, line or blur.
2. Measure the tabs pill, the search field and Sign in in devtools: each should be 40px.
3. Sign in, then measure the library pill, the account button and Sign out: 40px.
4. Switch to 390px and check that the search icon, avatar and menu button are 40px. Hover each one's `::after` in devtools: 44×44.
5. Open the menu and check that the sheet is unchanged.
6. Scroll to the footer: no border, and the credit line reads as expected. Click `kris1027`: GitHub opens in a new tab.
7. Open `/privacy` and `/terms`: the handle is linked, the legal name is gone, and the date is 6 October 2026.
8. Open `/search?q=dune`: the page's field is unchanged.

## Out of scope

Deploying to production, and any change to the mobile menu sheet, the specs or the old plans.
