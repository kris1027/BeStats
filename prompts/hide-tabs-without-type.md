# Hide the media tabs on pages with no type

## Goal

The navbar's SHOWS | MOVIES tabs appear on every page, including pages where there is nothing to switch. Hide them on every page whose media type is null.

## Inspected code

- `components/layout/media-type-tabs.tsx`: `MediaTypeTabs` renders `MediaTypeTabsView selected={null}` when the type is null.
- `components/layout/page-media-type.tsx` and `lib/catalog/media-type.ts`: `mediaTypeForLocation` returns null only for paths that are neither a catalog path nor a typed path.
- `components/layout/navbar.tsx`: on mobile, the navbar is a `flex-col gap-2` column whose second row is the tabs.
- `components/layout/media-type-tabs.test.tsx`: the test "lights nothing on a page about neither catalog".

## Skills used

None. This is a small change to an existing client component.

## Decisions (settled with the user, 2026-10-11)

1. **Hide on pages with no type.** These are `/account`, `/privacy`, `/terms`, `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password`, `/showcase` and the unmatched 404 page.
2. **Keep the tabs everywhere else.** That means `/shows`, `/movies`, the title and season pages, `/watchlist`, `/upcoming`, `/watched` and `/search`. A malformed `/movies/abc` 404 sits under a catalog path, so it keeps its tabs.
3. **Mobile:** the tab row is removed, so the navbar gets shorter on those pages. Nothing renders, so there is no flex gap left behind.
4. **Fallbacks stay as they are.**
   - The navbar's Suspense fallback (unlit tabs) is used only on dynamic title routes, and those always have a type.
   - The typed page fallback is used only on typed pages.
   - So no hidden page shows tabs before hiding them, and no page with tabs flashes empty.

5. **Search and Library links too** (added by the user mid implementation, 2026-10-11). On the same pages, the navbar search is hidden: the desktop field and the mobile icon. The Library links (Watchlist, Upcoming, Watched) are hidden as well, both the desktop pill and the list in the mobile menu sheet. Signed in on `/account`, you reach the library through the logo. `/showcase` has no type either, so it renders `LibraryNavView` directly.

6. **Review follow ups** (2026-10-11).
   - The three controls share one guard, `WithTypedPage` in `components/layout/page-media-type.tsx`, which renders nothing on a page with no type.
   - The navbar's desktop search wrapper is `hidden md:not-empty:block`, so an empty search leaves no extra `md:gap-6` (decision 3 holds at desktop width too).
   - `AccountSlot` puts `ml-auto` on the account controls, so they stay at the right edge when the Library links render nothing.
   - `/showcase` renders `LibraryNavView` with Watchlist lit, so the selected state is on show.

## Expected files

- `components/layout/media-type-tabs.tsx`: return `null` when `page.type === null`, and update the JSDoc.
- `components/layout/media-type-tabs.test.tsx`: replace the "lights nothing" test with "renders nothing on a page about neither catalog" for `/account` and `/privacy`.
- `components/layout/library-nav.tsx` and `components/search/navbar-search.tsx`: return `null` on a page with no type. `LibraryNavView` is exported for `/showcase`.
- `app/showcase/page.tsx`: render `LibraryNavView` with a fixed page and type.
- Tests: `library-nav.test.tsx` and `navbar.test.tsx` cover the hidden case.
- `components/AGENTS.md`: change "pages about neither catalog light nothing" to say the tabs are not rendered there.

## Acceptance criteria

- AC-1: On `/account`, `/privacy` and `/sign-in`, the document has no `Media type` navigation, no navbar search and no `Library` navigation.
- AC-2: The tabs still render and light correctly on `/shows`, `/movies`, `/movies/{id}`, `/shows/{id}/season/{n}`, the library pages and `/search`.
- AC-3: `/shows`, `/movies`, `/movies/[id]` and `/shows/[id]` keep their partial prerender marker in `pnpm build`.

## Security considerations

None. This only changes rendering.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. Open `/privacy` at desktop width: no tabs and no search; the logo and the account controls sit in the bar with a single gap between them.
2. Open `/privacy` at mobile width: there is no tab row under the logo.
3. Open `/sign-in` and `/account` (signed in): no tabs.
4. Open `/movies`, `/movies/550` and `/watchlist?type=movie`: the tabs are shown, with MOVIES lit.
