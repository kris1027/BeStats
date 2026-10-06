# 0019. TV history on /watched: completed shows join watched movies in one grid

**Date**: 2026-10-05
**Status**: In Progress

Scope feature: [21. TV history on /watched](../../scope/scope.md) · GA tier

## Summary

The `/watched` page lists only movies today. This adds every show you have marked Completed to the same grid, mixed in with your watched movies and sorted by when you last watched something from each title. A show card looks like a movie card but carries your calculated show rating (the average of your rated seasons, to one decimal) and no button: you edit a show's history on the show page, never from this grid. It needs one new read only database view and no new table, and the page still writes nothing when it loads.

## Requirements

**User stories**:
- As a signed in user, I want the shows I finished on `/watched` next to the movies I watched, so the page is my whole history.
- As a signed in user, I want each finished show to carry my own show rating, kept apart from TMDB's rating, so I can see at a glance what I thought of it.
- As a signed in user, I want my episode history safe from a stray tap on this page, so a show only leaves it when I change its status.

**Acceptance criteria**:
- **AC-1**: A signed in user sees, on `/watched`, every show whose status is Completed together with every movie they marked watched, in one grid and one pagination of 20 cards a page.
- **AC-2**: The grid is ordered by last watched time, newest first. A movie's time is its `watched_at`. A show's time is the newest `watched_at` of any of its watched episodes, specials included; a Completed show with no watched episode uses the time it became Completed (`status_changed_at`). Ties go movies first, then by TMDB id ascending, so no card swaps places between pages.
- **AC-3**: The total behind the pagination is exact and truthful: watched movies plus Completed shows, one count from one query. A page past the end redirects to the last page, and a malformed page number shows "That page doesn't exist", as today.
- **AC-4**: Only status decides whether a show appears. A show with watched episodes but any other status (Want to Watch, Watching, On Hold, Dropped, or none) is absent. A show that becomes Completed, by the user's hand or automatically, appears on the next load; a show that leaves Completed, by hand or by the automatic reopen of spec 0015, disappears on the next load. Neither change touches its episode history or ratings.
- **AC-5**: A show card shows the poster, the show name linking to `/shows/{id}`, and, when the show has one, the user's calculated show rating to one decimal in the cyan personal score badge: the equal weight mean of the rated regular seasons, specials and unrated seasons left out (`AGENTS.md` section 9, spec 0012). A show with no eligible rating has no badge. A show card never shows the TMDB community rating. Movie cards are unchanged: an explicit integer score, or no badge.
- **AC-6**: A show card has no button. Nothing on `/watched` unmarks, removes or changes a show.
- **AC-7**: Unmarking a movie on the merged page still works as spec 0008 built it: the card hides at once, the toast offers Undo that restores its old place, the next card (movie or show) moves up from the following page, focus moves to a neighbour card's title link or the heading, and a failed write puts the card back with an error.
- **AC-8**: A Completed show TMDB no longer has renders the "No longer on TMDB" card with no title link and no button.
- **AC-9**: With no watched movie and no Completed show, the empty state reads "Nothing watched yet" and "Movies you mark watched and shows you complete show up here.", with Browse movies and Browse shows buttons. The grid's accessible label is "Titles you watched, page N". The badge legend stays the single "Your score" entry.
- **AC-10**: Failures never render the empty state or a false rating. A failed list read shows "Couldn't load your watched titles" with Retry; a systemic TMDB failure shows "Couldn't reach TMDB" with Retry; a failed read of the page's rated episodes shows the list failure panel, never show cards without a badge.
- **AC-11**: A signed out visitor is redirected to sign in before any list data is read, and `LibrarySection` still calls `requireUser()` itself.
- **AC-12**: One user can never read another user's watched titles: not through the page, and not through a direct REST read of the new view. `anon` has no privilege on the view, `authenticated` has select only, and nothing writes through it.
- **AC-13**: `/watched` writes nothing on load (no automatic completion check runs there), no private read sits inside `use cache`, and the route keeps its static shell (heading and skeleton grid) under Cache Components.
- **AC-14**: At 375 px wide and by keyboard alone, show cards are reachable, their focus is visible, and they keep the movie card's look from `design/desktop-watched-page.svg` and `design/mobile-watched-page.svg`.
- **AC-15**: The page query stays fast for a heavy user: `explain analyze` on a seeded user with 1,000 entries (watched movies plus Completed shows, the shows holding a few thousand episode rows) stays under 50 ms, recorded in `verify.md`.

