# 0013. TV status and progress: one status per show, progress from aired episodes, shows on the watchlist

**Date**: 2026-09-26
**Status**: Accepted

Scope feature: [14. TV status and progress](../../scope/scope.md) · GA tier

## Summary

This decides how you give a show one of the five statuses (Want to Watch, Watching, On Hold, Dropped, Completed), how BeStats counts how far you are through a show, and how shows join movies on your watchlist. You set the status from one pill with a menu in the show page hero; watching a regular episode moves an untracked or Want to Watch show to Watching on its own, inside the same database write, and tells you. Progress is "watched out of aired regular episodes", worked out on each view from TMDB and your episode rows and never stored. The watchlist becomes one mixed grid of planned movies plus Want to Watch and Watching shows, each show card carrying the Next episode pill from the artboard, with Stop watching (On Hold) and the Planned bookmark (remove) both undoable.

## Requirements

**User stories**:
- As a signed in user, I want to give a show one clear status, so that I know what I am watching, pausing, planning or done with.
- As a signed in user, I want marking an episode to start tracking a show for me, so that I do not have to set Watching by hand.
- As a signed in user, I want to see how many aired episodes I have watched, so that I know how far behind I am, without specials or future episodes skewing it.
- As a signed in user, I want my planned and in progress shows on the same watchlist as my movies, with the next episode on each card, so that one page tells me what to watch.
- As a signed in user, I want pausing or removing a show to keep every episode and rating I recorded, and to be undoable, so that a mis tap costs nothing.
- As a visitor, I want the show pages and grids to stay public and fast, with no empty personal widgets.

**Acceptance criteria**:

*Status on the show page*

- **AC-1**: Signed in, the show page hero (`/shows/{id}`, the `tracking` place spec 0009 reserved in `DetailHero`) shows one glass status pill. For a show with no `user_show_state` row it reads "Add to my shows"; otherwise it reads the current status label: "Want to Watch", "Watching", "On Hold", "Dropped" or "Completed". The pill opens a menu listing those five labels in that order as a single choice group, the current one checked, and, only when a row exists, a separated "Remove status" item. The menu works fully by keyboard (open with Enter, Space or Arrow Down, move with the arrows, choose with Enter, close with Escape, focus returns to the pill) and each touch target is at least 44px on mobile.
- **AC-2**: Choosing a status different from the current one calls `setShowStatus`, which writes it with `status_source = 'user'` through `set_show_status`. The pill shows the new label at once (optimistic) and, if the write fails, returns to the confirmed label and shows the matching error toast (the spec 0007 message and session expired pattern). Choosing the status the show already has sends nothing and just closes the menu, so a `system` status never silently turns into a `user` one.
- **AC-3**: Any status may be chosen from any status, including none, and choosing Completed never marks, unmarks or rates an episode. Every status change, removal and restore leaves every `user_episode_state` row of the user unchanged (checked by pgTAP after each write path).
- **AC-4**: "Remove status" calls `setShowStatus` with `null`, which deletes the row through `remove_show_status`. No confirm dialog; a toast "Removed {show} from your shows" offers Undo, which calls `restoreShowStatus` with the previous status, source and `listed_at` the delete returned.
- **AC-5**: A visitor sees no status pill and no progress line; the hero renders exactly as spec 0009 left it. A failed status read (Supabase error) shows a disabled pill reading "Status unavailable" with the existing `RetryLink`, never "Add to my shows", so a click can never overwrite a status the page failed to read.

*Automatic Watching*

- **AC-6**: When `mark_episode_watched`, `rate_episode` or `mark_season_watched` moves at least one episode with `season_number >= 1` from unwatched (`watched_at` null or no row) to watched, the same function, in the same transaction, sets the show's status to `watching` with `status_source = 'system'` if the user has no row for that show or the row's status is `want_to_watch`. It never changes On Hold, Dropped, Completed or Watching, whatever their source.
- **AC-7**: A write that marks only season 0 (Specials) episodes, re-marks an already watched episode, rates an already watched episode, or unmarks or restores episodes, never creates or changes a `user_show_state` row. Unmarking or undoing the episode that started a show leaves the show in Watching.
- **AC-8**: The three episode functions report whether they started the show (`show_started boolean`, true only when AC-6 actually changed or created the row). When it is true, the episode or season action's result carries it and the season page shows one toast "{show} moved to Watching". When it is false, no extra toast appears.

