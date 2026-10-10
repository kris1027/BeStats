# 0020. Progress based library pages: one page per title, worked out from what you watched and what has aired

**Date**: 2026-10-07
**Status**: In Progress
**Amended**: 2026-10-10. Pause and Drop are removed: a show is tracked or not, Stop tracking is the only way out, every existing hold is cleared, and the hold removal ships inside the contract migration. Settled in a grilling session on 2026-10-10; see [rationale.md](rationale.md#amendment-2026-10-10-pause-and-drop-removed).

Scope feature: [23. Progress based library pages](../../scope/scope.md) · GA tier

Supersedes in part: [0013](../0013-tv-status-and-progress/index.md) (the five statuses and the status control), [0014](../0014-up-next/index.md) (Up Next on `/upcoming`), [0019](../0019-tv-history-on-watched/index.md) (Completed as the rule for `/watched`). Supersedes in full: [0015](../0015-automatic-completion/index.md) (automatic completion). The decisions were settled in a grilling session on 2026-10-07.

## Summary

Today the status you pick (Want to Watch, Watching, On Hold, Dropped, Completed) decides which page a show sits on. This change drops those statuses. A show is simply tracked or not, and the page it appears on is worked out every time you open the page, from the episodes you watched and the air dates TMDB gives. Unwatched aired episodes put it on Watchlist. Being caught up with a dated next episode, or not started with nothing dated, puts it on Upcoming. Being caught up with nothing dated puts it on Watched. Movies follow the same one page rule. The only choice you make by hand is whether a show is tracked; Stop tracking (with Undo) takes it off every page.

## Requirements

**User stories**:
- As a signed in user, I want every show to sit on the one page that matches where I am with it, so I never have to keep a status up to date by hand.
- As a signed in user, I want shows I'm caught up on to move to Upcoming when a new episode gets a date, and back to Watchlist when it airs, without touching anything.
- As a signed in user, I want to stop tracking a show so it leaves my pages without losing my episode history and ratings.
- As a signed in user, I want planned movies that aren't out yet on Upcoming, and to move them to Watchlist on release day.

**Acceptance criteria**:

*Tracking model*
- **AC-1**: A show is **tracked** when the user has a `user_show_state` row for it, and **untracked** otherwise. There is no hold: Pause and Drop were removed (amended 2026-10-10). Want to Watch, Watching, On Hold, Completed, Paused, Dropped and the `tv_status`, `status_source` and `show_hold` types appear nowhere in the UI, the database or the TypeScript types.
- **AC-2**: On `/shows/{id}`, a signed in user sees a toggle. It reads **Plan to watch** when the show is untracked, and a click tracks it. It reads **Tracking** when the show is tracked, with the accessible name "Stop tracking {title}" (the action the click takes, as the card bookmark names it; no `aria-pressed`, which would contradict an action name), and a click stops tracking (AC-3). There is no menu.

  The progress line under the control is unchanged. A signed out visitor sees the control's existing signed out state.
- **AC-3**: **Stop tracking** deletes the row and leaves every episode mark and rating untouched. A toast offers Undo, which restores `tracked_at` exactly, so the show returns to its old place. An Undo that can no longer apply shows "Couldn't undo. Track the show again from its page."
- **AC-4**: Stop tracking is idempotent. A show that is already untracked (stopped in another tab) writes nothing, the toast confirms it is no longer tracked without an Undo, and the page refreshes. There is no expected value check.
- **AC-5**: Marking an episode or a season watched on an untracked show tracks it with no hold, and the toast says "{Show} added to your shows". On a tracked show it changes nothing about tracking. Only a mark that newly watches a regular episode tracks the show: marking a special, or a mark that changes nothing (an episode already watched, or a season with nothing left to mark), leaves an untracked show untracked.
- **AC-6**: The bookmark on catalog and search show cards is filled when the show is tracked and empty otherwise. On an untracked show, a click tracks it. On a tracked show, a click stops tracking, with the Undo of AC-3.

*Show classification*
- **AC-7**: For each tracked show, the page is worked out from that show's TMDB details read and the user's watched regular episodes. Specials (season 0) never count. "Today" is the request's UTC date (`requestTodayUtc()`).
  - **Aired episodes** are every regular episode `(s, e)`, with `e` from 1 to the season's episode count, that sorts at or before `last_episode_to_air`. A `next_episode_to_air` whose air date is on or before today also counts as aired, along with everything before it. With no `last_episode_to_air`, nothing has aired. Edge cases:
    - Seasons with no episode count are skipped.
    - When `last_episode_to_air` is in a season missing from the seasons list, or listed with an episode count below its number (cache skew), episodes 1 to its number in that season count as aired, because TMDB itself says that episode aired.
    - When `last_episode_to_air` is a special (season 0), every regular episode of each regular season whose own air date is on or before today counts as aired. If even that leaves no aired episode while a regular season has no date, the show never goes on Watched: it goes on Watchlist at its first unwatched episode when that sorts before a dated `next_episode_to_air` (or there is none), on Upcoming (dated) at that next episode otherwise, and on Upcoming (Date TBA) when every listed episode is already watched.
    - A malformed `last_episode_to_air` or `next_episode_to_air` (missing numbers, a number of 0 where a regular episode is expected, an unparseable date) is read as `null`. It never fails the whole show.
  - **Watchlist**: at least one aired episode is unwatched. The card's next episode is the first unwatched aired episode in season and episode order.
  - **Upcoming (dated)**: no aired episode is unwatched, and `next_episode_to_air` is a regular episode with an air date strictly after today.
  - **Upcoming (Date TBA)**: no aired episode is unwatched, nothing is dated, and the user has watched no regular episode.
  - **Watched**: no aired episode is unwatched, nothing is dated, and the user has watched at least one regular episode. An announced season with no episodes or no date counts as nothing dated.
- **AC-8**: Every tracked show whose TMDB read succeeded is on exactly one of `/watchlist?type=tv`, `/upcoming?type=tv` and `/watched?type=tv`. There are two exceptions: a title whose TMDB read failed is on no page (AC-17), and a title TMDB no longer has shows only as a "No longer on TMDB" card on Watchlist (AC-17), which is not a classification.
- **AC-9**: A Watchlist show card shows:
  - the poster
  - the show name, linking to `/shows/{id}`
  - the next episode, as "S1E3" plus the episode name when it loads (the name streams per card, as Up Next does today)
  - a **Mark watched** button

  The button needs the episode's TMDB id, which comes from the per card `getSeason` read. It stays pending until that read lands. If the read fails, the card shows today's Up Next "unavailable" state, carried over unchanged. Mark watched keeps the Up Next behaviour of spec 0014: a pending state, a toast with Undo, the stale second tab message, and a refresh that moves the card if the show changes page. Cards are ordered by last activity, newest first: the later of the newest watched regular episode and `tracked_at`, with ties broken by `show_id` ascending.
- **AC-10**: Removed 2026-10-10. There is no Paused & dropped section; Watchlist shows only the grid of AC-9.
- **AC-11**: An Upcoming show card shows the poster, the name, and either "S2E1 · Oct 20" (formatted by `formatShortDate`, which adds the year outside the current UTC year) or "Date TBA". It has no Mark watched. Dated cards come first, soonest first, and Date TBA cards come last. Ties go by `tracked_at` newest first, then `show_id`.
- **AC-12**: A Watched show card is the spec 0019 card: the calculated show rating badge, no button, no TMDB rating. It adds a label: **Finished** when TMDB's status is `Ended` or `Canceled`, **Caught up** otherwise. Cards are ordered by last watched time, newest first: the newest watched episode in any season, specials included, falling back to `tracked_at`. Ties go by `show_id`.

*Movies*
- **AC-13**: A movie is classified as follows:
  - **Watched** when `watched_at` is set, whatever `in_watchlist` says.
  - Otherwise, when `in_watchlist` is true, it is on **Watchlist** if its TMDB release date is on or before today, and on **Upcoming** if the date is after today, missing or unparseable by `parseTmdbDate` ("Date TBA").
  - Watchlist movies keep `watchlisted_at` newest first. Upcoming movies go soonest release first, with Date TBA last, then `watchlisted_at` newest first. Watched movies are unchanged (`watched_at` newest first). Every final tie goes by `movie_id` ascending.
- **AC-14**: Marking a movie watched no longer clears `in_watchlist`. Unmarking it puts a planned movie straight back on Watchlist or Upcoming, and leaves an unplanned movie on no page. The movie page button still reads "Add to watchlist" and stays in its planned state while the movie is also watched.

*Pages*
- **AC-15**: `/upcoming` has no Up Next section. Its shows tab lists the Upcoming shows of AC-11, and its movies tab lists the Upcoming movies of AC-13. Neither has a Mark watched button.
- **AC-16**: Every classified tab pages 20 cards at a time, and its total is the exact count of the titles classified onto it. A page past the end redirects to the last page. A malformed page number shows "That page doesn't exist", as today.
  - **Ceiling:** each request classifies at most 500 tracked shows, or 500 planned unwatched movies. The ceiling is applied in SQL before any TMDB read, with one ordering that all of that media type's tabs inherit: shows by AC-9's activity time (`order by greatest(last_regular_watched_at, tracked_at) desc, show_id limit 501`), and movies by `watchlisted_at desc, movie_id limit 501`. When a 501st row exists, every tab of that media type shows "Checked your 500 most recent shows" (or "movies"), and its count covers only what was checked.
  - Each tab classifies on its own request. No count is shown outside the tab's own heading. After Mark watched, `router.refresh()` updates the grid and the count together.
  - `/watched?type=movie` needs no classification and has no ceiling.
- **AC-17**: When a single show's or movie's TMDB read fails, that title is placed on no page. Every tab of that media type shows "N shows couldn't be loaded · Retry" (or "movies"), and Retry refreshes the route. A systemic TMDB failure (a rejected credential or an exhausted rate limit) shows the existing failed panel with Retry.
  - A title TMDB no longer has renders the existing "No longer on TMDB" card at the end of its Watchlist tab (shows and movies alike), with a Stop tracking (show) or Remove (movie) button, and counts toward that tab.
  - `/watched?type=movie` reads no TMDB data for membership, so it never shows the failure note.
- **AC-18**: Empty states:
  - Watchlist shows: "Nothing to watch right now", "Plan a show or catch up on one and its next episode shows up here."
  - Upcoming shows: "Nothing coming up", "Planned shows not out yet, and shows you're caught up on with a dated next episode, show up here."
  - Watched shows: "No watched shows yet", "Shows you're caught up on show up here."
  - Watchlist movies: "No movies to watch", "Planned movies that are already out show up here."
  - Upcoming movies: "No upcoming movies", "Planned movies not released yet show up here."
  - Watched movies: unchanged.

  Each empty state keeps its Browse button. The signed out redirect, the loading skeletons, the `?type` panel and the 375px layout behave as today.

*Data, security, docs*
- **AC-19**: The migration maps every existing row:
  - `want_to_watch`, `watching` and `completed` → tracked with no hold
  - `on_hold` → `paused`
  - `dropped` → `dropped`
  - `tracked_at` = `coalesce(listed_at, status_changed_at)`, and a held row's `hold_changed_at` = `status_changed_at`

  This is what the expand migration did. The contract migration (amended 2026-10-10) then clears every hold, so a paused or dropped show becomes an ordinary tracked show and lands on the page AC-7 gives it, and drops `hold_state`, `hold_changed_at` and `show_hold`.

  No episode mark, rating or movie row is changed, apart from AC-14's new rule going forward. Movies watched before this change keep `in_watchlist = false`, as stored.
- **AC-20**: Row level security on `user_show_state` keeps restricting reads, inserts, updates and deletes to the owner. The new view is `security_invoker`, and every new function is `security invoker` with `anon` revoked. The cross user pgTAP suite proves user B cannot read, track, untrack or restore user A's shows, including through direct calls to the functions.
- **AC-21**: No page writes to the database when it loads. Automatic completion, its functions, `status_source`, and its writes on `/shows/{id}` and `/upcoming` are gone.
- **AC-22**: TMDB reads stay in the public cache (`getTvShow`, `cacheLife("hours")`; `getMovie`, `cacheLife("days")`). Classification and every user value is computed per request outside any cache, with "today" read once per request.
- **AC-23**: `AGENTS.md` sections 1, 7, 8, 9 and 13 and its repo facts describe the tracked or untracked model (no holds) and progress based pages instead of the five statuses. `docs/scope/scope.md` carries feature 23. Specs 0013, 0014 and 0019 carry a "Superseded in part by 0020" note, and spec 0015's status reads "Superseded by 0020".
- **AC-24**: With 100 tracked shows and 100 planned movies on a warm cache, each tab renders its last card in under 1.5 s on `pnpm start` locally. The cold time is recorded in `verify.md`.

## Decision

**Chosen option**: Option 2: Classify per request from the TMDB show details read

Replace stored statuses with a tracked row (the optional hold was removed on 2026-10-10). Every library tab works out its titles on each request, in a pure function, from one cached TMDB details read per title and the user's own state.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Table | Key | Fields | Notes |
|---|---|---|---|
| `user_show_state` | PK (`user_id`, `show_id`); FK `user_id` → `auth.users` on delete cascade (1:N) | `tracked_at timestamptz not null default now()` (a new column, backfilled from `listed_at`; never a rename) · `created_at` · `updated_at` | `status`, `status_source`, `status_changed_at` and `listed_at` are removed in the contract migration only. Until then they stay with every old trigger, check, index and view. The expand migration also added `hold_state`, `hold_changed_at`, their check, the held index and the hold trigger branch; the contract migration drops them all (amended 2026-10-10). A trigger owns `tracked_at` on insert, so no client chooses it (same pattern as `listed_at` today); the restore function is the only path that writes it explicitly. |
| `user_movie_state` | unchanged | unchanged | `mark_movie_watched` stops setting `in_watchlist = false` (AC-14). The partial index on `in_watchlist` gains `and watched_at is null` so it holds only classifiable rows. |
| `user_episode_state` | unchanged | unchanged | Its `show_order_idx` serves the last activity reads. |
| Enum `show_hold` | | `paused`, `dropped` | Added by expand, dropped by contract (amended 2026-10-10), along with `tv_status` and `status_source`. |
| View `user_tracked_shows` | | `user_id`, `show_id`, `tracked_at`, `last_regular_watched_at` (newest watched regular episode), `last_watched_at` (newest watched episode, any season) | `security_invoker = true`. Read only for `authenticated`. Replaces `user_watchlist_entries`, `user_up_next_shows` and `user_watched_entries`. Its `hold_state` and `hold_changed_at` columns are removed by contract. |

**Classification** (pure TypeScript in `lib/tv/library-page.ts` and `lib/catalog/movie-page.ts`, no I/O):

```
classifyShow(details: { seasons, lastEpisodeToAir, nextEpisodeToAir, status },
             watched: Set<"s:e"> of regular episodes, today)
  → { page: "watchlist", next: {season, episode} }
  | { page: "upcoming", airDate: string | null, next: {season, episode} | null }
  | { page: "watched", label: "finished" | "caught_up" }

classifyMovie({ releaseDate, inWatchlist, watchedAt }, today)
  → "watched" | "watchlist" | "upcoming" | null
```

`TvShow` gains `lastEpisodeToAir` and `nextEpisodeToAir` (`{ seasonNumber, episodeNumber, airDate: string | null } | null`), normalized from the details response with Zod. Nothing extra is requested from TMDB.

**State transitions** (show):

```
untracked ──Plan to watch / episode mark / bookmark──▶ tracked
tracked ──Stop tracking (toggle or bookmark)──▶ untracked ──Undo──▶ tracked(tracked_at as before)
```

The page (Watchlist, Upcoming or Watched) is not a state. It is recomputed on every request from AC-7.

**API surface** (Server Actions in `app/shows/actions.ts`, each calling one invoker rights Postgres function; inputs validated with Zod in `lib/tracking/schemas.ts`):

| Action | Postgres function | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `trackShow` | `track_show(p_show_id)` | `showId: int > 0` | `{ tracked: true, newlyTracked: boolean }`. `newlyTracked` is true exactly when the `insert … on conflict do nothing returning` CTE returned a row. | `requireUser` | session expired, write failed |
| `untrackShow` | `untrack_show(p_show_id)` | `showId` | `{ trackedAt }` for Undo, or nothing when the show was already untracked (AC-4) | `requireUser` | session expired, write failed |
| `restoreShowTracking` | `restore_show_tracking(p_show_id, p_tracked_at)` | the value from `untrackShow` | restored row | `requireUser` | `already_tracked`; bound: `tracked_at` not in the future. A client supplied `tracked_at` only moves the caller's own sort order, which is accepted. |
| `setEpisodeWatched`, `setSeasonWatched`, `setEpisodeRating` (changed) | `mark_episode_watched`, `mark_season_watched` and `rate_episode` call `track_show` in place of `start_watching_show` | unchanged | The SQL return shape is unchanged, so the old app keeps working: `show_started` now means "newly tracked". TypeScript maps it to `showTracked`, and `showCompleted` is removed from `ShowStatusFlags`. | `requireUser` | unchanged |
| `setMovieWatched`, `restoreMovieWatched`, `restoreMovieWatchlist` (changed) | `mark_movie_watched`, `restore_movie_watched`, `restore_movie_watchlist` | unchanged | They no longer assume watched clears the plan (AC-14). pgTAP 050 and 070 are updated. | `requireUser` | unchanged |

Removed 2026-10-10: `setShowHold`, `set_show_hold`, the `p_expected` argument of `untrack_show`, the hold arguments of `restore_show_tracking`, and the `hold_changed` and `not_tracked` errors.

Removed: `setShowStatus`, `restoreShowStatus`, `set_show_status`, `remove_show_status`, `restore_show_status`, `start_watching_show`, `complete_show_automatically`, `reopen_show_automatically`, `reopen_completed_show`, `lib/tracking/auto-completion.ts`, `lib/tv/auto-completion.ts`.

Files:
- **Kept:** `requestTodayUtc` stays in `lib/tracking/episode-state.ts`.
- **Moved:** `UPCOMING_MOVIE_CHECK_LIMIT` (in `lib/tracking/up-next.ts`) becomes `LIBRARY_CLASSIFY_LIMIT = 500` in `lib/tracking/library-lists.ts`. `components/upcoming/up-next-card.tsx`, `up-next-pill.tsx` and `mark-next-watched-button.tsx` move to `components/library/` as the Watchlist show card. `dated-pill.tsx` serves the Upcoming card.
- **Rewritten:** `lib/tracking/library-lists.ts` and its tests.
- **Rewritten or deleted:** `lib/tracking/show-state.ts`, `intent.ts` and `up-next.ts` lose every status path. A module left empty is deleted.

Reads (server only, in `lib/tracking/library-lists.ts`): `getShowLibraryTab(page, tab)` reads `user_tracked_shows` (every tracked show, the 500 most active), the user's watched regular episodes for those shows, and `getTvShow` for each through `mapWithConcurrency`. It then classifies, sorts and slices. `getMovieLibraryTab(page, tab)` does the same over planned unwatched movies with `getMovie`. `/watched?type=movie` keeps its existing direct query.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Classify show | aired episode set | `TvShow.seasons[].episodeCount` + `lastEpisodeToAir` (+ `nextEpisodeToAir` when its date ≤ today), from `getTvShow` |
| Classify show | watched set | `user_episode_state` rows with `season_number ≥ 1` and `watched_at` set |
| Classify show / movie | today | `requestTodayUtc()`, read once per request outside the cache |
| Watchlist show card | next episode number | derived: first unwatched aired episode (AC-7) |
| Watchlist show card | next episode name | `getSeason(showId, season)` per card, streamed (unchanged spec 0014 pattern) |
| Watchlist order | last activity | `user_tracked_shows.last_regular_watched_at`, else `tracked_at` |
| Upcoming show card | date or TBA | `TvShow.nextEpisodeToAir.airDate`, formatted by the existing date helper |
| Watched show card | Finished / Caught up | `TvShow.status` ∈ {`Ended`, `Canceled`} |
| Watched show card | rating badge | `getShowRatings` (spec 0012/0019, unchanged) |
| Watched order | last watched | `user_tracked_shows.last_watched_at`, else `tracked_at` |
| Show page toggle | Plan to watch / Tracking | whether a `user_show_state` row exists, read in the private slot that holds the status today (`show-status-slot.tsx`, renamed `show-tracking-slot.tsx`), behind its existing Suspense boundary |
| Undo of Stop tracking | old placement | the `untrack_show` return values, held by the toast |
| Movie classification | release date | `Movie.releaseDate` from `getMovie` |
| Ceiling note | "Checked your 500 most recent …" | derived: row count read with `limit 501` |
| Failure note | N | count of per title failures in the batch |

**Key invariants**:
- At most one `user_show_state` row per user and show (primary key). Tracking twice is a no op (`on conflict do nothing`).
- No tracking function writes `user_episode_state`.
- Classification is a pure function of (TMDB details, user state, today). Nothing derived is stored.
- A title appears on at most one page per request, and a tracked show whose TMDB read succeeded appears on exactly one.

**Security model**: Private to the owner, as today. RLS stays forced on `user_show_state` with the existing owner policies for select, insert, update and delete. Every new function is `security invoker` with `set search_path = ''`, writes `auth.uid()` and never takes a user id; `anon` and `public` are revoked and `authenticated` is granted execute. The view is `security_invoker` and grants only select to `authenticated`. Server Actions call `requireUser()` before any write. TMDB responses stay in the shared cache, and user rows never do. No compliance scope beyond what spec 0017 already covers, and no new processor.

**Configuration required**: none.

**Critical test scenarios**:
- Classifier unit table (`lib/tv/library-page.test.ts`), verifies **AC-7**, **AC-8**:
  - partly watched with aired episodes left → Watchlist
  - caught up with next dated tomorrow → Upcoming
  - caught up with next dated today → Watchlist
  - caught up with a season announced but undated → Watched/Caught up
  - an Ended show finished → Watched/Finished
  - nothing watched, aired → Watchlist S1E1
  - nothing watched, premiere dated → Upcoming
  - nothing watched, nothing dated → Upcoming TBA
  - specials watched only → treated as nothing watched
  - next is a special → ignored
  - out of order watching (S2 watched, S1E4 not) → Watchlist S1E4
  - `last_episode_to_air` is a special → falls back to season air dates
  - `last_episode_to_air` in a season missing from the list → counted
  - malformed next or last → read as null
- Movie classifier table, verifies **AC-13**, **AC-14**: released planned, future planned, undated planned, watched and planned, watched and unplanned.
- pgTAP, verifies **AC-1**, **AC-3** to **AC-5**, **AC-19**, **AC-20**: the contract clears every hold and drops the hold columns; untrack is idempotent; untrack then restore round trip; an episode mark tracks an untracked show and leaves a tracked one unchanged; user B blocked on every function and the view.
- Browser, verifies **AC-9**, **AC-10**, **AC-15**, **AC-17**: mark the last aired episode of an ongoing show with a dated next episode and see it move from Watchlist to Upcoming; Stop tracking with the toggle and Undo; a forced TMDB failure for one show shows the note.
- Timing, verifies **AC-24**: a seeded user with 100 shows and 100 movies, warm and cold, on `pnpm start`.

## Build plan

Tracer Bullet: the first slice runs the whole pipe for one tab (shows on Watchlist), then each strand thickens it end to end.

1. **Expand migration** (`supabase/schemas` plus a migration):
   - add the `show_hold` enum and the `tracked_at`, `hold_state` and `hold_changed_at` columns, with backfill per AC-19
   - make `status` nullable with default `'watching'`, so the old deployed app keeps working during the rollout window
   - keep `listed_at`, `status_changed_at`, `status_source`, every old trigger (including the completion and reopen triggers in `03-triggers.sql`), check, index, view and function, untouched
   - add the triggers, the check constraint, the `user_tracked_shows` view, and the `track_show`, `set_show_hold`, `untrack_show` and `restore_show_tracking` functions
   - **legacy mirror** (dropped in contract): `track_show` also writes `status = 'watching'` on insert, and `set_show_hold` also writes the matching legacy `status` (`on_hold`, `dropped`, or `watching` on Resume) with `status_source = 'user'`, so a rollback to the old app shows what the new app set
   - point `mark_episode_watched`, `mark_season_watched` and `rate_episode` at `track_show`, keeping their return shapes
   - change `mark_movie_watched`, `restore_movie_watched` and `restore_movie_watchlist` per AC-14

   Regenerate types (`pnpm db:types`), and write the new pgTAP files for mapping, functions and cross user isolation, plus updates to 050 and 070. Between this step and step 8, only the new and changed pgTAP files must pass; the old status files (090 to 150, 010 to 040) stay as they are until contract. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-14**, **AC-19**, **AC-20**.
2. **Thin thread**: add `lastEpisodeToAir` and `nextEpisodeToAir` to `TvShow` (schema, normalize, fixtures), and build `classifyShow` with its unit table. Then build `getShowLibraryTab` and wire `/watchlist?type=tv` to it, reusing the Up Next card with Mark watched, plus the count, pages and ceiling. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-16**, **AC-22**.
3. **The Upcoming and Watched show tabs**: point `/upcoming?type=tv` at the Upcoming tab with dated and TBA cards, and remove the Up Next section and the auto completion call there. Point `/watched?type=tv` at the Watched tab, with Finished/Caught up labels and the 0019 rating badge. Satisfies **AC-11**, **AC-12**, **AC-15**, **AC-21**.
4. **The tracking control**:
   - replace `ShowStatusControl` and its slots with the Plan to watch / Tracking toggle (Stop tracking, Undo). Shipped first as a pill with Pause, Drop and Resume; reduced to the toggle on 2026-10-10
   - add the `trackShow`, `untrackShow` and `restoreShowTracking` actions and their schemas and messages
   - turn the card bookmark into track and untrack
   - change the episode and season toasts to "added to your shows"
   - remove the auto completion call from `/shows/{id}`

   Satisfies **AC-2** to **AC-6**, **AC-21**.
5. **Paused & dropped**: shipped, then removed on 2026-10-10 with `getHeldShows`, `held-shows.tsx`, `held-show-card.tsx` and their tests. AC-10 is withdrawn.
6. **Movies**: build `classifyMovie` and `getMovieLibraryTab`, then re-point `/watchlist?type=movie` and `/upcoming?type=movie` at them, with soonest release first and TBA last, keeping the ceiling. Check the movie page button and the unmark flow for AC-14. Satisfies **AC-13**, **AC-14**, **AC-16**.
7. **Failure and empty states**: add the per title failure note with Retry, the "No longer on TMDB" cards with Stop tracking or Remove, the systemic failed panel, and the new empty copy in `lib/tracking/messages.ts`. Satisfies **AC-17**, **AC-18**.
8. **Contract migration** (second migration, pushed only after the new app is live):
   - drop `status`, `status_source`, `status_changed_at` and `listed_at`, with their checks, indexes and triggers (including the completion and reopen triggers in `03-triggers.sql`) and the legacy mirror writes
   - drop the `tv_status` and `status_source` enums, the old views, and the old functions, including the legacy mapping helpers `legacy_hold_for_status` and `legacy_status_for_hold` with pgTAP 165
   - **hold removal** (amended 2026-10-10): clear every hold first, then drop `hold_state`, `hold_changed_at`, their check, the held index, the hold branch of the `tracked_at` trigger, the view's hold columns, `set_show_hold` and the `show_hold` enum; recreate `untrack_show(p_show_id)` and `restore_show_tracking(p_show_id, p_tracked_at)` without their hold arguments
   - rename the episode functions' `show_started` result to `show_tracked`, which no deployed app will read by then. `rate_episode` also loses its `newly_marked` column, which nothing reads (as built, 2026-10-10), and the rule "only a mark that newly watches a regular episode tracks the show" (AC-5) lives in one helper, `track_show_after_watch`, that all three episode functions call
   - delete the auto completion modules, their tests and pgTAP files 100, 130 and 131, so the full `pnpm test:db` passes on a fresh `db reset`. As built (2026-10-10): 090, 110, 150 and 120's up next cases tested only objects this step drops, so they were deleted rather than rewritten, and `120-newly-marked` keeps the one rule of 120 that survives; 010, 030, 040 and 140 were rewritten, and 020 needed no change

   Satisfies **AC-1**, **AC-21**. The app change that stops reading holds ships in the same PR (amended 2026-10-10).
9. **Docs**:
   - rewrite `AGENTS.md` sections 1, 7, 8 and 9, items 9 to 11 of section 13, and the repo facts (remove "Two server renders write")
   - update `components/AGENTS.md` and `lib/auth/AGENTS.md` where they name statuses
   - add the supersede notes to 0013, 0014, 0015 and 0019
   - update the scope for feature 23 and move "Scheduled automatic completion" out of Deferred
   - check that `/privacy` needs no change

   Satisfies **AC-23**.
10. **Proof**: run typecheck, lint, unit tests, `pnpm test:db` on a fresh `db reset`, and the build. Do a 375px and keyboard pass on all six tabs and the show page, run the AC-24 timing, write `verify.md`, then follow the rollout in the Migration plan. Satisfies **AC-24** and every AC through verification.

## Migration plan

**Strategy**: Expand, then contract, across two migrations, because the running app reads `status`. Amended 2026-10-10: the contract also removes holds, so it ships with the app change that stops reading them.

**Phases**:
1. Push the expand migration (`supabase db push`). The old app keeps working: every column, trigger, view and function it reads is unchanged, the episode functions keep their return shapes, and inserts without `status` get `'watching'`. New columns are backfilled, and the `tracked_at` default covers rows the old app inserts. A movie that is both planned and watched now shows on the old app's Watchlist too; that's accepted for the window.
2. Merge the PR and let Vercel deploy the new app, which reads only the new columns. Verify production: open each tab, track, pause, resume, stop and undo on a test account.
3. Contract (amended 2026-10-10): one PR carries the contract migration, the hold removal and the app that no longer reads holds. Push the migration, then merge at once. The live app breaks between the push and the Vercel deploy (minutes), which is accepted at the current user count. Production is verified once, after the deploy.

**Rollback**: Before phase 3, revert the Vercel deployment to the previous one. The expand migration is additive, so the old app runs against it unchanged. The legacy mirror writes holds set by the new app as `on_hold` or `dropped`, so the old app shows them correctly. A Completed choice the old app made in the window maps to tracked with no hold, as AC-19 does. After phase 3, rollback means a forward fix; the old columns and the holds are gone.

**Risks**:
- A user who changes a status in the old app between phase 1 and phase 2 (minutes) keeps the backfilled hold value. That's acceptable at the current user count, and phase 2 should follow phase 1 promptly.
- The cold cache load for a large library is slow. AC-24 measures it, and the ceiling bounds it.

## Consequences

**Positive**:
- No status goes stale. A show moves between pages on its own as you watch and as TMDB adds dates.
- Automatic completion, its pin rules and its writes on page load disappear, and with them the hardest rules in `AGENTS.md` section 9.
- One pure classifier serves every tab and is easy to unit test.

**Negative / tradeoffs**:
- Every tab now needs one TMDB read per title before it can count or paginate. A cold cache on a large library is slow, and the 500 ceiling can hide older titles, with a note.
- Classification from show details assumes TMDB numbers episodes 1 to `episode_count` within each season, and that `last_episode_to_air` is current to within the `hours` cache. A show whose latest episode aired in the last few hours may show on Upcoming until the cache refreshes.
- Exact counts depend on TMDB being reachable. A failed title drops out of the counts, which the note discloses.
- The rule "Want to Watch is the TV watchlist state" in `AGENTS.md` section 8 and the manual Completed choice are gone. A user can no longer call a show Completed by hand; it reaches Watched only by being caught up.

**Neutral**:
- Two migrations and a coordinated rollout, per the Migration plan.
- pgTAP files 090 to 150 are largely rewritten.
- `UPCOMING_MOVIE_CHECK_LIMIT` (200) becomes the shared ceiling of 500.

## Follow-up

- [ ] If AC-24's cold time proves painful in real use, reopen the "no catalog cache in Postgres" decision (spec 0008) or a stored classification, in its own spec.
- [ ] Contract migration and hold removal (Build plan step 8) as its own PR, verified in production once after deploy.