## Decision

**Chosen option**: Option 1: one ordered view over both tables, rating computed in TypeScript.

Add a `security_invoker` view, `public.user_watched_entries`, that unions watched movies and Completed shows with one sort time each, page it with one ordered query and an exact count as `/watchlist` does, and compute each show card's rating from one batched read of the page's rated episodes through the existing `ratingsBySeason` and `showRating`.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Design source**: the existing artboards `design/desktop-watched-page.svg` and `design/mobile-watched-page.svg` for the page, and the existing `PosterCard` with the cyan `CalculatedRatingBadge` for a show card. The artboards draw movie cards only; the engineer approved reusing the movie card for shows without a new artboard. That deviation is recorded here, not invented at build time.

**Data model sketch**: no new table, no new column, no stored rating.

New view `public.user_watched_entries`, `with (security_invoker = true)`:

| Column | Type | Movie half | Show half |
|---|---|---|---|
| `user_id` | uuid | `m.user_id` | `s.user_id` |
| `kind` | text | `'movie'` | `'tv'` |
| `tmdb_id` | integer | `m.movie_id` | `s.show_id` |
| `last_watched_at` | timestamptz | `m.watched_at` | `coalesce(max(e.watched_at), s.status_changed_at)` |
| `rating` | smallint | `m.rating` | `null::smallint` |

- Movie half: `user_movie_state as m where m.watched_at is not null`. Reads the existing partial index `user_movie_state_watched_idx`.
- Show half: `user_show_state as s left join user_episode_state as e on e.user_id = s.user_id and e.show_id = s.show_id and e.watched_at is not null where s.status = 'completed' group by s.user_id, s.show_id, s.status_changed_at`. Every season counts toward the time, season 0 included (AC-2). The join finds each show's rows through `user_episode_state_show_order_idx`, but that index holds no `watched_at`, so every episode row of every Completed show is fetched from the table and aggregated, on the page query and on the count only reread alike. Because the sort spans both halves, the ordered page cannot come straight off either index; it is a top N sort over the user's rows.
- Grants: `revoke all ... from anon, public, authenticated`, then `grant select ... to authenticated`, as `user_watchlist_entries` does.
- Lives in `supabase/schemas/06-views.sql` with its migration in `supabase/migrations/`, plus regenerated types (`pnpm db:types`).
- No new index up front. AC-15 measures the plan, and it may miss for a user with tens of thousands of episode rows (a long running anime). If it misses, the first fix is already chosen: a partial index `user_episode_state (user_id, show_id, watched_at desc) where watched_at is not null`, in its own migration, measured before and after.

**State transitions**: none new. A show's presence follows `user_show_state.status` alone: entering `completed` (manual `set_show_status`, or `complete_show_automatically` of spec 0015) adds it; leaving it (manual change, `reopen_show_automatically`, removing the status) drops it. Removing a movie's watched mark drops the movie, and `restore_movie_watched` brings it back in its old place, both as today.

**API surface**: no new action, route handler or endpoint. Server reads only.