*Progress*

- **AC-9**: `lib/tv/progress.ts` holds the pure rule. `showProgress(episodes, watchedEpisodeIds, today)` takes `getShowEpisodes(...).episodes` (regular seasons only), the set of the user's watched episode ids for the show, and `requestTodayUtc()`. The eligible set is every episode whose `airStatus(airDate, today)` is `aired` (spec 0011's UTC calendar date rule, unchanged). It returns `{ kind: "none_aired" }` when the eligible set is empty, otherwise `{ kind: "counted", watched, total, next }` where `total` is the eligible count, `watched` counts only eligible episodes whose id is in the watched set, and `next` is the first eligible episode, in season then episode number order, whose id is not in the watched set, or `null` when all are watched. `watched` can never exceed `total`, and a watched special, upcoming or unknown date episode never counts.
- **AC-10**: Signed in, the show hero shows a progress line under the status pill when the user has a status row, or at least one of the user's watched episode ids is among the ids `getShowEpisodes` returns (regular seasons only, so a watched special alone does not count): "{watched} of {total} episodes watched" with a thin bar filled `watched / total`, exposed as a `progressbar` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax` and an accessible label. With `none_aired` the line reads "No episodes have aired yet" and there is no bar and no percentage. With neither, no line appears. The line renders in its own Suspense boundary with `fallback={null}`, as spec 0011's tracking slots do, so nothing shifts while it loads.
- **AC-11**: When `getShowEpisodes` returns `complete: false`, or throws, the progress line reads "Progress unavailable right now" with a `RetryLink`, and no count, bar or partial number is shown. The status pill still works; its read does not wait on the progress read.
- **AC-12**: Progress is never stored and never cached across users: the TMDB episode read stays in its existing public `hours` cache, the user's watched ids are read per request outside any `use cache` scope, and `today` is read once per request outside any cache.

*Watchlist*

- **AC-13**: `/watchlist` lists, 20 per page, the user's planned movies (`in_watchlist`) and the user's shows with status `want_to_watch` or `watching`, merged into one order: `listed_at` descending (a movie's `watchlisted_at`, a show's `listed_at`), then `kind` (`movie` before `tv`), then TMDB id, read from the `user_watchlist_entries` view with an exact count. Pagination, the page parameter rules and the empty state of spec 0008 apply to the merged list unchanged. On Hold, Dropped and Completed shows never appear.
- **AC-14**: A show's `listed_at` is set to the current time when its status enters `want_to_watch` or `watching` from no row or from any other status, and kept unchanged when it moves between those two, so starting a planned show does not move its card. It is owned by a trigger; no client write can choose it except through `restore_show_status`.
- **AC-15**: Each TV card on `/watchlist` shows the poster, the show name linking to `/shows/{id}`, the amber TMDB rating badge top right, and bottom left the Next episode pill (the TV icon and `S{season}E{episode}` of `showProgress(...).next`, with the accessible text "Next episode, season {s} episode {e}"). The pill reads "Up to date" when `next` is null and the result is `counted`; it is absent when the result is `none_aired`, when the episode read is incomplete or fails, or while it loads. Each pill streams behind its own Suspense boundary with `fallback={null}`, so the grid, posters and titles never wait for any show's episodes.
- **AC-16**: A Want to Watch show's card has the filled green Planned bookmark bottom right; activating it removes the status (`remove_show_status`). A Watching show's card has the Stop watching button (square in a circle, accessible name "Stop watching {show}") bottom right; activating it sets On Hold with `status_source = 'user'`. Either way the card leaves the page as a movie card does in spec 0008 (focus moves the same way, the page and count update), and a toast offers Undo that puts the show back with its old status, source and card position.
- **AC-17**: The watchlist legend shows, in the artboard's order, "TMDB rating", "Planned", "Stop watching" and "Next episode". A show TMDB no longer has renders the spec 0008 missing title card with the same removal control its status implies.

