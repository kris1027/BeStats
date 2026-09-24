# 0008. Watchlist and movie history pages

**Date**: 2026-09-23
**Status**: Accepted

Scope feature: [9. Watchlist and movie history](../../scope/scope.md) · Beta tier

## Summary

This spec designs the two private list pages, `/watchlist` and `/watched`, plus the signed in navigation that reaches them on desktop and mobile. Each page reads one page of 20 rows from Postgres in a fixed order: newest planned first, or most recently watched first. It then fetches the matching titles and posters from TMDB through the existing cached reader. Removing a movie from either list hides its card at once and offers Undo, which puts the movie back exactly where it was. Keeping the old position works because of one new column, `watchlisted_at`, which a database trigger keeps honest. The navbar gains Watchlist and Watched links. On mobile, the menu button and sheet from the artboard replace the loose Sign out button.

## Requirements

**User stories**:
- As a signed in user, I want one page listing the movies I plan to watch, newest first, so that I can pick what to watch next.
- As a signed in user, I want one page listing the movies I have watched, most recent first, with my own score on each, so that I can look back at what I saw and what I thought of it.
- As a signed in user, I want to prune either list straight from its page and undo a mistaken tap, so that keeping the lists tidy is quick and safe.
- As a signed in user on a phone, I want a menu that holds my lists, my account and Sign out, so that the small navbar stays uncluttered.
- As a visitor who is not signed in, I want to be sent to sign in when I open a private list, so that I understand why I can't see it.

