# Library page URLs follow their names

## Goal

Every library page's URL says the name the tab gives it. Today the four routes are shared, and only the label changes per tab ([library-page-names.md](library-page-names.md)), so Want to play lives at `/watchlist?type=game`. After this change:

| Tab | Pages, in navbar order |
|---|---|
| Shows (`tv`) | Up next `/up-next`, Upcoming `/upcoming`, Watched `/watched` |
| Movies (`movie`) | Watchlist `/watchlist`, Coming soon `/coming-soon`, Watched `/watched` |
| Games (`game`) | Coming soon `/coming-soon`, Want to play `/want-to-play`, Playing `/playing`, Finished `/finished` |

Two tabs that give a page the same name share its URL, and `?type` picks the tab: `/watched` (shows, movies) and `/coming-soon` (movies, games). Settled in a grilling session on 2026-10-30.

## Inspected

- `lib/catalog/library-list.ts` (`LibraryPageKey`, `LIBRARY_PAGE_NAMES`, `TAB_PAGES`, `libraryTab`, `defaultLibraryType`), `lib/catalog/media-type.ts` (`LIBRARY_PATHS`, `TYPED_PATHS`, `isLibraryPath`, `typedHref` and its "a tab without the page opens `/watchlist`" rule), `lib/catalog/library-metadata.ts`
- `app/watchlist`, `app/upcoming`, `app/watched`, `app/coming-soon` `page.tsx` (each passes its fixed `list` key to `LibraryHeading`, `LibrarySection` and `libraryPageMetadata`)
- `components/library/library-section.tsx`, `library-heading.tsx`, `library-panels.tsx` (`pageHref`, `NoSuchPage`), `game-library-tab.tsx`, `mark-next-watched-button.tsx`, `missing-show-card.tsx`, `watchlist-show-controls.tsx` (hardcoded `typedHref("/watchlist", "tv")` return and retry paths)
- `components/layout/library-nav.tsx` (`/${list}` paths, fallback type `tv`), `media-type-tabs.tsx` (`typedHrefs` keeps the path on a tab switch), `page-media-type.tsx`
- `lib/auth/private-paths.ts`, `proxy.ts` (only `isPrivatePath` concerns these routes), `next.config.ts` `redirects()`, `app/robots.ts` (private pages are deliberately not disallowed, so nothing changes there), `app/showcase/page.tsx`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md`: `has` with `type: "query"` matches on a query value, and the source query is passed through to the destination

## Skills used

- grilling (the decisions below)
- next-dev-loop (runtime check of the URLs, redirects and tab switches)

## Decisions

1. **Page keys stay, URLs are derived.** `LibraryPageKey` (`watchlist`, `upcoming`, `watched`, `coming-soon`) remains the logical page that the classifiers, the tab readers, `libraryPageName` and `libraryTab` work with. A new table in `lib/catalog/library-list.ts`, `LIBRARY_PAGE_PATHS`, gives each key's path per tab, next to `LIBRARY_PAGE_NAMES`. It's the one place these paths are written. Two pure functions read it:
   - `libraryPath(page, type)`: the path for a key on a tab.
   - `libraryPageAt(path, type)`: the inverse, a key or null when the tab doesn't have that route. `/coming-soon` is `upcoming` on movies and `coming-soon` on games.
2. **The route files pass their path, not a key.** Each of the 8 `app/<route>/page.tsx` passes its path (`"/playing"`) to `LibraryHeading`, `LibrarySection` and `libraryPageMetadata`. Each of those resolves the key with `libraryPageAt(path, type)`. A null means the "That page doesn't exist" panel, which replaces `libraryTab`'s `coming-soon` special case. New routes: `app/up-next`, `app/want-to-play`, `app/playing`, `app/finished`, the same shell as the existing four. No route is removed: `/watchlist`, `/upcoming`, `/watched` and `/coming-soon` keep serving the tabs that still own them.
3. **Bare URLs.** A URL with no `type` opens the first tab, in the order shows, movies, games, that has the route (`defaultLibraryType(path)`). So a bare `/watchlist` now opens movies, `/coming-soon` movies, `/watched` shows, and `/playing` games. Links the app builds always write `type`, as now. An invalid `type` still shows the panel; the panel's "Back to …" link goes to the route's default tab.
4. **Links.** `typedHref` is narrowed to `/search`. A new `libraryHref(page, type, { page })` builds every library link (nav, pager, return and retry paths, the empty panel). The hardcoded `typedHref("/watchlist", "tv")` calls become `libraryHref("watchlist", "tv")`, i.e. `/up-next?type=tv`.
5. **Tab switch keeps the matching page.** On a library page the tabs resolve the current key from (path, current type) and link to `libraryHref(key, target)`. Playing ↔ Upcoming ↔ Coming soon (movies), Want to play ↔ Up next ↔ Watchlist, Finished ↔ Watched. Games' Coming soon has no match on shows or movies, so it opens their `watchlist` page, as `typedHref` does today. `/search` tab switches are unchanged.
6. **Nav fallback.** Before `?type` is read, the nav and the tabs render for the route's default tab instead of always `tv`. That way `/playing` doesn't flash shows links that don't exist.
7. **Old links redirect.** `redirects()` in `next.config.ts` gets five temporary (`permanent: false`, 307) rules matched with `has: [{ type: "query", key: "type", value: … }]`. The query passes through, so `page` survives.
   - `/watchlist?type=tv` → `/up-next`
   - `/watchlist?type=game` → `/want-to-play`
   - `/upcoming?type=movie` → `/coming-soon`
   - `/upcoming?type=game` → `/playing`
   - `/watched?type=game` → `/finished`

   Temporary, as `/` → `/shows` is, so no browser caches them. Bare old URLs aren't redirected (decision 3).
8. **Auth.** `PRIVATE_PATH_PREFIXES` adds `/up-next`, `/want-to-play`, `/playing`, `/finished`. The proxy needs no other change. The redirects run before the proxy's auth check, and their targets are private too, so a signed-out visitor still lands on sign in, with `next` set to the new URL.
9. **Out of scope.** `/search`, the catalog list pages (`/games/coming-soon`, `/movies/upcoming` are catalog lists, not library pages), the title pages, file names such as `watchlist-show-card.tsx`, the database and action names. Historical `docs/specs/`, earlier `prompts/` and `docs/reviews/` stay as written.

## Expected files

- `lib/catalog/library-list.ts` and its test: `LIBRARY_PAGE_PATHS`, `libraryPath`, `libraryPageAt`, `defaultLibraryType` by path
- `lib/catalog/media-type.ts` and its test: `LIBRARY_PATHS` from the table (8 paths), `libraryHref`, `typedHref` for `/search` only, the tab switch hrefs
- `lib/catalog/library-metadata.ts`
- `app/up-next/page.tsx`, `app/want-to-play/page.tsx`, `app/playing/page.tsx`, `app/finished/page.tsx` (new), and the existing four library `page.tsx`
- `components/library/library-section.tsx`, `library-heading.tsx`, `library-panels.tsx`, `game-library-tab.tsx`, `mark-next-watched-button.tsx`, `missing-show-card.tsx`, `watchlist-show-controls.tsx`, and their tests
- `components/layout/library-nav.tsx`, `media-type-tabs.tsx`, `page-media-type.tsx` if the fallback needs it, and their tests
- `lib/auth/private-paths.ts` and its test, `proxy.test.ts` (a case for a new private path)
- `next.config.ts` (the five redirects), with a test that pins them
- `app/showcase/page.tsx` (nav rows on the new paths)
- Docs: `AGENTS.md` (section 9's routes paragraph, the Games "Navigation" line, the media tabs and `game` repo facts bullets), `components/AGENTS.md`, `docs/scope/games.md` (Navigation), `docs/scope/scope.md` (enrol the feature), `prompts/library-page-names.md` and `prompts/game-coming-soon.md` (a dated note pointing here), `README.md` where it names a route

## Requirements

- R1. Each page in the table opens at its URL with the right heading, title, nav lit and content.
- R2. A route on a tab that lacks it (`/playing?type=tv`, `/up-next?type=movie`) shows "That page doesn't exist" with a link to the route's default tab.
- R3. Switching tabs on a library page opens the matching page of the new tab (decision 5).
- R4. The five old URLs redirect with 307, keeping `page`.
- R5. Every new route requires a session at the proxy and in `requireUser()`.
- R6. All 8 routes keep a prerendered shell (the build lists them as partially prerendered) and no page writes when it loads (spec 0020, AC-21).
- R7. No library path is written outside `LIBRARY_PAGE_PATHS` (the route folders and the redirect rules aside).

## Security considerations

Four new private routes. Each goes through the same `LibrarySection`, which calls `requireUser()` first, and RLS is unchanged. The private path registry gains them, so the proxy redirects a signed-out navigation. A redirect only rewrites the path, not the session, and its target is private too. `?type` stays the only parameter read, and it's validated as before.

## Acceptance criteria

- AC-1. `libraryPath` and `libraryPageAt` round trip all 10 (key, tab) pairs, and `libraryPageAt` returns null for every route a tab lacks. Unit tests cover both.
- AC-2. The nav links on each tab point to the table's URLs, with `type` written.
- AC-3. Tab switch hrefs follow decision 5 for each of the 10 pages.
- AC-4. The five redirects exist as temporary rules with the right `has` value (a `next.config` test), and in the running app each one answers 307 to its target with `page` kept.
- AC-5. `isPrivatePath` is true for all 8 routes.
- AC-6. A grep finds no `"/watchlist"`, `"/upcoming"`, `"/watched"` or `"/coming-soon"` literal in `components/` or `lib/` outside `library-list.ts`, tests and the auth registry.
- AC-7. The build lists all 8 routes as partially prerendered.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, sign in.
2. Click SHOWS, open each library link: `/up-next?type=tv`, `/upcoming?type=tv`, `/watched?type=tv`, each with the right heading and tab title.
3. Click MOVIES: `/watchlist?type=movie`, `/coming-soon?type=movie`, `/watched?type=movie`.
4. Click GAMES: `/coming-soon?type=game`, `/want-to-play?type=game`, `/playing?type=game`, `/finished?type=game`.
5. On `/playing?type=game` click SHOWS: you land on `/upcoming?type=tv`. Click MOVIES: `/coming-soon?type=movie`. On games' Coming soon click SHOWS: `/up-next?type=tv`.
6. Open `/watchlist?type=game&page=2`: the address becomes `/want-to-play?type=game&page=2`. Repeat for the other four old URLs.
7. Open `/playing?type=tv`: the "That page doesn't exist" panel, linking to Playing on games.
8. Sign out, open `/finished?type=game`: you're sent to sign in, and after signing in you land back on it.
9. Mark the next episode watched on Up next and use a missing show card's link: both stay on `/up-next?type=tv`.

## Amendment 2026-10-30: focus after a route change

Switching tabs now changes route, and after a client navigation Next keeps the page left behind mounted but hidden (`display: none`), with the same `library-heading` id and show card link ids. `getElementById` could then return the hidden copy, so a removal that empties the page would send the focus nowhere. Every library focus move (`LibraryHeading`, `MarkNextWatchedButton`, `MissingShowCard`) now looks its target up with `shownElementById` in `components/library/card-focus.ts`, which skips hidden copies. Tested in `card-focus.test.tsx`.