*Card bookmark on public grids*

- **AC-18**: Signed in, each card on `/shows` and each TV result on `/search` carries a TV bookmark, one read for the whole grid (the `CardBookmark` pattern). No row: outline Plan bookmark ("Plan {show}"), which sets `want_to_watch`. `want_to_watch`: filled Planned bookmark ("Remove {show} from watchlist"), which removes the row. Any other status: no bookmark. A visitor or a failed read renders no bookmark, and the grid never waits on the session.

*Safety*

- **AC-19**: `restore_show_status` applies only when the row is still what the undone action left, within the 10 minute Undo window every other restore function in the repo uses: after a removal, the row is absent and the `removed_at` the delete returned is less than 10 minutes old; after Stop watching, the row holds On Hold and its `updated_at` is less than 10 minutes old. Otherwise, or when the given `listed_at` or `removed_at` is in the future, it changes nothing and raises `P0002`, which the user sees as the existing "undo expired" message. A restore after a removal writes the given `listed_at`; a restore after Stop watching keeps the row's stored `listed_at`.
- **AC-20**: Two users never see or change each other's statuses or watchlist entries: direct PostgREST reads of `user_show_state` and `user_watchlist_entries`, and calls of every new or changed function with another user's show, affect and return only the caller's own rows. `anon` can neither select the view nor execute any of the functions.
- **AC-21**: Every action validates its input with Zod (show id a positive TMDB id, status one of the five values or null, restore fields typed and bounded), derives the user from `requireUser()`, and never takes a user id from the client. A session that expired shows the existing session expired toast with its Sign in action, and the UI rolls back.
- **AC-22**: At 375px the hero pill, its menu, the progress line and the watchlist TV cards work with no horizontal page scroll; the menu stays inside the viewport. `/shows`, `/shows/[id]` and `/search` stay partially prerendered (no route gains `instant = false`), and no `use cache` scope receives a user specific value.

## Decision

**Chosen option**: Option 1: statuses written only through security invoker SQL functions, the automatic Watching move inside the existing episode functions, progress and next episode as a pure TypeScript rule at read time, and the merged watchlist read from a `security_invoker` view.

`user_show_state` gains a trigger owned `listed_at`; three new functions set, remove and restore a status and return the previous values for Undo; the three episode write functions start a show in the same statement; `lib/tv/progress.ts` computes progress and the next episode from `getShowEpisodes` plus the user's watched ids; `/watchlist` pages over one view that unions movies and shows.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Feature design

### Proposed layout (extends `design/`, approved in this spec)

`design/` draws the watchlist TV cards and the legend (`desktop-watchlist-page.svg`, `mobile-watchlist-page.svg`, `badge-legend.svg`) but no show page status control and no progress. Everything below reuses spec 0004's glass pill vocabulary.

- **Status pill.** In `DetailHero`'s `tracking` place, the movie controls' pill recipe (`glassPillClassName`, `h-11` mobile, `h-9` from `md`) with a status glyph, the label and a chevron. Untracked: the outline bookmark glyph and "Add to my shows". Want to Watch: the filled Planned glyph. Watching: the TV glyph. On Hold: the Stop watching glyph. Dropped: a crossed circle. Completed: a check. The menu is Base UI's Menu through a new shadcn `components/ui/dropdown-menu.tsx` (base-nova), items as a radio group, "Remove status" after a separator in the destructive text colour.
- **Progress line.** Directly under the pill row, `text-sm text-text-secondary`: the count text, and a 4px fully rounded bar, max width `20rem`, track white at 12%, fill the Planned green token. Same text size for the "No episodes have aired yet" and "Progress unavailable right now" lines.
- **Watchlist TV card.** The spec 0008 `LibraryCard` with the Next episode pill in the bottom left (the release date pill geometry from `desktop-upcoming-page.svg`, TV icon) and the Planned bookmark or the Stop watching round button in the bottom right (`CardRoundButton`).
- **Legend.** `BadgeLegend` gains the Stop watching and Next episode entries, drawn as in the artboard.

### Data model sketch