| Read (server only, `lib/tracking/library-lists.ts` unless noted) | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `getWatchedPage(userId, page)`, now over `user_watched_entries` | verified `userId`, parsed `page` | `{ kind: "ok", rows: WatchedRow[], total }` | session from `requireUser()`; RLS through the view | `failed` on any DB error; `PGRST103` → count only reread for the redirect |
| `getShowRatings(userId, showIds)` (new, in `lib/tracking/show-ratings.ts`) | verified `userId`, the page's show ids (at most 20) | `Map<showId, number \| null>`, the unrounded mean | as above | `failed` on any DB error |
| `getLibraryTitles(movieIds, showIds)` (unchanged) | ids | titles per kind | public cached TMDB reads | `failed` on systemic TMDB error |

`WatchedRow` becomes `{ kind: "movie" | "tv"; tmdbId: number; watchedAt: string; rating: number | null }`. The query selects `kind, tmdb_id, last_watched_at, rating` and orders `last_watched_at desc, kind asc, tmdb_id asc` with `{ count: "exact" }`, filtered by `user_id` explicitly as well as by RLS (the spec 0007 pattern). The type generator makes every view column nullable, so the mapping skips a row with a null `tmdb_id` or `last_watched_at` or a `kind` other than `movie` or `tv`, as `getWatchlistPage` does; the view never yields one. The `PGRST103` count only reread also switches to `user_watched_entries` (with no `watched_at` filter, which the view already applies).

`getShowRatings` selects `show_id, season_number, rating` from `user_episode_state` with `.eq("user_id", userId).in("show_id", showIds).not("rating", "is", null)`, ordered by `show_id` then `episode_id`, paged by `SHOW_RATINGS_PAGE_SIZE` (1000) through `readKeysetPages`, the keyset loop it shares with `getShowEpisodeRatings`: each page starts after the last `(show_id, episode_id)` read rather than at an offset, so a rating cleared mid read skips no other row, and reading stops once a page holds the whole remaining count. `getShowEpisodeRatings` moved from offset to keyset paging in the same change, for the same reason. A failure logs `show_tracking.rating_read`. It groups rows per show and returns `showRating(ratingsBySeason(rows)).mean`.

Read order in `LibrarySection` for the watched list: after the page read (and its redirect), `getLibraryTitles` runs first, alone. If it fails, the TMDB panel shows. If it succeeds, `getShowRatings` runs for the show ids TMDB found (a missing show has no card that shows a rating); it is skipped, with no query, when there are none. If it fails, the list panel shows (AC-10). The two reads are sequential on purpose: the rating ids depend on the titles, and the extra round trip is one small indexed query.

UI changes:
- `LibraryItem` gains `showRating: number | null` (the unrounded mean; null for a movie or an unrated show). Every test fixture of `LibraryItem` gains it.
- `toLibraryRows` decides by the `list` it is given, not by row shape (the old `"movieId" in row` check goes away). A watched `movie` row maps to `status: null` with its `rating` and `watchedAt`. A watched `tv` row maps to `status: "completed"`, `rating: null`, `watchedAt: null` (Undo is movies only).
- `LibraryCard` badge on the watched list: a `movie` keeps `PersonalScoreBadge` when `rating !== null`; a `tv` item gets `CalculatedRatingBadge` with `label="Your show rating"` only when `showRating !== null` (never passed null, which would print "Not rated"), and never `TmdbRatingBadge`. A watched `tv` card renders no `RemoveButton`, and the watched list's `MissingTitleCard` renders no button for a `tv` item. That suppression is explicit in `LibraryCard`, not a side effect of `RemoveButton`'s branches.
- `LibrarySection`: the Next episode pill loop runs only for `list === "watchlist"`, with a regression test that `/watched` builds none. The new copy goes in `COPY.watched`.
- `LibraryGrid`: removal code only ever runs for movie cards on this page, and Undo for movies is unchanged. `moveFocusFrom` skips any neighbour card with neither a title link nor a button (a missing title show card) when choosing where focus goes, and falls back to the heading when none is left, with a test of a missing title show beside an unmarked movie.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Watched page | which titles, and their order | `user_watched_entries.kind`, `tmdb_id`, `last_watched_at`, ordered as above |
| Watched page | a show's sort time | `max(user_episode_state.watched_at)` for that show and user, any season; else `user_show_state.status_changed_at` |
| Watched page | total and last page | the exact count of the same query; `libraryLastPage` |
| Watched page | card `status`, `watchedAt` | `toLibraryRows` by list: movie `null` and the row's time; show `"completed"` (the view's filter) and `null` |
| Watched page | movie badge | `user_watched_entries.rating` (`user_movie_state.rating`), through `PersonalScoreBadge` |
| Watched page | show badge | `getShowRatings` → `showRating(ratingsBySeason(...)).mean` (spec 0012), formatted by `formatCalculatedRating` |
| Watched page | title, poster | `getLibraryTitles` (TMDB summaries, cached per title) |
| Watched page | card link | `kind` + `tmdb_id` → `/movies/{id}` or `/shows/{id}` |
| Unmark movie, Undo | restored `watched_at` | the row's `watchedAt` as PostgREST returned it (unchanged, spec 0008) |
| Empty, failure copy | strings | `COPY.watched` in `components/library/library-section.tsx`, per AC-9 and AC-10 |

