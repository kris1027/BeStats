# Verify: Watchlist and movie history · spec 0008 · updated 2026-09-23
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Run by /develop on 2026-09-23** (Proof milestone), in the running app at 1440px and 375px with both seed users. Ticked steps passed live. Still unticked, and why:
- Bad TMDB token: needs a dev server restart; the "Couldn't reach TMDB" branch is covered only by unit tests so far.
- Throttled load: not run live; `pnpm build` lists both pages as partial prerender (◐).
- Undo payload and a tampered future `watchedAt`: covered by `library-grid.test.tsx` (the id only call) and pgTAP 070 (future time refused), not by a live request.

**Run by /check verify on 2026-09-23**: every AC exercised again live (rows seeded in SQL rather than planned from movie pages), including the four steps left open (bad token, throttled load, both Undo payloads, a future `watchedAt` refused over PostgREST). All pass; those four are now ticked. Not repeated: the order tie, the SQL rating change and the cold and warm timing.

Two defects found and fixed during this run:
- The "Couldn't undo" toast never appeared. Sonner deletes a toast 200 ms after its action runs, and the local refusal came back in about 60 ms, so the update merged into the dying toast. Undo now keeps the toast open, drops its button while the restore runs, then closes it or rewrites it (`library-grid.tsx`).
- Removing the only card on page 2 left focus on `<body>`: the redirect remounts the page, replacing the focused heading. The heading is now `LibraryHeading`, which takes focus back after that remount (`library-heading.tsx`).

Run against the local stack with `pnpm dev:docker`. Seed users: `user-a@example.test` / `password-a` and `user-b@example.test` / `password-b`. `supabase db reset --local` puts the seed back afterwards (the pgTAP suite expects it).

## UI / manual
- [x] Signed out, open `/watchlist?page=2` → 307 to `/sign-in?next=%2Fwatchlist%3Fpage%3D2`; the same for `/watched` → AC-3
- [x] View source of `/watchlist` signed in → `<meta name="robots" content="noindex">`; same on `/watched` → AC-3
- [x] As user A, plan three movies from their pages, a few seconds apart, then open `/watchlist` → newest plan first, each card with poster, title linking to `/movies/{id}`, amber TMDB badge, green Planned button bottom right → AC-1
- [x] As user A, plan 21 or more movies → page 1 shows 20 cards and "Page 1 of 2"; page 2 shows the rest → AC-1, AC-9
- [x] Open `/watchlist?page=abc` and `/watchlist?page=501` → "That page doesn't exist" with Back to page 1, whatever the list's length → AC-9
- [x] Open `/watched?page=7` with a short history → lands on `/watched` (the last page) → AC-9
- [x] Unplan the middle movie from its card → it hides at once, "Removed from Watchlist" with Undo appears, the next movie moves up from page 2, focus lands on the next card's title → AC-5, AC-16
- [x] Press Undo within the toast, then reload → the movie is back in its original place → AC-6
- [x] On page 2 with a single card, remove it → you land on page 1 → AC-9
- [x] Remove two cards quickly → two toasts; Undo on the second brings back only the second → AC-18
- [x] Remove the only card on a page → focus moves to the page heading; the empty panel "Your watchlist is empty" / "Plan a movie to see it here." with Browse movies → AC-10, AC-16
- [x] Mark two movies watched, rate one, open `/watched` → most recent first; cyan score only on the rated one; no TMDB badge; unmark button named "Unmark {title} as watched" → AC-2
- [x] Unmark the rated one → "Removed from Watched" plus "Your score is kept."; Undo, reload → same date and position; score unchanged → AC-7
- [x] Unmark the unrated one → toast has no score line → AC-7
- [x] Remove a movie, then wait over 10 minutes (or move `updated_at` back 11 minutes in SQL) and press Undo from a still open toast → "Couldn't undo. Plan it again from the movie page." (watched: "Mark it watched again") → AC-6, AC-7
- [x] Insert a row for a movie id TMDB does not have (for example 2147480000) → its card shows the missing tile and "No longer on TMDB", no link, and a working remove button → AC-11
- [x] Restart the dev server with a bad `TMDB_READ_ACCESS_TOKEN` → "Couldn't reach TMDB" with Try again under the heading, never the empty state → AC-11
- [x] Stop the local stack's REST container (`docker stop supabase_rest_BeStats`) and reload → "Couldn't load your watchlist" with Try again → AC-11
- [x] Remove a card after deleting the session cookie in DevTools → the card comes back with "Your session expired. Sign in to save this." and Sign in returns to the same page → AC-5
- [x] Hard reload `/watchlist` with network throttling → heading and skeleton grid appear first, cards stream in → AC-12
- [x] Below the grid → a hairline, then "TMDB rating" and "Planned" on the watchlist, "Your score" on the watched page → AC-13
- [x] Desktop, signed in → Watchlist and Watched links between the tabs and the account button; the current page's link is the lit pill with `aria-current="page"`; signed out, no links → AC-14
- [x] At 375px signed in → avatar letter (links to `/account`) and menu button, no Sign out in the bar; the menu holds Watchlist, Watched (current one lit), the account row and Sign out; choosing a link closes the sheet and navigates; Escape closes and returns focus to the menu button; no horizontal scroll → AC-15, AC-16
- [x] At 375px, every card button and sheet row is at least 44px tall → AC-16
- [x] As user B → `/watchlist` shows only B's movies, `/watched` shows "Nothing watched yet" → AC-4, AC-10
- [x] Record one cold and one warm load time for a full 20 card page against real TMDB here (spec 0008, Follow-up) → Consequences
  - 2026-09-23, `next dev` on the local stack, 1440px, navigation start to 20 title links rendered: cold (20 ids never fetched) 1101 ms, warm 692 ms and 517 ms. Not slow enough to revisit the snapshot column.

