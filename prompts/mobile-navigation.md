# Mobile navigation: one row bar and a full screen menu

## Goal

Rebuild the mobile navigation (below `md`) to the Claude Design artboard `Mobile Navigation 1a.dc.html` (project `09385831-2318-4fa8-87c2-59ca49e3e404`), in the project's own tokens, glass utilities and icons. The bar becomes one row, the wordmark and a menu button. The menu becomes a full screen frosted overlay holding search, the media tabs, the library pages, the account row and Sign out (or Sign in). Desktop does not change.

Settled with the owner in a grilling session on 2026-10-31 (Q1 to Q11, all on the recommended answer, plus "an active search is full screen too").

## Inspected code

- `components/layout/navbar.tsx`: mobile bar is brand + `NavbarSearch layout="mobile"` + `mobileAccountSlot` on row one, `MediaTypeTabs` centred on row two.
- `components/layout/account-slot.tsx`: signed out renders a Sign in button; signed in mobile renders the avatar link and `MobileMenuSheet` with `LibraryNav variant="sheet"`, the account row and Sign out.
- `components/layout/mobile-menu-sheet.tsx`: Base UI modal Dialog, controlled so any link click closes it; card dropping from the top on `glass-plate-sheet`.
- `components/layout/library-nav.tsx`: `LibraryNavView` `bar` / `sheet` variants, names from `libraryPageName`, routes from `libraryHref` / `libraryPath`.
- `components/layout/media-type-tabs.tsx`, `components/layout/page-media-type.tsx` (`WithPageMediaType`, `WithLibraryTypedPage`, the one `useSearchParams` rule).
- `components/search/navbar-search.tsx`, `mobile-search-overlay.tsx`, `quick-search.tsx` (`variant="overlay"`, `onNavigate`; the query is component state and `useQuickSearch(type, query)` re-runs when `type` changes).
- `components/tracking/tracking-icons.tsx` and `components/layout/icon-key.tsx` (the project's marks).
- `app/globals.css` (`--navbar-height`, `--destructive`, `glass-plate-sheet`, `glass-selected-personal`), `app/glass-contrast.test.ts`, `app/layout.tsx` (the mobile slot's Suspense fallback), `app/showcase/page.tsx`, `components/AGENTS.md`.

The design's own colours map onto existing tokens: the selected cyan is `glass-selected-personal` + `text-text-on-personal` (the navbar tab exception already allows it), the Sign out red is `--destructive` (`#fb8a8a`, the design's `#ff8a80`). No new colour, asset or dependency.

## Skills used

- `mattpocock-skills:grilling` (the decisions below).
- `vercel:shadcn` conventions via the existing `components/ui/toggle-group.tsx` (Base UI primitives, restyled to glass).
- `next-dev-loop` for the runtime check. `next-cache-components-*` are not needed: no route's shell changes, and the menu reads request state only inside the already request scoped `AccountSlot` boundary.

## Decisions

1. **Bar (mobile):** one row: `BrandLink` on the left, the menu button (`icon-bar`, 40px, `hit-area` 44px) on the right. The mobile search icon, the avatar link and the second tabs row are removed below `md`. `MediaTypeTabs` stays one DOM node, now `hidden md:flex`, so desktop keeps its single tab stop. `--navbar-height` becomes `calc(2.5rem + 2 * 0.5rem)` at every width and `navbar.test.tsx` is updated to match.
2. **One menu for everyone.** `AccountSlot variant="mobile"` always renders the menu button; signed in or out only changes the account block. With no auth configuration it renders the signed out menu (same rule as today).
3. **Menu layout**, a full screen Base UI modal Dialog (`fixed inset-0`, `glass-plate-sheet` frost over the existing dimming backdrop, safe area padding), top to bottom:
   - header: the wordmark, linking to the previewed type's catalog (`CATALOG_PATHS`), and a round `icon-touch` close button;
   - the search field (`QuickSearch variant="overlay"`);
   - the SHOWS | MOVIES | GAMES pill (`ToggleGroup`, single select, uppercase bold, selected item `glass-selected-personal`);
   - a glass panel of library rows (signed in only): a 36px icon tile, the `libraryPageName` label, a `ChevronRight`; each row 56px; the current page lit with `glass-selected-personal` and `aria-current="page"`;
   - spacer, then the account row (avatar letter, "Account", the display name) linking to `/account`, and a full width pill `Sign out` in `text-destructive` (a form posting `signOutAction`).
   - Signed out: no rows; the account block is one full width `Sign in` pill to `/sign-in`.
4. **Tabs preview inside the menu.** Tapping a tab changes which rows the menu shows and which type search uses; nothing navigates until a row, the wordmark or a result is chosen. The preview starts from the page's `libraryType` each time the menu opens (`WithLibraryTypedPage`, rendered only inside the open popup). A row is lit only when its type is the page's type and its path is the current path. This is menu local state, not page selection, so the "selection comes from the URL" rule for the page is untouched.
5. **Search mode is full screen.** Focusing the field enters search mode: the field sits under the header with a `Cancel` button beside it, the tab pill stays below it, and the rows and the account block are hidden, so the results fill the screen. Before two characters the area under the tabs stays empty, as QuickSearch's overlay has always done. Switching tab keeps the query and re-runs it for the new type. `Cancel` clears the query and returns to the menu; X and Escape close the whole menu; choosing a result or See all navigates and closes it (`onNavigate`). `MobileSearchOverlay` and `NavbarSearch`'s mobile layout are deleted.
6. **Icons are the project's marks:** Coming soon / Upcoming `CalendarIcon`; Watchlist / Want to play `PlanIcon`; Up next / Playing `NextEpisodeIcon`; Watched / Finished `WatchedIcon filled`. Mapped by page key and type next to the rows, labels still from `libraryPageName`.
7. **Pages with no media type** (`/account`, `/privacy`, `/terms`, auth pages, `/showcase`, 404): no search, tabs or rows in the menu; only the header (wordmark to the last viewed catalog, as `BrandLink` does) and the account block (prompts/hide-tabs-without-type.md).
8. **Desktop unchanged**: `NavbarSearch layout="desktop"`, `LibraryNav variant="bar"` and the desktop account slot stay as they are.
9. **Motion:** the menu fades in (150ms, as today); the switch into search mode is instant. Both respect `prefers-reduced-motion` through the existing `animate-in` utilities.

## Assumptions

- The layout's mobile slot fallback becomes a round `size-10` skeleton (the menu button's footprint) instead of the `h-11 w-24` pill, so the bar never resizes.
- `--destructive` over the sheet plate is already in `app/glass-contrast.test.ts`'s text list; if the sheet row is missing it, the case is added.