**Acceptance criteria**:
- **AC-1**: Signed in, `/watchlist` lists only the user's own movies with `in_watchlist = true`, ordered by `watchlisted_at` descending with `movie_id` as the tiebreak, 20 per page. Each card shows the poster, the title (linking to `/movies/{id}`), the amber TMDB rating badge, and the Planned bookmark button bottom right. The page holds movies only; TV entries join in feature 14.
- **AC-2**: Signed in, `/watched` lists only the user's own movies with `watched_at` set, ordered by `watched_at` descending with `movie_id` as the tiebreak, 20 per page. Each card shows the poster, the title (linking to `/movies/{id}`), the cyan personal score badge only when the movie has a score (no badge and no placeholder when unrated), and an unmark button bottom right showing the filled `WatchedIcon`, named "Unmark {title} as watched". Watched cards show no TMDB rating, matching the artboard.
- **AC-3**: A visitor with no session who requests `/watchlist` or `/watched` is redirected to `/sign-in` with `next` set to the requested path, including its `page` parameter. Each page also calls `requireUser()` on the server, so a request that gets past the proxy still receives no list data. Both pages carry `robots: noindex`.
- **AC-4**: User A can never read, unplan, unmark or restore user B's rows, whether through the pages, the Server Actions, or direct PostgREST (the Supabase REST API) requests with A's session. RLS is unchanged, and both new functions run as the caller (`security invoker`) and filter on `auth.uid()`.
- **AC-5**: Tapping Planned on a watchlist card hides the card at once and calls `setMovieWatchlist(id, false)`. On success, a toast reads "Removed from Watchlist" with an Undo button, and the list refreshes from the server, so the next movie moves up from the following page. On failure, the card reappears in its place with the matching spec 0007 error toast. An expired session shows the spec 0007 sign in toast with the current path as `returnPath`.
- **AC-6**: Undo on the watchlist toast calls `restoreMovieWatchlist(id)`. After a reload, the movie is back on the watchlist with its original `watchlisted_at`, so it sits in its original place. The server refuses the restore if the row is already planned, has no `watchlisted_at`, or was last changed more than 10 minutes ago. The user then sees "Couldn't undo. Plan it again from the movie page." Undo never creates a row.
- **AC-7**: Tapping the unmark button on a watched card hides the card at once and calls `setMovieWatched(id, false)`. The score and the watchlist flag stay untouched. On success, the toast reads "Removed from Watched". When the movie had a score, the toast adds "Your score is kept." It offers Undo, which calls `restoreMovieWatched(id, watchedAt)` with the time the page rendered, putting back the original date and position. The server refuses a restore if the time is in the future, the row is currently watched, or the row was last changed more than 10 minutes ago. The refusal copy matches AC-6, with "mark it watched" in place of "plan it". Failures and an expired session behave as in AC-5.
- **AC-8**: `watchlisted_at` is maintained only by the database. Inserting a planned row, or turning `in_watchlist` from false to true by any path (the Server Action, direct PostgREST), sets it to `now()`. Unplanning keeps it. Any other update keeps the stored value, whatever the client sent. The one exception is `restore_movie_watchlist`, which keeps the old value while re-planning. A check constraint guarantees that a planned row has a `watchlisted_at`. Rows that are already planned are backfilled from `updated_at`. The spec 0007 first watch rule (`mark_movie_watched` clears `in_watchlist`) still holds.
- **AC-9**: Both pages page through `?page=N` using the existing `PaginationLinks`. The total comes from an exact Postgres count, and the last page is `libraryLastPage(total)`, which is `ceil(total / 20)` and at least 1. A malformed `page` value shows the same "That page doesn't exist" state `/movies` shows, through `parsePageParam`. That check runs first, so a value above 500 takes this branch whatever the list's length. A valid page past the last one redirects to the last page, or to page 1 when the list is empty. This includes a page emptied by a removal and refresh.
- **AC-10**: An empty watchlist shows `StatePanel` (empty variant) titled "Your watchlist is empty", with the body "Plan a movie to see it here." An empty history is titled "Nothing watched yet", with the body "Movies you mark watched show up here." Both link "Browse movies" to `/movies`.
- **AC-11**: Titles are read through the cached `getMovie`, via `fetchMoviesByIds`: at most 20 per page, 8 at a time. A movie TMDB no longer has (`missingIds`) keeps a card at the same footprint, with the missing poster tile, the text "No longer on TMDB", no title link, and its remove control (unplan or unmark), so the user can clear it. A systemic TMDB failure, or a Supabase read failure, replaces the grid with the error `StatePanel` and a `RetryLink`, while the heading stays. A failure never renders the empty state.
- **AC-12**: Each page serves a static shell with the heading and a skeleton grid, and the list streams in behind a Suspense boundary.
- **AC-13**: Below the grid, separated by a top border as the artboard draws it, the watchlist page shows a legend with "TMDB rating" and "Planned". The watched page shows "Your score". No TV badge appears in either legend until feature 14.
- **AC-14**: At `md` and wider, signed in, the navbar shows Watchlist and Watched links between the tabs and the account control, as `desktop-navbar-signed-in.svg` draws them, without Upcoming, which arrives with feature 15. The link for the current page renders as a `glass-selected` pill with `aria-current="page"`. Signed out, no links render.
- **AC-15**: Below `md`, signed in, the navbar shows the avatar letter (linking to `/account`) and a menu button, and no Sign out button. The menu button opens `MobileMenuSheet`, holding: Watchlist and Watched (the current one as a `glass-selected` pill with `aria-current="page"`), the account row (avatar letter and display name, linking to `/account`), and Sign out, matching `mobile-menu-open.svg`. Choosing a link closes the sheet and navigates. The existing focus trap, Escape and focus return still work. The signed out mobile bar is unchanged.
- **AC-16**: When a card is removed, focus moves to the next card's title link. If there is no next card, it moves to the previous card's title link. If the list is now empty, it moves to the page heading. A "No longer on TMDB" card has no title link, so its remove button takes the focus instead. The toast's Undo button is reachable by keyboard. Touch targets are 44px below `md`.
- **AC-17**: No private list read runs inside `use cache`, and no response carrying list data is cached in a shared cache. Only the per title TMDB reads are cached. The request scope test scans `app/watchlist`, `app/watched` and `components/library` as well as the folders it already covers.
- **AC-18**: Removing several cards in quick succession works: each removal has its own toast and its own Undo, and undoing one never brings back another.
- **AC-19**: List reads and restores log only an event and an outcome class, through `logTrackingEvent`: no user id, movie id or timestamp.

## Decision

**Chosen option**: Option 1: Server rendered pages that read one Postgres page and then its titles from cached TMDB reads, with a trigger owned `watchlisted_at` and two restore functions for Undo.

The list pages are Server Components that page through `user_movie_state` in Postgres and fetch only that page's titles from TMDB. Removal reuses the spec 0007 actions, and Undo goes through two new invoker functions that restore the original position without trusting any client supplied value beyond the user's own watched time.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (one additive change; no new table, and RLS policies are unchanged):