| Entity | Key | Change | Relationship |
|---|---|---|---|
| `user_show_state` (exists) | PK `(user_id, show_id)` | **new** `listed_at timestamptz null`; **new** check `user_show_state_listed_at_check`: `status not in ('want_to_watch','watching') or listed_at is not null`; **new** partial index `user_show_state_watchlist_idx (user_id, listed_at desc, show_id) where status in ('want_to_watch','watching')`; **new** trigger `user_show_state_set_listed_at` (before insert or update). Removing a status deletes the row. | `auth.users` 1:N, `on delete cascade` |
| `user_episode_state` (exists) | PK `(user_id, episode_id)` | no column change | `auth.users` 1:N; still no FK to show state |
| `user_movie_state` (exists) | PK `(user_id, movie_id)` | unchanged | `auth.users` 1:N |
| `user_watchlist_entries` (**new view**) | logical `(user_id, kind, tmdb_id)` | `with (security_invoker = true)`: `select user_id, 'movie' as kind, movie_id as tmdb_id, watchlisted_at as listed_at from user_movie_state where in_watchlist union all select user_id, 'tv', show_id, listed_at from user_show_state where status in ('want_to_watch','watching')`. `kind` is `text` constrained by the two literals. | derived, stores nothing |

`set_listed_at()` (security invoker, empty `search_path`): on insert, `now()` when the status is one of the two listed statuses, else null. On update, `now()` when the new status is listed and the old one is not; otherwise `old.listed_at`. When the transaction local setting `bestats.restore_listed_at` is `on` (set only by `restore_show_status`), it keeps `new.listed_at` instead (insert) or `old.listed_at` (update), the spec 0008 `bestats.restore_watchlist` pattern.

Nothing derived is stored: no progress, no next episode, no count.

### State transitions

```
(no row) ──user picks S──────────────▶ S (source user)            S ∈ five statuses
(no row) ──regular episode newly watched──▶ watching (source system)
want_to_watch ──regular episode newly watched──▶ watching (source system)
any S ──user picks T ≠ S─────────────▶ T (source user)
any S ──Remove status / Planned bookmark──▶ (no row)
watching ──Stop watching──────────────▶ on_hold (source user)
Undo of the three above ──────────────▶ the previous status, source and listed_at
on_hold · dropped · completed · watching ──any episode write──▶ unchanged
```

Automatic Completed and its reversal belong to feature 16.

