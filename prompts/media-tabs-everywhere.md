# Media tabs on every page

## Goal

Make the navbar's SHOWS | MOVIES tabs filter every list page, as they already do on the catalog. On `/watchlist`, `/upcoming`, `/watched` and `/search` the active tab picks which media the page shows, and `/search` loses its own type control. `/shows` and `/movies` do not change.

Scope feature 22, branch `feat/media-tabs-everywhere`. There is no spec: these decisions were settled with the user before this plan was written, and this plan records them.

## Inspected

- Navbar: `components/layout/navbar.tsx`, `media-type-tabs.tsx` (links to `/shows` and `/movies`, lit from `usePathname`), `library-nav.tsx`, `mobile-menu-sheet.tsx`, `components/search/navbar-search.tsx` (`searchTypeForPath`, and `useSearchParams` read only on `/search` inside its own Suspense boundary, so other routes keep their prerendered shells)
- Lists: `app/watchlist/page.tsx`, `app/watched/page.tsx`, `components/library/library-section.tsx`, `types.ts`, `badge-legend.tsx`, `library-grid.tsx`, `library-card.tsx`, `lib/tracking/library-lists.ts` (both views, `user_watchlist_entries` and `user_watched_entries`, already have a `kind` column)
- Upcoming: `app/upcoming/page.tsx`, `components/upcoming/upcoming-sections.tsx`, `ids.ts`, `mark-next-watched-button.tsx`, `coming-soon-grid.tsx`, `up-next-pill.tsx`, `lib/tracking/up-next.ts` (`showsNothingUpcomingPanel`), `lib/tracking/messages.ts`
- Search: `app/search/page.tsx`, `components/search/filter-bar.tsx` (the `TypeOption` radios and `switchType`, which uses `mapGenresAcrossTypes`), `lib/search/params.ts` (`SearchType`, `parseSearchType`, `type` always written)
- Docs: `AGENTS.md`, `components/AGENTS.md`, `docs/scope/scope.md`, specs 0004, 0008, 0010, 0014, 0019

## Skills used

`next-dev-loop` to verify in the running app. No Supabase skill is needed: there is no schema change.

## Decisions

1. **The type lives in the URL** as `?type=tv|movie`, the parameter `/search` already uses. A bare URL means `tv`, matching `/` → `/shows` and the `/search` default. There is no cookie and no client state.
2. **Tab clicks on a typed page.** On the four typed pages (`/watchlist`, `/upcoming`, `/watched`, `/search`), a tab links to the same path with the other `type`. On `/search` the link keeps `q`, `year` and `rating`, drops every `genre` and resets `page`. On any other page the tabs link to `/shows` and `/movies` as they do today.
3. **Which tab is lit.**
   - `/shows` and `/shows/{id}` light SHOWS.
   - `/movies` and `/movies/{id}` light MOVIES.
   - A typed page lights its `type`, and `tv` when the parameter is absent.
   - `/account`, `/privacy`, `/terms` and the auth pages light nothing.
   - `aria-current="page"` stays on the lit tab.
4. **The type carries across pages.** The Library links (the desktop pill and the mobile sheet) and the navbar search take the current page's type:
   - `/shows` and `/movies` and their title pages pass their own type.
   - A typed page passes its `type`.
   - Any other page passes `tv`.
   Generated links always write `type`, for example `/watchlist?type=movie`.
5. **The prerendered shell is kept.** `useSearchParams` is read only when the pathname is a typed page, inside its own Suspense boundary. This is the pattern `NavbarSearch` already uses for `/search`. The boundary's fallback is the same control with nothing lit (tabs) or with the `tv` links (Library nav), at the same footprint. `/shows`, `/movies` and the title pages never read search params, so their static shells don't change.
6. **One pure helper** in `lib/catalog/media-type.ts`. It is free of `server-only`, so the client components and tests can import it.
   - `MediaType`: an alias of `SearchType`.
   - `parseMediaTypeParam(raw)`: returns `tv` when the value is absent, the type for `tv` or `movie`, and `null` otherwise.
   - `TYPED_PATHS`.
   - `mediaTypeForLocation(pathname, typeParam)`.
   - `typedHref(path, type, extra?)`.
   `parseSearchType` stays the parser behind `/search`.