**Key invariants**:
- Status alone decides a show's presence; episode rows alone never put a show on this page (AC-4).
- No rating is stored or rounded for storage; the show mean is computed per request from episode rows and rounded only by `formatCalculatedRating` (`AGENTS.md` section 8 and 9).
- The calculated show rating and the movie score never share a formatter: a show uses `CalculatedRatingBadge`, a movie `PersonalScoreBadge`.
- Nothing on `/watched` writes to a show's rows.
- The page renders the grid only when the list read, the rating read (when it ran) and the TMDB titles all succeeded.

**Security model**: private to the owner. The view runs with the reader's rights, so the forced RLS on `user_movie_state`, `user_show_state` and `user_episode_state` applies exactly as on direct reads; without `security_invoker` it would bypass RLS, so pgTAP pins the option. `anon` holds nothing on the view; `authenticated` holds select only. Both reads take `userId` from `requireUser()`, never from the client. No read runs inside `use cache` (`AGENTS.md` section 11). No new secret, no new log field beyond the existing `listRead` events. No regulated data beyond what the tracking tables already hold.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: a user with two watched movies and two Completed shows (one with episodes watched yesterday, one completed by hand with none) sees four cards in the AC-2 order, the show with ratings carrying its one decimal badge, verifies **AC-1**, **AC-2**, **AC-5**
- Ordering edge: a special watched today moves its Completed show to the top; a movie and a show stamped in the same instant put the movie first, verifies **AC-2**
- Status edge: a Watching show with every episode watched is absent; set it to Completed and it appears; reopen it and it vanishes with its episodes and ratings intact, verifies **AC-4**
- Rating rules: a show with season 1 averaging 8 over 10 episodes, season 2 averaging 6 over 2, and a rated special shows `7.0`; a show with only specials rated shows no badge, verifies **AC-5**
- Pagination: 21 entries across kinds put the 21st on page 2, `?page=3` redirects to page 2, unmarking the last movie on page 1 pulls the first card of page 2 up, verifies **AC-3**, **AC-7**
- Failure: the rated episode read fails and the page shows the list error with Retry, not unbadged cards; a TMDB outage shows the TMDB panel, verifies **AC-10**
- Auth/permission: user B reads `user_watched_entries` directly and gets no row of user A's; `anon` is denied; insert, update and delete through the view fail, verifies **AC-11**, **AC-12**
- Pure render: loading `/watched` changes no row anywhere, verifies **AC-13**

## Build plan

Tracer Bullet: the first task is one thin real thread (a Completed show from the database to a card on `/watched`), then each strand thickens it end to end. One migration, riding the thread.

