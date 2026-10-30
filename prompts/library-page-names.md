# Library page names per media type

## Goal

Each media type gets its own library pages in name. The three private routes keep their URLs and `?type=`, but every name a user sees follows the navbar tab:

| Route | Shows (`tv`) | Movies (`movie`) | Games (`game`) |
|---|---|---|---|
| `/watchlist` | Up next | Watchlist | Want to play |
| `/upcoming` | Upcoming | Coming soon | Playing |
| `/watched` | Watched | Watched | Finished |

Today every tab reads "Watchlist · Upcoming · Watched", which is wrong for games, whose statuses are Want to play, Playing and Finished. Settled in a grilling session on 2026-10-30. The games tab later gained a fourth page, Coming soon at `/coming-soon` ([game-coming-soon.md](game-coming-soon.md)).

## Inspected

- `components/layout/library-nav.tsx` (the hardcoded `LINKS` labels), `components/layout/page-media-type.tsx` (`WithLibraryTypedPage`, the one Suspense-wrapped `useSearchParams` reader)
- `app/watchlist/page.tsx`, `app/upcoming/page.tsx`, `app/watched/page.tsx` (static `metadata.title` and a static `<LibraryHeading>` in the shell)
- `components/library/library-heading.tsx` (focus on empty, AC-16 of spec 0008), `library-panels.tsx` (`LIST_NAMES` for the bad `type` panel), `library-card.tsx` (the "Remove X from Upcoming/Watchlist" label)
- `lib/catalog/library-list.ts` (`LibraryList`), `lib/catalog/media-type.ts` (`LibraryType`, `typedHref`)
- `components/layout/icon-key.tsx` and `components/tracking/episode-tracking-slot.tsx`: they name actions and an episode's air status, not pages, so they stay
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, "With Cache Components": a `generateMetadata` that reads `searchParams` defers to request time and streams, which is allowed because these pages already defer their section
- `README.md`, `AGENTS.md`, `components/AGENTS.md`, `docs/scope/scope.md`, `docs/scope/games.md`, `app/showcase/page.tsx`; `/privacy` and `/terms` do not name the pages (grep), so `LEGAL_LAST_UPDATED` is not touched

## Skills used

- grilling (the decisions below)
- next-dev-loop (runtime check of the headings, titles and nav per tab)

## Decisions

1. **Labels, not routes.** `/watchlist`, `/upcoming`, `/watched`, `?type=`, `typedHref`, the private path registry and the proxy are unchanged. Code identifiers stay too: the `LibraryList` values, file names such as `watchlist-show-card.tsx`, database columns and action names.
2. **One source.** A pure `libraryPageName(list: LibraryList, type: LibraryType): string` in `lib/catalog/library-list.ts` (no `server-only`) holds the nine names. Every page name comes from it: the nav pill and the mobile sheet, the `<h1>`, the `<title>`, the "That page doesn't exist" panel and the card remove labels. `LIST_NAMES` and the ternary in `library-card.tsx` go.
3. **Heading.** The `<h1>` text renders through `WithLibraryTypedPage` inside its own Suspense, so the shell stays prerendered. Its fallback is a skeleton bar the same height as the heading text, so no wrong name flashes and nothing shifts. `LibraryHeading` keeps its `id`, `tabIndex={-1}` and the focus-after-remount effect. The `h1` element itself stays in the shell, and only its text streams, so focus targets still exist.
4. **Title.** Each page swaps `export const metadata` for `generateMetadata({ searchParams })`, which parses `type` with `parseLibraryTypeParam` and returns `libraryPageName(list, type)`, keeping `robots: { index: false }`. An invalid `type` falls back to the shows name; the page body still shows the bad `type` panel.
5. **Defaults.** A bare URL means shows, so `/watchlist` reads "Up next". The nav fallback before the query is read uses the shows names, as it already links to `tv`.
6. **Out of scope.** The catalog landing's "Upcoming" movie row and the games "Coming soon" list are TMDB and IGDB catalog lists, not library pages, and stay. The movie library's "Coming soon" shares a name with the games catalog list; they never appear on the same tab. The episode "Upcoming" air chip, the icon key and the site description ("keep a watchlist") stay.
7. **Copy that named a page.** The movie removal toasts use `libraryPageName` ("Removed from Coming soon"), and the movie Coming soon empty title reads "Nothing coming soon". The three failed list titles ("Couldn't load your watchlist", "… upcoming titles", "… watched titles") become one "Couldn't load your list", because `LibraryErrorBoundary` cannot read the tab; its unused `list` prop goes.
8. **Showcase.** `/showcase` renders `LibraryNavView` once per media type (three rows), and its copy that names the pages uses the new names.