| Table | Change | Detail |
|---|---|---|
| `user_movie_state` (PK `user_id, movie_id`, FK `user_id` → `auth.users`, 1 user : N rows) | add `watchlisted_at timestamptz null` | When the movie was last planned. It means something only while `in_watchlist` is true. It's kept on unplan so Undo can restore the position. |
| | check `user_movie_state_watchlisted_at_check`: `not in_watchlist or watchlisted_at is not null` | A planned row always has a time to sort by. |
| | partial index `user_movie_state_watchlist_idx (user_id, watchlisted_at desc, movie_id) where in_watchlist` | Serves the watchlist page and its count. |
| | partial index `user_movie_state_watched_idx (user_id, watched_at desc, movie_id) where watched_at is not null` | Serves the watched page and its count. |

**Trigger** `user_movie_state_set_watchlisted_at` (BEFORE INSERT OR UPDATE, `security invoker`, `search_path = ''`, in `supabase/schemas/03-triggers.sql`):
- On insert: `watchlisted_at := case when new.in_watchlist then now() else null end`.
- On update where `old.in_watchlist` is false and `new.in_watchlist` is true: when `current_setting('bestats.restore_watchlist', true) = 'on'` and `old.watchlisted_at is not null`, keep `old.watchlisted_at`. Otherwise use `now()`.
- On every other update: `new.watchlisted_at := old.watchlisted_at`. The column is never writable by a client.
- Trigger names fire in alphabetical order. This trigger does not depend on `updated_at`, so its order next to `user_movie_state_set_updated_at` does not matter.

**Backfill** (written by hand into the migration, after the column is added and before the check and the trigger are created): `update public.user_movie_state set watchlisted_at = updated_at where in_watchlist;`. `updated_at` is the best time available for rows planned before this column existed. `supabase db diff` does not generate data statements, so the reviewer must confirm the ordering in the migration file.

**New database functions** (in `supabase/schemas/05-functions.sql`, `language plpgsql`, `volatile`, `security invoker`, `search_path = ''`, `revoke execute ... from public, anon`, `grant execute ... to authenticated`, the same grant pattern as spec 0007). Both `returns void`. When no row matches, they `raise exception 'undo_expired' using errcode = 'P0002'` (`no_data_found`), checked with `if not found`. A `language sql` update that matches nothing returns null, not false, and `runTrackingWrite` only inspects `error`, so raising is what lets a refused Undo reach the user as a failure:

- `restore_movie_watchlist(p_movie_id integer)`: first `perform set_config('bestats.restore_watchlist', 'on', true)` (transaction local; PostgREST exposes no way for a client to set a custom setting). Then `update public.user_movie_state set in_watchlist = true where user_id = auth.uid() and movie_id = p_movie_id and not in_watchlist and watchlisted_at is not null and updated_at > now() - interval '10 minutes'`.
- `restore_movie_watched(p_movie_id integer, p_watched_at timestamptz)`: `update public.user_movie_state set watched_at = p_watched_at where user_id = auth.uid() and movie_id = p_movie_id and watched_at is null and p_watched_at <= now() and updated_at > now() - interval '10 minutes'`. It never touches `in_watchlist` or `rating`.

`classifyTrackingError` in `lib/tracking/supabase-error.ts` maps `P0002` to `undo_expired`, so `runTrackingWrite` needs no change.

The 10 minute window is measured from `updated_at`, which any later write to the same row moves forward (rating an unplanned movie, for example). That is accepted. The window only limits stale Undo; it is not a security boundary. Only the user's own later edits can stretch it, and it only ever restores the user's own earlier value.

**State transitions** (`user_movie_state.in_watchlist` and `watchlisted_at`):