## Expected files

- `components/layout/mobile-menu-sheet.tsx` (rewritten: full screen, search mode, tab preview; takes the account block as a prop/children from the server slot)
- `components/layout/library-nav.tsx` (`sheet` variant becomes the icon rows; icon map)
- `components/layout/account-slot.tsx` (mobile: always the menu; signed in and signed out account blocks)
- `components/layout/navbar.tsx`, `app/layout.tsx` (mobile bar, fallback)
- `components/search/navbar-search.tsx` (desktop only), `components/search/mobile-search-overlay.tsx` (deleted)
- `app/globals.css` (`--navbar-height`)
- `app/showcase/page.tsx` (menu signed in, signed out and no type, search mode)
- tests: `mobile-menu-sheet.test.tsx`, `navbar.test.tsx`, `library-nav.test.tsx`, `account-slot*.test.tsx`, `app/glass-contrast.test.ts` if needed
- `components/AGENTS.md` (client boundary list loses nothing; menu description and the mobile search note updated)

## Requirements

- R1 Mobile bar is one 40px row: wordmark, menu button; nothing else below `md`.
- R2 The menu opens for signed in and signed out visitors and on pages with and without a type.
- R3 Focus moves into the menu, is trapped, Escape closes it, focus returns to the menu button (Base UI, unchanged).
- R4 Tab preview changes rows and search type without navigating; reopening starts from the page's type.
- R5 Rows use `libraryPageName`, `libraryHref`, the project icons, and light only the current page.
- R6 Focusing search enters full screen search mode; Cancel returns; tab switch keeps the query.
- R7 Any navigation from the menu closes it.
- R8 Every touch target is at least 44px.
- R9 No colour literal outside `globals.css`; no new client boundary in the shell beyond the existing menu file.
- R10 Desktop renders exactly as before.

## Security considerations

No new data, reads or writes. The account block is still rendered by the server `AccountSlot` from the verified session; the client menu receives rendered nodes, never an identity to trust. Sign out stays the existing Server Action form. Search calls only the public `/api/search`.

## Acceptance criteria

- AC-1 At 390px the bar shows only the wordmark and the menu button, on every route.
- AC-2 Signed in, the menu shows search, tabs, the tab's library rows with icons, the account row and a red Sign out; signed out, search, tabs and Sign in.
- AC-3 On `/account` the menu shows no search, tabs or rows.
- AC-4 Tapping GAMES on `/up-next` shows Coming soon, Want to play, Playing, Finished without navigating; tapping Playing opens `/playing?type=game` and closes the menu.
- AC-5 Focusing search hides rows and account, keeps tabs; typing shows results; switching tab re-runs the same query; Cancel restores the menu.
- AC-6 Keyboard: Tab cycles inside the menu, Escape closes, focus returns to the menu button.
- AC-7 Desktop at 1280px is unchanged.
- AC-8 `/shows`, `/movies`, `/games` and title pages keep their prerendered shells (build output unchanged).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, open `http://localhost:3000/shows` at 390x844.
2. Signed out: bar has wordmark and menu button only. Open the menu: search, tabs, Sign in. Tap MOVIES, then the wordmark: lands on `/movies`, menu closed.
3. Sign in. Open `/up-next`; open the menu: Up next lit, rows have icons. Tap GAMES: four games rows, nothing navigated. Tap Playing: `/playing?type=game`, menu closed.
4. Open the menu, focus search: rows and account hidden, Cancel shown. Type `dune`: results. Tap MOVIES: same query, movie results. Tap Cancel: menu back. Type again and pick a result: title page, menu closed.
5. Press Tab repeatedly inside the menu: focus stays inside. Escape: menu closes, focus on the menu button.
6. Open `/account`, open the menu: only the header and account block.
7. Resize to 1280px: desktop navbar as before.