7. **`/watchlist`.**
   - SHOWS lists Want to Watch and Watching shows, as today. MOVIES lists planned movies.
   - `getWatchlistPage(userId, kind, page)` and `getWatchedPage(userId, kind, page)` add `.eq("kind", kind)` to the page query and to the count query. The order stays `listed_at` / `last_watched_at` descending, then `tmdb_id`.
   - Each tab has its own count, page numbers and past-the-end redirect. `pageHref(list, type, page)` builds `/watchlist?type=movie`, with `&page=n` added from page 2.
   - Only the needed TMDB titles are fetched: movies or shows, never both.
8. **`/watched`.** SHOWS lists Completed shows with their calculated rating, and MOVIES lists watched movies with their score. Paging is split the same way as on `/watchlist`.
9. **Copy for each list and type.** `COPY` becomes `COPY[list][type]`, with one Browse button per empty state:
   - "Your show watchlist is empty", "Plan a show to see it here.", **Browse shows**
   - "Your movie watchlist is empty", "Plan a movie to see it here.", **Browse movies**
   - "No completed shows yet", "Shows you complete show up here.", **Browse shows**
   - "No watched movies yet", "Movies you mark watched show up here.", **Browse movies**
   The grid's accessible label names the type ("Shows on your watchlist, page 2"). The `<h1>` and `<title>` stay "Watchlist" and "Watched".
10. **Badge legend for each list and type.** The legend lists only the badges the tab can show:
    - Watchlist movies: TMDB rating, Planned.
    - Watchlist shows: TMDB rating, Planned, Stop watching, Next episode.
    - Watched, both tabs: Your score.
11. **`/upcoming`.**
    - SHOWS renders only the Up Next section, and the automatic completion check (`reconcileUpNextShows`) runs only on that tab. `/upcoming?type=movie` writes nothing.
    - MOVIES renders only the Coming soon section, with its 200-movie limit line.
    - Each section keeps its heading, its own empty state (the existing `SectionEmpty` message and Browse button) and its own error with Retry.
    - The combined "Nothing upcoming yet" panel goes away, along with `showsNothingUpcomingPanel`, `UPCOMING_EMPTY_MESSAGES` and `UPCOMING_EMPTY_HEADING_ID`.
    - When a mark completes the last Up Next show, the focus goes to the Up Next heading.
    - Every Retry link and Sign in return path uses `upcomingHref(type)`.
12. **`/search`.**
    - The `TypeOption` radios and `switchType` are removed. The form submits `type` through a hidden input, so it still works without JavaScript.
    - The genre list, placeholder and Clear link follow `values.type`, which now changes only from the navbar.
    - `mapGenresAcrossTypes`, its "Removed: …" line and their tests are deleted if nothing else uses them.
13. **An invalid `?type=` value.**
    - On `/watchlist` and `/watched`, the existing `NoSuchPage` panel ("That page doesn't exist") shows, with its button pointing to `?type=tv`.
    - On `/upcoming`, which has no page parameter, the same panel shows with the button "Back to Upcoming" (`/upcoming?type=tv`).
    - `/search` keeps its current handling of a bad parameter.
    - There is no redirect. The check runs after `requireUser()` and before any read.
14. **Unchanged:** `/shows`, `/movies`, the title pages, the `BeStats` logo link (`/shows`), the proxy matcher, the schema and RLS, and the robots and sitemap entries (the list pages stay `noindex`).

## Expected files

- New: `lib/catalog/media-type.ts`, `lib/catalog/media-type.test.ts`
- `components/layout/media-type-tabs.tsx` (+ test), `library-nav.tsx` (+ test), `navbar.tsx`, `mobile-menu-sheet.tsx` (+ test, only if its props change), `components/search/navbar-search.tsx`
- `lib/tracking/library-lists.ts` (+ test), `components/library/library-section.tsx` (+ test), `badge-legend.tsx`, `library-grid.tsx` (return path), `app/watchlist/page.tsx`, `app/watched/page.tsx`
- `app/upcoming/page.tsx`, `components/upcoming/upcoming-sections.tsx`, `ids.ts`, `mark-next-watched-button.tsx` (+ test), `coming-soon-grid.tsx`, `up-next-pill.tsx`, `lib/tracking/up-next.ts` (+ test), `lib/tracking/messages.ts` (+ test), `app/upcoming/request-scope.test.ts`
- `components/search/filter-bar.tsx` (+ test), `lib/search/genres.ts` and `lib/search/count.test.ts` if `mapGenresAcrossTypes` goes
- Docs:
  - `AGENTS.md`: the "Two server renders write" line, and a repo fact for the `?type=` rule.
  - `components/AGENTS.md`: the "Selection comes from the pathname" bullet.
  - `docs/scope/scope.md`: feature 22.
  - Specs 0004, 0008, 0010, 0014, 0019: a dated "Amended 2026-10-07 by feature 22" note on the acceptance criteria this replaces.
  - `README.md`, only if it describes the mixed lists.