## Expected files

- `lib/catalog/library-list.ts`, new `lib/catalog/library-list.test.ts`
- `components/layout/library-nav.tsx`, `library-nav.test.tsx`
- `components/library/library-heading.tsx`, new `library-metadata.ts`, `library-panels.tsx`, `library-card.tsx`, `library-error-boundary.tsx`, `lib/tracking/messages.ts`, and the tests that assert their text
- `app/watchlist/page.tsx`, `app/upcoming/page.tsx`, `app/watched/page.tsx`, and any request-scope test that pins their metadata
- `app/showcase/page.tsx`
- Docs: `AGENTS.md` (sections 1, 9 and 13, the Games "Navigation" line, the media-tabs and games repo-facts bullets), `components/AGENTS.md` (the `components/library/` bullet), `docs/scope/scope.md` (enrol feature 26, "Library page names per media type"), `docs/scope/games.md` (Navigation), `README.md` (Library and Watchlist lines). Historical `docs/specs/`, earlier `prompts/` and `docs/reviews/` stay as written.

## Requirements

- R1. On each tab the nav, `<h1>` and `<title>` show the names in the table above.
- R2. Switching SHOWS | MOVIES | GAMES on a library page updates all three without a reload.
- R3. The bad `type` panel names the shows page to go back to (as today, `tv` is the default).
- R4. Card remove buttons name the page they're on, e.g. "Remove Dune from Coming soon", "Remove Hades from Want to play" if games use the same label.
- R5. `/watchlist`, `/upcoming` and `/watched` keep a prerendered shell (the build lists them as partially prerendered, as now) and no page writes when it loads.

## Security considerations

None new: no route, auth, data or cache change. `generateMetadata` reads only the public `type` parameter, never the session, so no private data reaches the `<title>`.

## Acceptance criteria

- AC-1. `libraryPageName` returns the nine names; a unit test covers every pair.
- AC-2. The nav pill and mobile sheet show "Up next · Upcoming · Watched" on shows, "Watchlist · Coming soon · Watched" on movies and "Want to play · Playing · Finished" on games, with the current page lit.
- AC-3. Each page's `<h1>` and document title match the tab; the heading still takes focus when a removal empties the page.
- AC-4. No hardcoded page name remains outside `libraryPageName` (grep for `"Watchlist"`, `"Upcoming"`, `"Watched"` in components and app, excluding catalog rows, the episode chip, the icon key and tests).
- AC-5. Build output for the three routes is unchanged in render mode.
- AC-6. Docs listed above describe the new names; no living doc still says games read Watchlist, Upcoming and Watched.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, sign in.
2. Open `/watchlist?type=tv`: the nav reads Up next · Upcoming · Watched, the heading and tab title read "Up next".
3. Click MOVIES: the nav reads Watchlist · Coming soon · Watched; open Coming soon, check the heading and title.
4. Click GAMES: the nav reads Want to play · Playing · Finished; open each, check the heading and title.
5. Open `/upcoming?type=nope`: the "That page doesn't exist" panel appears and names the shows page.
6. On a movie Coming soon page, remove the last card: focus lands on the "Coming soon" heading; the remove button's accessible name said "Remove … from Coming soon".
7. Open the mobile menu at 390px width: the sheet shows the same names as the pill.
8. Open `/showcase`: three nav rows, one per media type.
