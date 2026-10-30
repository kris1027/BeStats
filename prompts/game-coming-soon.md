# Games Coming soon page

> **Amended 2026-10-30:** the routes in the table below have since moved. Each page now has a route named for it (`/want-to-play`, `/playing`, `/finished`, `/up-next`, and movies' Coming soon at `/coming-soon`); see [library-page-urls.md](library-page-urls.md).

## Goal

Give the games tab a fourth library page, **Coming soon** at `/coming-soon?type=game`, for Want to play games that are not out yet. Want to play (`/watchlist?type=game`) then lists only released Want to play games. Placement is worked out per request from IGDB's release date, like the movie Watchlist and Coming soon split; nothing new is stored. Settled in a grilling session on 2026-10-30, on the `feat/library-page-names` branch (PR #65), which this work extends.

| Route | Shows (`tv`) | Movies (`movie`) | Games (`game`) |
|---|---|---|---|
| `/coming-soon` | doesn't exist | doesn't exist | Coming soon |
| `/watchlist` | Up next | Watchlist | Want to play (released only) |
| `/upcoming` | Upcoming | Coming soon | Playing |
| `/watched` | Watched | Watched | Finished |

## Inspected

- `lib/catalog/library-list.ts` (`LibraryList`, `libraryPageName`), `lib/catalog/media-type.ts` (`LIBRARY_PATHS`, `TYPED_PATHS`, `isLibraryPath`, `parseLibraryTypeParam`, `typedHref`)
- `lib/auth/private-paths.ts` (`PRIVATE_PATH_PREFIXES`), `proxy.ts` (matcher; private paths come from the registry)
- `app/watchlist/page.tsx` and its siblings, `components/library/library-section.tsx`, `library-heading.tsx`, `library-metadata.ts`, `library-panels.tsx` (`NoSuchPage`, `EmptyPanel`, `pageHref`)
- `components/library/game-library-tab.tsx` (`GAME_CARDS`, `gameItem`, the release pill), `lib/tracking/game-library.ts` (`GAME_LIBRARY_TABS`, `getGameLibraryPage`, `getLibraryGames`)
- `lib/tracking/library-lists.ts` (`getMovieLibraryTab`, `classifyTab`, `capRows`, `compareDates`, `LIBRARY_CLASSIFY_LIMIT = 500`)
- `lib/igdb/reads.ts`: `getGamesByIds` takes up to 500 ids in one `hours` cached batch keyed on the sorted ids
- `lib/catalog/game-page.ts` (`isGameReleased`, `gameReleaseNote`), `lib/tracking/messages.ts` (`LIBRARY_COPY`)
- `components/layout/library-nav.tsx` (`LISTS`, `LibraryNavView`), `components/layout/page-media-type.tsx`
- `app/robots.ts`, `app/sitemap.ts` (private pages are not listed; the page carries `noindex` like its siblings)

## Skills used

- grilling (the decisions below)
- next-dev-loop (runtime check of both games pages, the nav at desktop and phone widths)

## Decisions

1. **Worked out, not stored.** A Want to play game is on Coming soon when `isGameReleased(releaseDate, today)` is false: its IGDB `first_release_date` (UTC day) is after `requestTodayUtc()`, or it has none (TBA). This is the release gate's rule, so the page and the disabled Playing control never disagree. There's no migration, enum value or status change, and no page writes when it loads (spec 0020, AC-21). On release day the game moves to Want to play by itself, within the `hours` lifetime of the IGDB batch.
2. **Route.** `app/coming-soon/page.tsx`, the same shell as its siblings (`LibraryHeading`, `LibraryErrorBoundary`, Suspense, `LibrarySection`). Only `type=game` has it: a bare URL (which means `tv`) or `?type=movie` shows the existing `NoSuchPage` panel, an invalid `type` too. It's added to `PRIVATE_PATH_PREFIXES`, so the proxy redirects a signed-out visitor, and `LibrarySection` still calls `requireUser()` first.
3. **Types.** `LibraryList` stays the three shared pages, so every `Record<LibraryList, …>` for shows and movies is unchanged. A new `LibraryPageKey = LibraryList | "coming-soon"` (`LibraryPage` is already taken by `lib/tracking/library-lists.ts`) in `lib/catalog/library-list.ts` covers the four pages, with `libraryPages(type)` returning a tab's ordered pages: games `["coming-soon", "watchlist", "upcoming", "watched"]`, shows and movies the three. `libraryPageName` accepts a `LibraryPageKey` and holds "Coming soon" for games, still the one place a page name is written.
4. **Paths.** `/coming-soon` joins `LIBRARY_PATHS` (so `isLibraryPath`, `TYPED_PATHS`, the media tabs and `WithLibraryTypedPage` read its `type`) and `typedHref` builds it. On `/coming-soon`, the navbar's SHOWS and MOVIES tabs link to `/watchlist?type=tv|movie`, not to a `/coming-soon` page that doesn't exist for them.
5. **Nav.** `LibraryNav` renders `libraryPages(type)`: **Coming soon · Want to play · Playing · Finished** on games, unchanged on shows and movies. The `bar` pill and the mobile `sheet` keep their 40px height and 44px tap areas. If four links overflow at phone width in the bar, the pill scrolls sideways inside itself rather than widening the page (checked at 375px).
6. **Data path.** Want to play and Coming soon both read up to `LIBRARY_CLASSIFY_LIMIT` (500) `want_to_play` rows, newest added first, `game_id` as the tiebreak, then one `getGamesByIds` batch for all of them, then split by decision 1 and paged in memory (`LIBRARY_PAGE_SIZE`). This copies the movie tab, reusing `capRows` and the over-500 note. Playing and Finished keep the counted Postgres page.
   - A game IGDB no longer has (`missingIds`) stays on **Want to play** as the "No longer on IGDB" card at the end, never hidden.
   - A systemic IGDB failure shows the existing "Couldn't reach IGDB" panel on both pages, never an empty state.
   - A hidden game (`hidden: true`) is placed by its date like any other.
7. **Order and cards.** Coming soon sorts soonest release first, TBA last, then the added order (`compareDates`, a stable sort). Its cards show the existing release pill, "Releases {date}" or "Release date to be announced", and no score (Want to play rows can't hold one). Want to play keeps the added order and, since all its games are out, shows no pill. The card's remove control and Undo work as on Want to play, with the label "Remove {name} from Coming soon".
8. **Status labels elsewhere stay.** The game page, catalog and search cards and the stored status still say Want to play. Coming soon is a view of that status.
9. **Copy.** `LIBRARY_COPY` gains a games Coming soon entry: grid "Games coming soon", empty title "No unreleased games on your list", description "Want to play games that aren't out yet show up here.", browse "Browse games" (to `/games`). The games Want to play empty description becomes "Released games you mark Want to play show up here."

## Expected files

- `lib/catalog/library-list.ts`, `library-list.test.ts`
- `lib/catalog/media-type.ts`, `media-type.test.ts`
- `lib/auth/private-paths.ts`, `private-paths.test.ts`, `proxy.test.ts` (a signed-out `/coming-soon` redirects)
- `app/coming-soon/page.tsx` (new)
- `components/library/library-section.tsx`, `game-library-tab.tsx`, `library-panels.tsx`, `library-heading.tsx`, `library-metadata.ts`, `types.ts`, and their tests
- `lib/tracking/game-library.ts`, `game-library.test.ts` (the classified read for Want to play and Coming soon)
- `lib/tracking/messages.ts`
- `components/layout/library-nav.tsx`, `library-nav.test.tsx`, `components/layout/media-type-tabs.tsx` if the tab switch needs the `/coming-soon` mapping
- `app/showcase/page.tsx` (the games nav row with four links, a Coming soon card)
- Docs: `AGENTS.md` (sections 1 and 9 on the three routes, the Games "Navigation" line and the games repo-facts bullet), `components/AGENTS.md` (`components/library/` bullet), `prompts/library-page-names.md` (the table), `docs/scope/games.md` (Navigation), `README.md` if it lists the library pages

## Requirements

- R1. `/coming-soon?type=game` lists exactly the user's Want to play games that are unreleased or TBA, soonest first, TBA last.
- R2. `/watchlist?type=game` lists exactly the released Want to play games, plus any IGDB no longer has.
- R3. Every Want to play game is on exactly one of the two pages, and its count is exact up to 500, with the over-500 note beyond.
- R4. The games nav, `<h1>` and `<title>` read Coming soon on `/coming-soon`; the games nav order is Coming soon · Want to play · Playing · Finished; shows and movies are unchanged.
- R5. `/coming-soon` with no `type`, `type=tv`, `type=movie` or an invalid `type` shows the "That page doesn't exist" panel; signed out it redirects to sign-in with `?next=`.
- R6. Removing a game from Coming soon offers Undo, which puts it back.
- R7. Playing and Finished behave as before.
- R8. `/coming-soon` keeps a prerendered shell, like its siblings, and nothing writes on load.

## Security considerations

- `/coming-soon` is private: in `PRIVATE_PATH_PREFIXES` for the proxy redirect, and `requireUser()` in `LibrarySection` as the real check, with RLS on `user_game_state` underneath. The read filters `user_id` from the verified session.
- The user's rows are never read inside `use cache`. The IGDB batch is keyed only on catalog ids and holds no user data, as today.
- `noindex` through `libraryPageMetadata`; not in the sitemap.

## Acceptance criteria

- AC-1. A Want to play game with a future release date or TBA is on Coming soon and not on Want to play; a released one is the other way round.
- AC-2. Coming soon order: dated games soonest first, TBA after them, ties by newest added.
- AC-3. A game IGDB doesn't return stays visible on Want to play as the missing card; an IGDB outage shows the error panel on both pages.
- AC-4. The four-link games nav works with a keyboard and at 375px with no horizontal page scroll.
- AC-5. R4, R5 and R8 hold.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (new unit tests for the split, order, missing and failed cases, nav links per type, path parsing, private path), `pnpm build` (`/coming-soon` listed as partially prerendered).

## Manual test steps

1. `pnpm dev:docker`, sign in.
2. On `/games`, mark one released game, one game with a future date and one TBA game as Want to play.
3. Open GAMES → Want to play: only the released game shows.
4. Open Coming soon: the dated game first with "Releases {date}", then the TBA game with "Release date to be announced".
5. Remove the dated game from Coming soon, then Undo: it comes back in place.
6. Check that the nav reads Coming soon · Want to play · Playing · Finished and the tab title reads "Coming soon".
7. Switch to SHOWS while on Coming soon: you land on `/watchlist?type=tv` (Up next).
8. Open `/coming-soon` and `/coming-soon?type=movie`: the "That page doesn't exist" panel.
9. Sign out and open `/coming-soon?type=game`: redirect to sign-in, then back after signing in.
10. Repeat steps 3, 4 and 6 at 375px width: no horizontal scroll, every link reachable.

## Amendments after review (2026-10-30)

- **Grid label.** The Coming soon grid reads "Unreleased games you want to play", not "Games coming soon", which is already the heading of the IGDB list page `/games/coming-soon` on the same tab (library-page-names D6).
- **A bad `type` on `/coming-soon`** leads back to `/coming-soon?type=game`, the one tab that has the page (`defaultLibraryType`), not to the shows page that library-page-names R3 names for the shared routes.
- **Card remove label.** A Want to play card's remove button names the page it is on, passed down from the tab, not one worked out again from the game's release date. Want to play cards carry no release pill, so the flag says so too (D7).
- **Nav overflow (D5) is open.** The desktop navbar row already overflows the page between `md` and about 1000px on every tab, on `main` too (measured 1255px wide at 768px on shows). Making the pill scroll inside itself squeezes it to a sliver, so it was not done; the row needs its own layout decision.