## Security

- The reads don't change: they run in the same user session under RLS, still behind `requireUser()` and outside any `use cache` scope. `kind` is a parsed enum value, never raw input.
- The `type` parameter is validated with Zod (through `parseSearchType`) before it reaches a query.
- No new client boundary reads a server dynamic API. `useSearchParams` reads only the URL.

## Acceptance criteria

1. On `/shows` and `/movies` the tabs behave exactly as before, and both routes still prerender (the build output shows them static or partially prerendered, as today).
2. On `/watchlist`, clicking MOVIES goes to `/watchlist?type=movie` and lists only movies. Clicking SHOWS lists only shows. The same holds on `/watched`.
3. A bare `/watchlist`, `/watched` or `/upcoming` shows the shows tab, with SHOWS lit.
4. Each tab has its own count and pages. Page 2 of one type never shows titles of the other, and past-the-end redirects stay inside the type.
5. On `/upcoming`, SHOWS shows only Up Next and MOVIES shows only Coming soon. Each tab has its own empty and error states, and the movies tab performs no write.
6. On `/search` there is no in-page SHOWS/MOVIES control. The navbar tab switches `type`, keeps `q`, `year` and `rating`, drops genres and goes to page 1. Submitting the form without JavaScript keeps the type.
7. On `/movies` or `/movies/{id}`, the Library links point to `?type=movie` and the navbar search searches movies. On `/account` they point to `?type=tv`.
8. On a typed page, a `?type=` value other than `tv` or `movie` shows the "That page doesn't exist" panel with no redirect.
9. Removing the last card on a page, Undo, the session expired toast and Retry all stay on the current type.
10. Signed out, `/watchlist?type=movie` still redirects to sign in and comes back to the same URL.
11. Mobile (375 px): the tabs and the Library sheet work the same way, with 44px tap targets and visible focus.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (confirm `/shows`, `/movies` and `/movies/[id]` still show a static shell in the route table). `pnpm test:db` is not needed, since no SQL changes.

## Manual test

1. `pnpm dev:docker`. Sign in as a seed user who has planned and watched movies, Want to Watch, Watching and Completed shows, and at least one planned unreleased movie.
2. Open `/shows`, click MOVIES, then SHOWS. The popular grids switch as before.
3. Click Watchlist in the navbar. The URL is `/watchlist?type=tv`, SHOWS is lit, and only shows are listed. Click MOVIES: the URL becomes `/watchlist?type=movie` and only movies are listed. The legend now shows TMDB rating and Planned only.
4. Repeat on `/watched`: completed shows with their calculated rating, then watched movies with their score.
5. Open `/upcoming`: only Up Next. Click MOVIES: only Coming soon. Mark the last Up Next episode of a show so the list empties: the focus lands on the Up Next heading and its empty state shows.
6. From `/movies`, click Watchlist: you land on `/watchlist?type=movie`. Open `/account`, then click Watchlist: you land on `?type=tv`.
7. Open `/search?type=tv&q=office&genre=35&year=2005`, then click MOVIES in the navbar. The URL becomes `type=movie&q=office&year=2005` with no genre, page 1, and no in-page type control appears.
8. Open `/watchlist?type=foo`: the "That page doesn't exist" panel shows. Open `/upcoming?type=foo`: the same panel with "Back to Upcoming".
9. On page 2 of `/watchlist?type=movie`, remove every card. You stay on the movie tab and are redirected to its last page.
10. Sign out and open `/watchlist?type=movie`. You are sent to sign in, and after signing in you return to `/watchlist?type=movie`.
11. Resize to 375 px and repeat steps 3 and 5 through the mobile menu sheet.

## Implementation notes

Changes that were not spelled out above:

- **Coming soon no longer streams in a nested boundary.** Each tab now renders one section, so the boundary that kept Coming soon from holding up Up Next has no job left. Both tabs stream behind the page's one Suspense boundary, and its skeleton is now a single section.
- **A mark that completes the last Up Next show** moves the focus to the Up Next heading, which stays on the page above its own empty state. The fallback to the old empty-panel heading was removed, along with its test.
- **The search page's "Removed: …" line** went with the type switch. It was only ever set by that switch.
- **An invalid `type`** lights SHOWS in the navbar while the page shows its error panel, because the tab and Library links fall back to the default type.