### API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `set_show_status(p_show_id integer, p_status tv_status, p_expected tv_status)` | SQL function, invoker, plpgsql | show id, status, expected status: the status the caller last saw, null for no row (required, no default). Only null inserts; set, it only updates. The status already stored writes nothing | one row: `status`, `status_source`, `listed_at`, `previous_status`, `previous_source`, `previous_listed_at` (previous null when there was no row, or when nothing was written) | `authenticated` | `BS409` the row no longer holds `p_expected` (`status_changed`), `42501` not yours, `23514` bad id |
| `remove_show_status(p_show_id integer, p_expected tv_status)` | SQL function, invoker, plpgsql | show id, expected status (required, never null): deletes only a row that still holds it | the deleted row's `status`, `status_source`, `listed_at`, plus `removed_at` (`now()`), or zero rows when there was none | `authenticated` | `BS409` the row holds another status (`status_changed`), `22023` null `p_expected`, `42501` |
| `restore_show_status(p_show_id integer, p_expected tv_status, p_status tv_status, p_source status_source, p_listed_at timestamptz, p_removed_at timestamptz)` | SQL function, invoker | `p_expected` null means "the row must be absent", and then `p_removed_at` is required; with `p_expected` set, `p_removed_at` is ignored and the row's `updated_at` bounds the window | the restored row | `authenticated` | `P0002` undo expired (AC-19) |
| `start_watching_show(p_show_id integer, p_should_start boolean)` | internal SQL helper, invoker, called by the three episode functions | show id; `p_should_start` computed inline by each caller: `mark_episode_watched` and `rate_episode` pass `p_season_number >= 1` and "this call moved the row from no row or null `watched_at` to watched" (captured in a CTE before the upsert); `mark_season_watched` passes `p_season_number >= 1 and cardinality(v_marked) > 0` | `boolean` started; returns false at once when `p_should_start` is false | `authenticated` (needed because invoker callers run it) | none |
| `mark_episode_watched`, `rate_episode` (changed) | SQL functions | unchanged | their current columns plus `show_started boolean` | `authenticated` | unchanged |
| `mark_season_watched` (changed) | SQL function | unchanged | `marked_ids integer[]`, `show_started boolean` | `authenticated` | unchanged |
| `setShowStatus(showId, status, expected)` | Server Action, `app/shows/actions.ts` | `showId`, `status: TvStatus \| null`, `expected: TvStatus \| null` (the status the control rendered; confirms the show with TMDB only when `expected` is null) | `{ ok: true, undo }` or `{ ok: false, error }` | `requireUser()` | `invalid_input`, `session_expired`, `not_found`, `tmdb_unavailable`, `status_changed` (refreshes the page), `write_failed` |
| `restoreShowStatus(input)` | Server Action | `{ showId, expected: TvStatus \| null, status, source, listedAt, removedAt: string \| null, returnPath }` | `{ ok: true, state }` or error | `requireUser()` | `undo_expired`, `session_expired` |
| `setEpisodeWatched`, `setEpisodeRating`, `setSeasonWatched` (changed) | Server Actions | unchanged | results gain `showStarted: boolean` | `requireUser()` | unchanged |
| `getShowStatus(showId)` | request scoped read, `lib/tracking/show-state.ts`, React `cache()` | show id | `TrackingRead<ShowStatusState \| null>` | session | `failed` |
| `getWatchedEpisodeIds(showIdsKey)` | request scoped read, React `cache()`, paged by 1000 | the show ids on the page (one for the hero) | `TrackingRead<Map<showId, Set<episodeId>>>` of `watched_at is not null` rows, any season | session | `failed` |
| `getShowStatuses(showIdsKey)` | request scoped read for grid bookmarks | the grid's show ids | `TrackingRead<Map<showId, TvStatus>>` | session | `failed` |
| `getWatchlistPage(page)` (changed) | `lib/tracking/movie-lists.ts` (renamed to `library-lists.ts`) | page | rows `{ kind, tmdbId, listedAt, status? }` and exact total from `user_watchlist_entries` | session | `failed` |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| hero pill | current status and label | `user_show_state.status` via `getShowStatus`; labels are constants in `lib/tracking/messages.ts` |
| hero pill | "Add to my shows" vs a label | presence of the row |
| `setShowStatus` | `status_source` | always `'user'`, fixed in `set_show_status`, never an argument |
| `setShowStatus` / remove | Undo payload | `previous_*` columns returned by the same function call |
| `setShowStatus` | `expected` | the status the pill, card or bookmark rendered; the database compares it before writing |
| `restoreShowStatus` | `expected` | the status the undone action left: `null` after a removal, `'on_hold'` after Stop watching; carried in the Undo payload |
| episode functions | `show_started` | whether `start_watching_show` inserted or updated a row in this call |
| every `user_id` | owner | `auth.uid()` inside SQL; `requireUser()` in actions |
| `listed_at` | card order | trigger `set_listed_at`; restore value from the Undo payload |
| progress | `today` | `requestTodayUtc()` (spec 0011), once per request |
| progress | eligible episodes and air dates | `getShowEpisodes(showId).episodes`, public `hours` cache (spec 0002, 0009) |
| progress | `complete` | `getShowEpisodes(showId).complete` |
| progress | watched set | `getWatchedEpisodeIds`, matched by TMDB episode id, so renumbering never miscounts |
| progress line visibility | "has a row or a watched regular episode" | `getShowStatus` result, or any id in `getWatchedEpisodeIds` that is also in `getShowEpisodes(showId).episodes` |
| Next episode pill | `S{s}E{e}` | `showProgress(...).next.seasonNumber` and `.episodeNumber` |
| TV card | name, poster, TMDB rating | `fetchTvShowsByIds` (existing batch read, public cache) |
| TV card | which button | the row's `status` carried by the view page read (`want_to_watch` → Planned, `watching` → Stop watching) |
| watchlist toasts | show name | the title the watchlist card already rendered, passed to the client control |
| "moved to Watching" toast (AC-8) | show name | the show name the season page already renders in its header, passed to the season store with the page's other props |
| "Removed {show}" toast (AC-4) | show name | the show name the hero already renders, passed to the status pill |
| Undo window after a removal | `removed_at` | returned by `remove_show_status`, carried in the Undo payload |