| From | Event | To |
|---|---|---|
| no row | plan (upsert) | planned, `watchlisted_at = now()` |
| unplanned, any `watchlisted_at` | plan (upsert or update) | planned, `watchlisted_at = now()` |
| planned, `watchlisted_at = T` | unplan | unplanned, `watchlisted_at = T` kept |
| planned, `watchlisted_at = T` | first watch (`mark_movie_watched`) | unplanned, `watchlisted_at = T` kept |
| unplanned, `watchlisted_at = T`, changed under 10 min ago | `restore_movie_watchlist` | planned, `watchlisted_at = T` |
| unplanned, changed 10 min ago or more, or `watchlisted_at` null | `restore_movie_watchlist` | unchanged, raises `P0002` |

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/watchlist` | page (Server Component) | `page` search param | the grid, pagination, legend | session (proxy redirect plus `requireUser()`) | malformed page → "That page doesn't exist"; past end → redirect; read failure → error panel |
| `/watched` | page (Server Component) | `page` search param | the grid, pagination, legend | same | same |
| `getWatchlistPage(userId, page)` | read, `lib/tracking/movie-lists.ts`, `server-only`, never cached | `userId`, `page` | `{ kind: "ok", rows: { movieId }[], total }` or `{ kind: "failed" }` | the server client, under RLS | Postgres error → `failed` |
| `getWatchedPage(userId, page)` | same | `userId`, `page` | rows `{ movieId, watchedAt, rating }[]`, `total`, or `failed` | same | same |
| `setMovieWatchlist(id, false)` | existing Server Action (spec 0007) | `movieId` | `MovieTrackingResult` | session | unchanged |
| `setMovieWatched(id, false)` | existing Server Action (spec 0007) | `movieId` | `MovieTrackingResult` | session | unchanged |
| `restoreMovieWatchlist(id)` | new Server Action, `app/movies/actions.ts` | `movieId: number` (Zod, positive int) | `MovieTrackingResult` | session, through `runTrackingWrite` with `creates = false` (no TMDB check) | `invalid_input`, `session_expired`, `undo_expired` (function raised `P0002`), `write_failed` |
| `restoreMovieWatched(id, watchedAt)` | new Server Action, same file | `movieId: number`, `watchedAt: string` (Zod ISO datetime with offset) | `MovieTrackingResult` | same | same |

The reads use `.select(..., { count: "exact" })` with `.range((page - 1) * 20, page * 20 - 1)`, filter on `user_id` explicitly as well as through RLS (the spec 0007 pattern), and order with the tiebreak. `MovieTrackingError` gains `undo_expired`, and `lib/tracking/messages.ts` gains its two strings and the toast copy from AC-5 and AC-7. Both restore actions call `refresh()` on success through `runTrackingWrite`, as every tracking action already does.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| watchlist page | which movies, their order | `user_movie_state.in_watchlist`, `watchlisted_at`, `movie_id` |
| watchlist page | title, poster, TMDB rating | `getMovie(id)` through `fetchMoviesByIds` (spec 0002) |
| watched page | which movies, their order, the score | `user_movie_state.watched_at`, `movie_id`, `rating` |
| watched page | title, poster | `getMovie(id)` through `fetchMoviesByIds` |
| both pages | total and last page | the exact count from the same query; `libraryLastPage(total)` and the constant `LIBRARY_PAGE_SIZE = 20`, both in `lib/tracking/movie-lists.ts` |
| both pages | the current page | `page` search param through `parsePageParam` |
| removal toast | whether to add "Your score is kept." | the card's `rating` from the watched page read |
| `restoreMovieWatchlist` | the original position | the stored `watchlisted_at`, kept by the trigger; nothing from the client |
| `restoreMovieWatched` | the original watched time | `watchedAt` from the page render, passed back by the client, bounded by the function's checks |
| both restores | the 10 minute window | `user_movie_state.updated_at` (set by the existing trigger on the removal) compared with `now()` |
| active nav link | which page is current | `usePathname()` in a Client Component |
| sheet account row | avatar letter and name | `avatarLetter` and `displayName` from `lib/auth/identity.ts` (spec 0005) |
| session expired toast | the return path | the current pathname plus search, the spec 0007 `returnPath` pattern |

**Components** (reuse first):
- `app/watchlist/page.tsx` and `app/watched/page.tsx`: the heading in the static shell, then a Suspense boundary with a `PosterGrid` of skeleton cards as the fallback, around an async list component. That component calls `requireUser()`, parses the page, reads, redirects past the end, and fetches the titles.
- `components/library/`: `LibraryGrid` (Client Component; owns the optimistic hidden set, the toasts with Undo, and focus after removal), `LibraryCard` (built on `PosterCard`, with its `controls` slot holding the bookmark or unmark button), `MissingTitleCard` (the fallback tile plus "No longer on TMDB"), and `BadgeLegend` (reuses the tracking icons and the rating badge star colours, no colour literals).
- `CardBookmarkButton` saves its own state (its own `useOptimistic`, action call and toast), so it can't be reused as is. Extract its round glass button into a presentational `CardRoundButton` in `components/tracking/`, used by `CardBookmarkButton` and by both list card buttons. The list buttons only call an `onRemove` prop. The optimistic hide, the action call and the toast live in `LibraryGrid`.
- `components/layout/library-nav.tsx` (Client Component): the Watchlist and Watched links with the active pill. It's used by the desktop account slot and inside the sheet.
- `AccountSlot` gains a `variant: "desktop" | "mobile"` prop. `Navbar` takes two slots (`mobileAccountSlot`, `desktopAccountSlot`), and `app/layout.tsx` wraps each in its own Suspense boundary, keeping `layout-purity.test.ts` green. The mobile variant renders the avatar link and `MobileMenuSheet` with `LibraryNav`, the account row and the Sign out form as children. The sheet's links close it on navigation. The artboard draws no title on the sheet, so the `Menu` title becomes screen reader only (`sr-only`), which keeps the dialog named.

**Key invariants**:
- A planned row always has `watchlisted_at` (check constraint).
- No client can choose `watchlisted_at`. Only the trigger and the restore path set it.
- A restore can only re-plan or re-mark the caller's own row, only within 10 minutes of its last change, and never creates a row.
- Removing watched state never changes `rating` or `in_watchlist` (`AGENTS.md` section 7).
- A TMDB failure never looks like an empty list or a shrunken history (`AGENTS.md` section 12).
- Private list data never enters a shared cache (`AGENTS.md` section 11).

**Security model**: Both pages and all four actions require a verified session (`requireUser()` or `getOptionalUser()` inside `runTrackingWrite`). The user id always comes from the session, never from input. RLS on `user_movie_state` (spec 0001) bounds every read and write to the owner. The two functions are `security invoker`, so RLS applies inside them, and they also filter on `auth.uid()`. `anon` has no execute grant. The only client supplied value that is stored is `watchedAt` in `restoreMovieWatched`: it's the user's own private date, bounded to the past, and accepted only for their own unwatched row changed in the last 10 minutes. The proxy redirect is a convenience, and `/watchlist` and `/watched` are already in `PRIVATE_PATH_PREFIXES`.

**Configuration required**: none. No new environment variable or credential.

**Critical test scenarios**:
- Happy path: plan three movies at different times, open `/watchlist`, see them newest first; unplan the middle one, Undo, reload, and it's back in the middle; verifies **AC-1**, **AC-5**, **AC-6**.
- Happy path: mark two movies watched, rate one, open `/watched`, see the score only on the rated one; unmark it, see "Your score is kept.", Undo, reload, and the date and position are unchanged; verifies **AC-2**, **AC-7**.
- Failure case: TMDB unreachable (token revoked locally) shows the error panel with Retry and never "Your watchlist is empty"; a fixture with a missing id shows the "No longer on TMDB" card, which can be removed; verifies **AC-11**.
- Failure case: Undo after the window (pgTAP with `updated_at` moved back 11 minutes) raises `P0002`, the action returns `undo_expired`, and the toast says it couldn't undo; verifies **AC-6**, **AC-7**.
- Failure case: a direct PostgREST `PATCH` setting `watchlisted_at` to 2001 on a planned row leaves it unchanged; verifies **AC-8**.
- Auth and permission: signed out `/watchlist?page=2` redirects to `/sign-in?next=/watchlist?page=2` (encoded); user A calling `restore_movie_watchlist` on B's movie id matches no row; A's PostgREST read of `user_movie_state` returns only A's rows; verifies **AC-3**, **AC-4**.

## Build plan

Tracer Bullet: the first slice pushes one read only list through every layer (migration, RLS read, TMDB titles, private page, navigation) before removal and Undo thicken it.

1. **Thin thread: the watchlist page, read only.** Declare the column, the check, the trigger (including its restore branch) and both partial indexes in `supabase/schemas/`. Generate the migration, then add the backfill by hand between the column and the check, and confirm the order. Run `pnpm db:types`. Add pgTAP `supabase/tests/060-watchlisted-at.test.sql` for insert, plan, replan, unplan keeps, first watch keeps, the ignored client write, the backfill and the check. Add `lib/tracking/movie-lists.ts` with `getWatchlistPage`, `app/watchlist/page.tsx` with the shell, Suspense, `requireUser()`, noindex and the cards (poster, title, TMDB badge, a non interactive bookmark for now), and the desktop Watchlist link in `LibraryNav`. Verify in the running app (`pnpm dev:docker`) with the two seed users. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-8**, **AC-12**, **AC-14**, **AC-17**.
2. **The watched page, pagination, empty states and legends.** Add `getWatchedPage`, `app/watched/page.tsx` with the score badge only when rated, `PaginationLinks` on both pages, the past the end redirect, the malformed page state, both empty panels, `BadgeLegend`, and the Watched link. Satisfies **AC-2**, **AC-9**, **AC-10**, **AC-13**, **AC-14**.
3. **Missing and failure states.** Add `MissingTitleCard` for `missingIds`, the error panel with `RetryLink` for TMDB and Supabase failures, and the read log lines. Satisfies **AC-11**, **AC-19**.
4. **Removal and Undo.** Add both restore functions with grants in `05-functions.sql` and generate the second migration (confirm the grants landed). Run `pnpm db:types`. Add pgTAP `supabase/tests/070-movie-restore-functions.test.sql` for invoker and `search_path`, no `anon` execute, the window, the future time, an already planned or already watched row, B's row, no insert, and rating and watchlist untouched. Add `restoreMovieWatchlist` and `restoreMovieWatched` with `undo_expired` and the `P0002` mapping, the messages, `CardRoundButton` extracted from `CardBookmarkButton`, `LibraryGrid` with the optimistic hidden set, toasts with Undo, rollback on failure, focus after removal, and the interactive bookmark and unmark buttons. In the running app, remove the only card on page 2 and confirm the `redirect()` thrown during the `refresh()` render lands you on page 1. If it doesn't, the named fallback is for `LibraryGrid` to call `router.replace` to the last page (passed down from the server) when a refreshed page comes back empty. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, **AC-16**, **AC-18**, **AC-19**.
5. **Navigation: desktop links and the mobile sheet.** Add the `AccountSlot` variants and the two navbar slots with their Suspense boundaries, the active pill, and the mobile avatar plus menu button, with the sheet holding the links, account row and Sign out. Close the sheet on navigation, update `/showcase` and the `components/AGENTS.md` note on client boundaries (`library-nav.tsx` is a new one). Satisfies **AC-14**, **AC-15**, **AC-16**.
6. **Proof.** Write Vitest tests for the reads (order, range, count, failure), both restore actions (each error path, the Zod refusals, `undo_expired`, `refresh()` only on success, logs with no ids), `LibraryGrid` (hide, rollback, Undo, several removals, focus), `LibraryNav` (active pill and `aria-current`), the sheet contents, and `app/movies/request-scope.test.ts` extended to scan `app/watchlist`, `app/watched` and `components/library`. Then run `pnpm test:db`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`, and check that `security-boundary.test.ts` and `design-tokens-boundary.test.ts` still pass. Write `verify.md` and run it in the running app with two users at 375px and desktop width. Satisfies **AC-3**, **AC-4**, **AC-17**, **AC-18**, **AC-19**, plus a regression pass over all others.