## Value sourcing
- [x] Order: plan movie X, then Y → Y first; unplan and replan X → X first again (new `watchlisted_at`) → `watchlisted_at`
- [x] Order ties: two rows with the same `watchlisted_at` (set in SQL) → lower `movie_id` first on every reload → `movie_id` tiebreak
- [x] Title, poster and TMDB rating match the movie page for the same id → `getMovie` via `getMovieSummaries`
- [x] Watched order and score come from Postgres: change `rating` in SQL, reload → the badge follows → `watched_at`, `rating`
- [x] Total and last page: 40 rows → "Page 1 of 2", 41 → "of 3", 0 → empty state on page 1 → exact count, `libraryLastPage`
- [x] Toast score line follows the row's rating, not the TMDB rating → card `rating`
- [x] Watchlist Undo sends only the id (DevTools network payload) and restores the stored time → stored `watchlisted_at`
- [x] Watched Undo sends the rendered `watchedAt`; a tampered future time is refused → `watchedAt` from the page, bounded by the function
- [x] Undo window follows `updated_at`: set it 11 minutes back in SQL → refused → `updated_at`
- [x] Active nav link follows the URL, including after browser Back → `usePathname()`
- [x] Sheet account row shows the same letter and name as the desktop account button → `avatarLetter`, `displayName`
- [x] Session expired Sign in link carries `?page=N` of the current page → `returnPath`

## Commands
- [x] `pnpm test:db` → 8 files, 160 tests pass (060 and 070 are this feature's) → AC-4, AC-6 to AC-8
- [x] `pnpm exec supabase db schema declarative sync --name drift_check --no-apply` → "No schema changes found" (delete any file it writes) → AC-8
- [x] `pnpm db:types:check` → matches the database schema
- [x] `pnpm test` → all pass, including `request-scope.test.ts` scanning `app/watchlist`, `app/watched` and `components/library` → AC-17, AC-19
- [x] `pnpm typecheck`, `pnpm lint:ci` → clean
- [x] `pnpm build` → `/watchlist` and `/watched` listed as partial prerender (◐) → AC-12
- [x] Direct PostgREST as user A: `PATCH /rest/v1/user_movie_state?movie_id=eq.<planned id>` with `{"watchlisted_at":"2001-01-01T00:00:00Z"}` → value unchanged → AC-8
- [x] Direct PostgREST as user A: `POST /rest/v1/rpc/restore_movie_watchlist` with one of B's movie ids → `P0002` `undo_expired`, B's row unchanged; with the anon key only → permission denied → AC-4

## Acceptance-criteria coverage
- AC-1 plan three, 21 or more · AC-2 watched order and score · AC-3 redirect, noindex · AC-4 user B, PostgREST, pgTAP 070 · AC-5 unplan, session expired · AC-6 Undo, refused Undo · AC-7 unmark, score line, Undo · AC-8 pgTAP 060, PATCH · AC-9 page params, redirects · AC-10 empty panels · AC-11 missing id, TMDB and REST failures · AC-12 throttled load, build · AC-13 legends · AC-14 desktop links · AC-15 mobile sheet · AC-16 focus, 44px · AC-17 request scope test · AC-18 quick removals · AC-19 unit tests on log lines