### Key invariants

- One row per user and show, one status; no second TV watchlist flag.
- `status_source = 'system'` is written only by `start_watching_show`; every user choice writes `'user'`.
- An automatic move only ever goes from nothing or `want_to_watch` to `watching`.
- Status writes never touch `user_episode_state`; episode writes only ever touch `user_show_state` through `start_watching_show`.
- `listed_at` is non null whenever the status is `want_to_watch` or `watching`.
- `0 <= watched <= total`; `total = 0` is `none_aired`, never 0% and never complete.
- A number from an incomplete episode read is never displayed.

### Security model

Private and owner only (`AGENTS.md` section 11). All three tables keep their forced RLS and four owner policies. Every new or changed function is `security invoker` with `set search_path = ''`, uses `auth.uid()` for the owner, and gets `revoke all ... from public, anon, authenticated` then `grant execute ... to authenticated`. The view is `security_invoker = true`, so the policies of both base tables apply to the reader; `revoke all on user_watchlist_entries from anon, public, authenticated`, then `grant select ... to authenticated`. `restore_show_status` stores a client supplied time, bounded to not in the future and only over the caller's own row in the expected state; forging it can only reorder the caller's own list. Actions use the per request server client, never the service role. No personal value enters a `use cache` scope or a shared cache; logs carry an event and an outcome class only. No regulated data.

### Configuration required

None. No new environment variable or credential.

### Critical test scenarios

- Happy path: untracked show, pick Watching in the hero, reload, pill reads Watching; pick On Hold, then Remove status, Undo, pill reads On Hold again; episode rows untouched throughout, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-19**
- Automatic: mark S1E1 on an untracked show, toast "moved to Watching", row is `watching`/`system`; mark a special only on another show, no row; mark an episode on an On Hold show, still On Hold, verifies **AC-6**, **AC-7**, **AC-8**
- Progress: a fixture with specials, an unknown date, an upcoming episode and a watched upcoming episode gives the exact `watched`, `total` and `next`; zero aired gives `none_aired`; `complete: false` hides the number, verifies **AC-9**, **AC-10**, **AC-11**
- Restore branches (pgTAP): Undo after a removal inserts with `bestats.restore_listed_at` on and keeps the given `listed_at` (insert branch); Undo after Stop watching updates On Hold back to Watching and keeps the stored `listed_at` (update branch); both refuse after 10 minutes, verifies **AC-14**, **AC-19**
- Watchlist order: plan a movie, then plan a show, then plan another movie; start the show; the order stays movie, show, movie by time; Stop watching removes the card and Undo restores it in the same place, verifies **AC-13**, **AC-14**, **AC-16**, **AC-19**
- Failure case: status read fails, the pill is disabled with Retry; a status write fails, the pill rolls back; a stale Undo after another tab changed the status refuses with undo expired, verifies **AC-2**, **AC-5**, **AC-19**
- Auth/permission: user B's direct PostgREST select on the view and table returns none of A's rows; B calling `set_show_status`, `remove_show_status` or `restore_show_status` for a show A tracks changes only B's rows; `anon` gets `42501`, verifies **AC-20**, **AC-21**

## Build plan

Tracer Bullet: the first task is one thin real thread (a status set from the hero and read back, database to screen), then each strand thickens it end to end. The migration is sliced: the status functions ride the thread, the episode function changes ride their own strand, the view rides the watchlist strand.