## Consequences

**Positive**:
- Both lists render from one indexed Postgres query plus at most 20 cached TMDB reads, and no catalog data enters Postgres.
- Undo restores the exact state (position and date), so pruning a list carries no risk.
- `watchlisted_at` is correct for every write path, including ones not written yet, because the database owns it.
- The mobile menu from spec 0005's Consequences is finally wired, and the loose Sign out button leaves the crowded 390px bar.

**Negative / tradeoffs**:
- A cold page makes 20 TMDB reads. It's bounded and cached for days, but slower than a snapshot column would be. Measure it during verify (see Follow-up).
- Rows planned before this migration sort by `updated_at`, which may not be when they were really planned. That's a one time inaccuracy.
- `restoreMovieWatched` accepts a timestamp from the client. The risk is small (the user's own private date, bounded to the past, their own row, a 10 minute window), but it is the first client supplied time the schema stores.
- The trigger's restore branch depends on a transaction local setting. It's safe because PostgREST cannot set one, but anyone who adds a new write path must know about it. It's commented in the schema file.
- `parsePageParam` caps pages at 500, TMDB's limit, so a list longer than 10,000 movies can't be paged past that point. That's acceptable for the MVP, and the cap would need its own parser if it ever matters.

**Neutral**:
- Two migrations: one for the column, trigger and indexes, one for the restore functions.
- `Navbar`'s single `accountSlot` prop becomes two slots. `layout.tsx` and its purity test change with it.
- The "No longer on TMDB" card is the first UI for `BatchResult.missingIds`.

## Follow-up

- [ ] During verify, record a cold and a warm load time for a full 20 card page against real TMDB in `verify.md`. If a cold load is clearly slow, revisit the snapshot column option (spec 0001's premise note, and the saved memory on the catalog cache).
- [ ] Feature 14 adds TV entries to `/watchlist`, the Stop watching and Next episode badges, and their legend entries. It must decide how movies and shows merge into one order. `watchlisted_at` has no TV counterpart yet (`user_show_state.status_changed_at` is the nearest).
- [ ] Feature 15 adds the Upcoming link to `LibraryNav` and the sheet.