1. The thin thread: the `user_watched_entries` view in `06-views.sql` and its migration with grants; regenerated types; pgTAP (new `150-watched-entries.test.sql`) for the union, the AC-2 sort time including specials and the `status_changed_at` fallback, status filtering, cross user isolation, `anon` denial, select only, and the `security_invoker` option; `getWatchedPage` over the view with the new `WatchedRow`; `toLibraryRows` deciding by list and mapping `tv` rows; the Next episode pill loop guarded to the watchlist; show cards on `/watched` with the title link and no button; verified in the running app with one movie and one Completed show, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-6**, **AC-11**, **AC-12**
2. The rating strand: `getShowRatings` with unit tests for the paged loop and per show grouping; `LibraryItem.showRating`; `CalculatedRatingBadge` on watched show cards; the rating read failure routed to the list error panel, satisfies **AC-5**, **AC-10**
3. The page strand: pagination, the past the end redirect and the malformed page panel over the merged count; the new `COPY.watched` empty state, grid label and failure title; the missing title show card with no button; movie unmark, Undo and focus moves checked with show cards present, including `moveFocusFrom` skipping a missing title show card, satisfies **AC-3**, **AC-7**, **AC-8**, **AC-9**, **AC-10**
4. Proof: 375 px and keyboard passes on show cards; the request scope and layout purity tests extended to `/watched` (no write on load, no private read in `use cache`); `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db` (after a clean `db reset`), `pnpm db:types:check`, `pnpm build` (route still partially prerendered); `explain analyze` of the page query and the count only reread on a seeded user with 1,000 entries (about 700 watched movies and 300 Completed shows holding 5,000 episode rows in total) recorded in `verify.md`, adding the planned partial index only if it misses 50 ms; `verify.md`, satisfies **AC-13**, **AC-14**, **AC-15**

## Migration plan

**Strategy**: no data migration needed. One additive migration creates a view; no table, column or row changes.
**Phases**:
1. `supabase db push` the view migration before merging the PR that reads it (`docs/deploy.md`).
2. Merge and deploy the page change.
**Rollback**: revert the PR; the view is unused and harmless, and a later migration can drop it.
**Risks**: deploying the code before the push makes `/watched` fail its list read (the error panel, not a crash) until the view exists.

## Consequences

**Positive**:
- `/watched` becomes the whole history in one order, with no stored projection that can go stale.
- The view follows the `user_watchlist_entries` pattern exactly, so security and paging reuse proven code and tests.
- The rating rule still lives once, in `lib/tv/ratings.ts`.

**Negative / tradeoffs**:
- A show you are partway through, or paused or dropped, never appears here, even with many watched episodes. History of unfinished shows lives only on each show page.
- A show that finished on TMDB joins only after you open its page or `/upcoming` (or set Completed yourself), because `/watched` runs no completion check.
- A Completed show TMDB removes leaves a card you cannot clear from this page; you would have to reach its status some other way, and its show page no longer exists. Rare, and the same tradeoff no button implies.
- Each page with shows costs one extra query (the rated episodes), and the view groups every watched episode of each Completed show to find its time.
- The page uses the movie card for shows without an artboard drawing one.

**Neutral**:
- The empty state, grid label and failure copy change from movie wording to title wording.
- An episode watched again (unmarked, then marked) moves its show to the top, because `watched_at` is the last mark.
- A show completed today whose episodes were all watched years ago sorts years back, by its episodes, not by today.
- Unmarking episodes of a Completed show moves it to its newest remaining episode time, and unmarking all of them moves it to the time it became Completed.

## Follow-up

- [ ] If AC-15's measurement misses 50 ms, add the planned partial index named in the data model sketch, in its own migration, measured before and after.
- [ ] If showing unfinished shows becomes wanted, that is a new decision (a history of Watching, On Hold and Dropped shows), not a tweak of this view's filter.
- [ ] `/sync` after the build: the root `AGENTS.md` line about which pages read which views, and `lib/tracking` notes, may need the new view.