1. The thin thread: migration for `listed_at`, its check, index and trigger, `set_show_status`, `remove_show_status`, `restore_show_status` with grants; regenerated types; pgTAP for listed_at transitions, restore guards, cross user and `anon`; `lib/tracking` schemas, messages and log events; `getShowStatus`; `setShowStatus` and `restoreShowStatus`; the dropdown menu component; the hero status pill with the menu, optimistic label, Remove status with Undo, the visitor and read failure states; verified in the running app with two browsers, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-19**, **AC-20**, **AC-21**
2. The automatic strand: migration for `start_watching_show` and the three changed episode functions (drop and recreate for the new return shapes); pgTAP for every row of AC-6 and AC-7; `showStarted` through the three actions and the season store; the "moved to Watching" toast, satisfies **AC-6**, **AC-7**, **AC-8**
3. The progress strand: `lib/tv/progress.ts` with unit tests; `getWatchedEpisodeIds`; the hero progress line in its own Suspense boundary with the counted, none aired, unavailable and hidden states, satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**
4. The watchlist strand: migration for `user_watchlist_entries` with grants and pgTAP; `getWatchlistPage` over the view; `LibraryItem` gains `kind`; TV cards with the streamed Next episode pill, Planned and Stop watching with Undo, the missing title card, and the two legend entries, satisfies **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-17**
5. The grid strand: `getShowStatuses` and the TV bookmark on `/shows` cards and `/search` TV results, satisfies **AC-18**
6. Proof: 375px and keyboard passes on the pill, menu, line and cards; the request scope and layout purity tests extended; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm build` (routes still partially prerendered); `explain analyze` of the watchlist page query on a seeded user with a few hundred entries, recorded in `verify.md` (each half reads only the caller's rows, by index or seq scan as the planner prefers; the sort is a top N heapsort bounded to that user's listed rows, never a sort of either whole table; measured at 0.37 ms for 350 entries; the ceiling is 50 ms at 1,000 entries, not yet measured, and checked at the next verify under the conditions in *Watchlist query plan* in [rationale.md](rationale.md)); `verify.md`, satisfies **AC-12**, **AC-20**, **AC-22**

## Consequences

**Positive**:
- Every status write and the automatic move are single statements in Postgres, so two tabs cannot race and a failure never leaves episode and status out of step.
- Progress and the next episode are one pure function that Up Next (feature 15) and automatic completion (feature 16) can import unchanged.
- The watchlist stays one exact, paged query, so counts remain truthful as the library grows.
- `status_source` now carries real meaning, which feature 16 needs to leave deliberate choices alone.

**Negative / tradeoffs**:
- The episode functions change their return shapes, so every caller and the generated types move together in one migration; a partial deploy would break the season page.
- Each Watching or Want to Watch card on the watchlist reads that show's full episode list from TMDB (cached for hours). A cold page with 20 long running shows fans out to many season requests; the per card Suspense keeps the grid fast, but the pills can arrive slowly on a cold cache.
- Deleting the row on removal loses `status_changed_at` history; Undo covers mistakes, but there is no record of past statuses.
- A special alone never starts a show, which a user who watches only specials may find surprising.
- Automatic Watching is never undone by unmarking, so a single mis tap on an untracked show leaves it in Watching until changed by hand.

**Neutral**:
- Spec 0011, AC-24 ("no episode write touches `user_show_state`") is amended by AC-6 here: the only such write is `start_watching_show`.
- Adds a `dropdown-menu` shadcn component, `lib/tv/progress.ts`, `lib/tracking/show-state.ts`, and a view, the first in the schema.
- `lib/tracking/movie-lists.ts` becomes `library-lists.ts`, since the watchlist is no longer movies only.

## Follow-up

- [ ] Feature 15 (Up Next) reuses `showProgress(...).next` and `getWatchedEpisodeIds`; it excludes On Hold and Dropped by status, which this spec stores.
- [ ] Feature 16 (automatic completion) writes `completed` with `status_source = 'system'` and must require `getShowEpisodes(...).complete`; it can reuse `showProgress` for "all aired regular episodes watched".
- [ ] The watched page stays movies only; TV history on `/watched` has no artboard and no scope row. Decide it in `/scope` if wanted.
- [ ] Next `/check verify`: seed one user with 1,000 listed entries, run the watchlist query `explain analyze` under the conditions in *Watchlist query plan* in [rationale.md](rationale.md), confirm it stays under 50 ms, and record the result in `verify.md`.
- [ ] If cold watchlist pills prove slow in verify, consider a lighter "latest aired episode" read before caching any TMDB metadata in Postgres, which spec 0008 chose not to do.
