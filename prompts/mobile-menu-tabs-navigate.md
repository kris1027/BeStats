# Mobile menu tabs change the page

## Goal

In the mobile menu, tapping SHOWS, MOVIES or GAMES changes the page, as the desktop navbar tabs do. Signed out, the menu then closes. Signed in, it stays open on the new tab's library rows. While searching, the tabs still only switch what the search reads. Reported by the owner on 2026-10-31: signed out, the menu has no rows, so its preview-only tabs appeared to do nothing. This supersedes decision 4 and AC-4 of [mobile-navigation.md](mobile-navigation.md) and is built on the `feat/mobile-landing-parallax` branch at the owner's request.

## Inspected

- `components/layout/mobile-menu-sheet.tsx`: `MenuTabs` is a `ToggleGroup` that only calls `setPreview`. The popup closes on any click on an `a[href]`. `MenuBody` gets `page` (`pathname`, `type`) from `WithPageMediaType`, or a `type: null` fallback while it suspends.
- `components/layout/media-type-tabs.tsx`: the desktop tabs link to `typedHrefs(pathname, params)` on a typed page (`libraryTabSwitchHref` on a library route, `typedHref` on `/search`) and to `CATALOG_PATHS` everywhere else.
- `lib/catalog/media-type.ts`: `isTypedPath`, `isLibraryPath`, `libraryTabSwitchHref`, `typedHref`, `CATALOG_PATHS`.

## Decisions (owner, 2026-10-31)

1. **A tab tap navigates to the desktop tab's destination.** One helper, `mediaTabHref(pathname, type, current)`, moves into `media-type-tabs.tsx` and serves both: on a library route the matching page of the other tab, on `/search` the same search for the other type, and everywhere else `/shows`, `/movies` or `/games`. The menu reads the current query from `window.location.search` inside the tap handler, so nothing new reads `useSearchParams` during render and the shell's prerender rule holds.
2. **Signed out (`account === null`): navigate and close**, like every other navigation from the menu.
3. **Signed in: navigate and keep the menu open**, with the preview moved to the new tab so its rows show. The page behind changes. A row is lit once the new page's type arrives, as now.
4. **In search mode the tabs only switch the search's type**, so a query is never thrown away.
5. The control stays a `ToggleGroup` (single select, the same look), navigating through `router.push`. Pressing the lit tab still does nothing.

## Expected files

- `components/layout/media-type-tabs.tsx`: `mediaTabHref`, which `tabHrefs` (formerly `typedHrefs` and `catalogHrefs`, merged after review) now uses.
- `components/layout/mobile-menu-sheet.tsx`: `MenuTabs` gets `onSelect` from a `MenuBody` handler that navigates (or not, in search mode) and closes when signed out. JSDoc updated.
- `components/layout/mobile-menu-sheet.test.tsx`: navigation on a tap, signed out and signed in, plus no navigation in search mode.
- `prompts/mobile-navigation.md` (decision 4 and AC-4 marked superseded) and `components/AGENTS.md` (the mobile navigation line).

## Security

None: client navigation to public pages and the user's own library routes, which keep their server-side auth checks.

## Acceptance criteria

- AC-1: Signed out, on `/shows`, opening the menu and tapping MOVIES opens `/movies` and closes the menu. GAMES opens `/games`.
- AC-2: Signed in, on `/up-next`, tapping GAMES opens the games page that matches Up next, the menu stays open, and the games rows show with that page lit.
- AC-3: On `/search?type=tv&q=lost`, tapping MOVIES opens `/search?type=movie&q=lost`.
- AC-4: With a query typed in the menu, tapping MOVIES re-runs it for movies and the page does not change.
- AC-5: On `/account`, tapping a tab opens that catalog.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and AC-1, AC-3, AC-4 and AC-5 in the browser at 390px. AC-2 needs a signed-in session on the local stack (`pnpm dev:docker`); if that isn't available, it's covered by the unit test only, and I'll say so.

## Manual test steps

1. Signed out at 390px, open `/shows`, open the menu, tap MOVIES: `/movies`, menu closed.
2. Open the menu on `/search?type=tv&q=lost`, tap MOVIES: the movie search for "lost", menu closed.
3. Open the menu, type "lost", tap GAMES: the results switch to games and the page stays put.
4. Sign in, open `/up-next`, open the menu, tap GAMES: the page changes behind, the menu stays open with the games rows and the current page lit.
