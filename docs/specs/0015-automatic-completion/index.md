# 0015. Automatic completion: move a finished show to Completed, and back when it changes

**Date**: 2026-09-30
**Status**: Accepted

Scope feature: [16. Automatic completion](../../scope/scope.md) · GA tier

## Summary

This decides when BeStats moves a show to Completed by itself, and when it moves it back. A show becomes Completed on its own only when TMDB says it has Ended or been Canceled, the whole episode list was read without a gap, and you have watched every aired regular episode. The check runs right after you mark episodes, and again when you open the show page or `/upcoming`. It goes back to Watching when a new episode airs, when you unmark one, or when TMDB says the show is ongoing again. A status you chose by hand is never overwritten by a visit, and nothing new is stored: the existing `status_source = 'system'` marks an automatic Completed.

## Requirements

**User stories**:
- As a signed in user, I want a show I have finished to leave Up Next and read Completed on its own, so that my queue only holds shows with something left to watch.
- As a signed in user, I want an automatically completed show to come back to Watching when a new episode airs or the show is revived, so that I never miss new episodes of a show BeStats closed for me.
- As a signed in user, I want my own choices (On Hold, Dropped, a Completed or Watching I picked) left alone by background checks, so that the app never argues with me.
- As a signed in user, I want an easy way back when marking the finale completed a show, so that a mis tap costs one tap.

**Acceptance criteria** (the contract):

*The rule*

- **AC-1**: A show is **finished and watched** only when all of these hold: the `getShowEpisodes(showId)` read succeeded with `complete: true`; its `showStatus` is exactly `Ended` or `Canceled` (any other value, including `Returning Series`, `In Production`, `Planned`, `Pilot` and the empty string, is ongoing); and `showProgress(episodes, watchedIds, today)` is `counted` with `next === null`. A `none_aired` result, an incomplete read, a `TmdbError` and a missing show are never finished. Specials (season 0) never count, watched or not. This is one pure function, `completionVerdict` in `lib/tv/auto-completion.ts`, with unit tests for every branch.
- **AC-2**: `completionVerdict` answers `complete`, `reopen` or `none` from the verdict of AC-1, the row's `status` and `status_source`, and the trigger (`write` with `newlyWatchedRegular`, or `visit`), exactly as the table under *State transitions* says. An incomplete or failed read always answers `none`, in both directions: a partial fetch never completes a show and never reopens one.
- **AC-3**: `complete_show_automatically` moves a row from `watching` to `completed` with `status_source = 'system'` only when the row exists and still holds `watching`, its source is `system` or `coalesce(p_allow_user_source, false)` is true, `p_episode_ids` holds 1 to 20000 ids, and the number of distinct ids among them that have a `user_episode_state` row of the caller with `show_id = p_show_id` and `watched_at` not null equals the number of distinct ids passed. It reads those episode rows `for share`, so an unmark still in flight is waited for and then seen. Otherwise it writes nothing, never inserts, and returns false. It never changes `user_episode_state`. Calling it again on a row it already completed writes nothing and leaves `status_changed_at` and `updated_at` as they were.

*Completion after your own write*

- **AC-4**: After `setEpisodeWatched(..., true)`, `setEpisodeRating(...)` with a score, `setSeasonWatched(..., true)` or the restore branch of `undoSeasonWatched` succeeds, the action runs the rule for that show with the `write` trigger, in this order, stopping at the first step that rules completion out: (1) one select of the row's `status` and `status_source`, stop unless `watching`; (2) `getTvShow(showId)`, stop unless `isFinishedShowStatus(status)`; (3) `getShowEpisodes(showId)` and `getWatchedEpisodeIds`, then `completionVerdict`. So a tick on an ongoing, paused or dropped show never reads a season. `newlyWatchedRegular` is true when that write moved at least one episode with `season_number >= 1` from unwatched to watched: `newly_marked` from `mark_episode_watched` and, new, from `rate_episode` (each with the call's own season number), or a non empty `marked_ids` from `mark_season_watched` on a regular season. The restore branch of `undoSeasonWatched` always passes false, because an Undo is not a new watch; it can still complete a `system` row. A write on a special passes false too, so it can complete a `system` row only. With a `complete` verdict, the show moves to Completed (AC-3) and the result carries `showCompleted: true`. Because `start_watching_show` already ran in the same write, an untracked or Want to Watch show that this write finishes goes straight to Completed.
- **AC-5**: When the write completed the show, you see one toast. On an Up Next card: "Marked {show} S{s}E{e} watched · Moved to Completed", with the card's existing Undo. On Mark season watched: "Marked {n} episodes watched · {show} moved to Completed", with the season's existing Undo. On a single episode tick or a rating on the season page: "{show} moved to Completed", with no Undo (unticking the episode is the way back, through AC-8). When one write both started and completed a show, only the Completed toast shows. The strings live in `lib/tracking/messages.ts` as `UP_NEXT_MESSAGES.markedCompleted(show, s, e)`, `SEASON_MESSAGES.markedCompleted(n, show)` and `SHOW_STATUS_MESSAGES.completed(show)`. The Undo reverses the mark, and the reopen of AC-8 then puts the show back to Watching.
- **AC-6**: When the check after a successful write cannot decide (the TMDB read throws, is incomplete, or the status write fails), the episode write still stands, the status is unchanged, no error toast appears, the result carries `showCompleted: false`, and one `show_tracking.auto_complete` event is logged with its outcome class.
- **AC-7**: On `/upcoming`, when Mark watched completes a show, the page refreshes and the card is gone from Up Next. Focus moves to the next card's title link, else the previous card's, else the "Up Next" heading. `MarkNextWatchedButton` captures that target before it calls the action (the neighbouring list item's `a[id^="up-next-"]`, else the new `UP_NEXT_HEADING_ID` in `components/upcoming/ids.ts`, whose `h2` gets `tabIndex={-1}`), because the button unmounts with its card; with `showCompleted` it focuses that target instead of its own card. Undo from the toast brings the card back (the show reopens, AC-8), first in the list since its `status_changed_at` is now, and focus returns to its title link by id, as spec 0014 AC-16 already does.

*Reopening*

- **AC-8**: Two row level triggers on `user_episode_state` share one function: `after update of watched_at ... when (old.watched_at is not null and new.watched_at is null and old.season_number >= 1)` and `after delete ... when (old.watched_at is not null and old.season_number >= 1)`. In the same transaction, it moves that user's show from `completed` with source `system` to `watching` with source `system`. It never changes a `completed` row with source `user`, any other status, or anything for a special. This covers the single untick, the Up Next Undo, the season unmark, the Undo of Mark season watched, and a direct API update. No toast announces it.
- **AC-9**: The trigger function catches nothing: a real failure fails the unmark, which the existing error toast reports. Deleting a user (the `auth.users` cascade) whose shows include an automatic Completed succeeds whichever table the cascade reaches first, a season unmark of many episodes reopens the show once and succeeds, and a clear of a rating alone (`watched_at` unchanged) fires nothing (pgTAP for each).

*Checks on a visit*

- **AC-10**: On `/shows/{id}`, signed in, when your row is `watching` or `completed` with source `system`, the page runs the rule with the `visit` trigger before the status pill and the progress line render, and both show the result. `watching` becomes `completed`; `completed` becomes `watching` when the read is complete and the show is no longer finished and watched (a new regular episode has aired, an episode is unwatched, or TMDB no longer says Ended or Canceled). With no row, or a row whose source is `user`, or any other status, the pill makes no TMDB read and no change happens.
- **AC-11**: On `/upcoming`, before the Up Next list is read, the rule runs with the `visit` trigger for every show of yours that is `watching` or `completed` with source `system`, with no cap, reading TMDB through the shared cache at a concurrency of 8, each show settled on its own (`Promise.allSettled`), so one failing show never blocks the others. `reconcileUpNextShows()` is the first await inside the one function that calls `getUpNextShows()`, and nothing else on the page reads `user_up_next_shows`. The list, its order and its empty state then reflect the result: a show just completed is absent; a show just reopened is present, first in the order (its `status_changed_at` is now), with its new next episode. Coming soon never waits for this.
- **AC-12**: A visit check that cannot decide (a TMDB error, an incomplete read, a show TMDB no longer has, a failed read of your system rows, or a failed status write) changes nothing, shows nothing extra, and the page renders what the database holds, with the existing unavailable states of specs 0013 and 0014. One `show_tracking.auto_complete` event is logged per failed show with its outcome class.
- **AC-13**: No other page runs the check: `/watchlist`, `/watched`, the season page and the catalog never write a status on load.

*Your choices stay yours*

- **AC-14**: No trigger ever changes On Hold, Dropped, Want to Watch (except through the existing automatic Watching of spec 0013), or a Completed with source `user`. A Watching with source `user` changes only through the `write` trigger with `newlyWatchedRegular` true. After you choose Watching by hand on an automatically completed show, no visit completes it again. (pgTAP for the functions and the trigger, unit tests for `completionVerdict`.)
- **AC-15**: Every automatic change, in both directions, leaves every `user_episode_state` row of the user unchanged, watched dates and ratings included (pgTAP after each path).
- **AC-16**: The check is idempotent: running it again with the same inputs writes nothing (pgTAP: a second `complete_show_automatically` or `reopen_show_automatically` returns false and leaves `updated_at` and `status_changed_at` unchanged), and two browsers loading `/upcoming` at once end in one state with no error shown (a manual step in `verify.md`; pgTAP cannot run two sessions).
- **AC-19**: Choosing, from the status pill, the status the show already has when its source is `system` writes it again with source `user` through `set_show_status`, so no automatic check touches it afterwards; the pill's label and checked item do not change, and no toast shows. Choosing the current status when its source is `user` still sends nothing. This replaces the last sentence of spec 0013 AC-2.

*Proof*

- **AC-17**: The two new functions are `security invoker` with an empty `search_path`, executable by `authenticated` only. User B cannot complete or reopen user A's show through them, the trigger, or a direct request; `anon` cannot call them (pgTAP).
- **AC-18**: With 20 Watching and 20 automatic Completed shows (all source `system`) on a seeded user, the time until the Up Next list renders on `/upcoming` is recorded in `verify.md` with a cold TMDB cache and a warm one. Warm, the check adds at most 500 ms over the same user with those rows set to source `user`.

## Decision

**Chosen option**: Option 1: check on your own writes and on visits to the show page and `/upcoming`, touching only rows the system set during a visit; complete through a guarded invoker SQL function that checks the watched ids itself; reopen on unmark through a trigger.

Automatic completion is decided by one pure rule over the TMDB episode read, the TMDB show status and your watched ids. It is applied by the Server Actions right after an episode write and by the two pages before they render, written through two `security invoker` SQL functions that store `completed` or `watching` with `status_source = 'system'`, and undone on unmark by a trigger in the same transaction. No column, table, job, or elevated key is added.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new table or column. The existing `user_show_state` (spec 0001, 0013) carries it:

| Table | Key | Fields this feature reads or writes |
|---|---|---|
| `user_show_state` | PK `(user_id, show_id)`, FK `user_id` → `auth.users` (cascade) | `status tv_status` (not null), `status_source status_source` (not null), `status_changed_at` (trigger), `listed_at` (trigger `set_listed_at`), `updated_at` |
| `user_episode_state` | PK `(user_id, episode_id)` | `show_id`, `season_number`, `watched_at` (nullable), `rating`; gains the trigger `reopen_completed_show` |

Meaning of the pair:
- `completed` + `system`: an automatic completion. Only `complete_show_automatically` writes it.
- `completed` + `user`: your choice. Nothing automatic touches it.
- `watching` + `system`: started or reopened automatically; visits may complete it.
- `watching` + `user`: your choice; only your own finishing write may complete it.

Catalog values (TMDB status, episode list, air dates) are never stored (the no catalog cache decision of spec 0008 and its [rationale](../0008-watchlist-and-movie-history/rationale.md)). `ShowEpisodes` gains `showStatus: string`, taken from the same `fetchTvShow` read that lists the seasons, so the status and the episodes always come from one cached snapshot (`hours`).

**State transitions**:

```
watching·system  ──write or visit, finished and watched──────────────▶ completed·system
watching·user    ──write that newly watched a regular episode,
                   finished and watched──────────────────────────────▶ completed·system
watching·user    ──visit──────────────────────────────────────────────▶ unchanged
completed·system ──regular episode unwatched or deleted (trigger)─────▶ watching·system
completed·system ──visit, read complete, not finished and watched────▶ watching·system
watching·system · completed·system ──you pick the same status (AC-19)──▶ same status·user
completed·user · on_hold · dropped · want_to_watch ──any check───────▶ unchanged
any              ──read incomplete, failed, or show gone──────────────▶ unchanged
```

`completionVerdict(verdict, row, trigger)`:

| Row | Trigger | Finished and watched | Not finished (read complete) | Read incomplete or failed |
|---|---|---|---|---|
| `watching` · `system` | write or visit | `complete` | `none` | `none` |
| `watching` · `user` | write, `newlyWatchedRegular` | `complete` | `none` | `none` |
| `watching` · `user` | write without it, or visit | `none` | `none` | `none` |
| `completed` · `system` | visit | `none` | `reopen` | `none` |
| `completed` · `system` | write | `none` | `none` (unmark is the trigger's job) | `none` |
| anything else, or no row | any | `none` | `none` | `none` |

The date boundary is spec 0011's: an episode is aired when its TMDB air date (a calendar date, no time) is on or before today's UTC date (`requestTodayUtc()`), and an episode with no date is not aired. A new episode "appears" to the check once its UTC air date arrives and the `hours` TMDB cache holds it.

Side effects the existing triggers already give: a reopen sets `status_changed_at` to now (Up Next sorts it first) and `listed_at` to now (`set_listed_at`, since Watching is a listed status), so a reopened show also moves to the top of `/watchlist`. Completion clears it from `/watchlist` and Up Next through their existing status filters.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `complete_show_automatically(p_show_id integer, p_episode_ids integer[], p_allow_user_source boolean)` | SQL function, invoker, plpgsql | show id; the ids of every eligible (aired, regular) episode from the same TMDB read; whether a `user` Watching may complete (null reads as false) | `boolean` completed | `authenticated` | `22023` null, empty, or more than 20000 ids; `23514` `p_show_id` not positive. The app never calls it above 20000 ids (the verdict answers `none`, not logged as a failure) |
| `reopen_show_automatically(p_show_id integer)` | SQL function, invoker | show id | `boolean` reopened (only `completed`·`system` → `watching`·`system`; no row, no insert) | `authenticated` | `23514` `p_show_id` not positive |
| `reopen_completed_show()` | trigger function, invoker, empty `search_path`, on the two `user_episode_state` triggers of AC-8 | `old` row | none | runs as the writer | none of its own; uses `old.user_id` and `old.show_id`, never `auth.uid()`; catches nothing |
| `set_show_status` (changed) | SQL function | unchanged | unchanged | `authenticated` | unchanged. When `p_status` equals the stored status and the stored source is `system`, it updates `status_source` to `user` (AC-19) and reports the previous status and source; with source `user` it still writes nothing |
| `ShowStatusControl` (changed) | client component | `state.source` it already receives | choosing the current item calls `setShowStatus` when `state.source === "system"`, else just closes (AC-19) | n/a | the existing rollback and error toasts |
| `rate_episode` (changed) | SQL function | unchanged | current columns plus `newly_marked boolean` (drop and create again, like spec 0013) | `authenticated` | unchanged |
| `completionVerdict(read, row, trigger, watchedIds, today)` | pure TS, `lib/tv/auto-completion.ts` | the `ShowEpisodes` read or a failure, `{ status, source }` or null, `{ kind: "write", newlyWatchedRegular } \| { kind: "visit" }`, watched ids, today | `{ kind: "complete", episodeIds } \| { kind: "reopen" } \| { kind: "none" }` | none | none |
| `isFinishedShowStatus(status)` | pure TS, same file | TMDB `status` string | `boolean`, true only for `Ended` and `Canceled` | none | none |
| `applyAutoCompletion(showId, trigger)` | server only, `lib/tracking/auto-completion.ts` | show id, trigger | `{ changed: "completed" \| "reopened" \| null }`; never throws (catches, logs, returns null) | session (`requireUser()` inside) | logs `show_tracking.auto_complete` |
| `getReconciledShowStatus(showId)` | request scoped read, React `cache()`, same file | show id | `TrackingRead<ShowStatusState \| null>` after any visit change | session | `failed` as `getShowStatus` |
| `reconcileUpNextShows()` | request scoped, React `cache()`, same file | none | `void`; runs before `getUpNextShows` | session | none surfaced (AC-12) |
| `getSystemShows()` | request scoped read | none | `TrackingRead<{ showId, status }[]>` of your `watching` and `completed` rows with source `system` | session | `failed` (the check is skipped) |
| `setEpisodeWatched`, `setEpisodeRating`, `setSeasonWatched`, `undoSeasonWatched` (changed) | Server Actions, `app/shows/actions.ts` | unchanged | `MarkEpisodeWatchedResult`, `EpisodeTrackingResult` and `SeasonWatchedResult` (`lib/tracking/types.ts`) gain `showCompleted: boolean`; `withShowStarted` is renamed `withShowFlags`, the helper that fills both `showStarted` and `showCompleted` | `requireUser()` | unchanged; the check never turns a successful write into an error |
| `getShowEpisodes` (changed) | TMDB read, `lib/tmdb/reads.ts` | unchanged | `ShowEpisodes` plus `showStatus`, copied by `fetchShowEpisodes` from its `readTvShow` result (`TvShow.status`, which the normaliser passes through, `""` when missing) | none | unchanged |
| log registry (changed) | `lib/tracking/log.ts` | n/a | `TRACKING_EVENT.autoComplete = "show_tracking.auto_complete"`; `TrackingOutcome` gains `incomplete` (the read had a failed season); TMDB failures log as `tmdb_unavailable`, Postgres ones as `db_error` or `forbidden` | n/a | n/a |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| verdict | TMDB show status | `getShowEpisodes(id).showStatus`, same `fetchTvShow` read as the seasons |
| verdict | eligible episodes and their ids | `getShowEpisodes(id).episodes` filtered by `showProgress`'s rule (season ≥ 1, `airStatus` aired) |
| verdict | read is whole | `getShowEpisodes(id).complete` |
| verdict | watched ids | `getWatchedEpisodeIds(showIdsKey([...]))`, one batched read for the page |
| verdict | today | `requestTodayUtc()`, once per request, outside any cache |
| verdict | current status and source | the `user_show_state` row: `getShowStatus` on the show page, `getSystemShows` on `/upcoming`, a fresh select in the action after its write |
| verdict | `newlyWatchedRegular` | `newly_marked` from `mark_episode_watched` or `rate_episode` with the action's validated `seasonNumber >= 1`; `cardinality(marked_ids) > 0` from `mark_season_watched` with `seasonNumber >= 1`; always false for the restore branch of `undoSeasonWatched` |
| write check gate | whether to read TMDB at all | the row's `status` (one select after the write), then `getTvShow(id).status` through `isFinishedShowStatus` |
| `complete_show_automatically` | `p_episode_ids` | the verdict's `episodeIds`, the eligible ids of the same read |
| `complete_show_automatically` | `p_allow_user_source` | `trigger.kind === "write" && newlyWatchedRegular` |
| every write | `user_id`, `status_source` | `auth.uid()`, and `'system'` fixed in the function body, never an argument |
| trigger | which show and user | `old.show_id`, `old.user_id` |
| toasts | show name | the name the card, season page or season store already renders (spec 0013, 0014) |
| toasts | "completed" flag | `showCompleted` on the action result |
| Up Next focus after a completed card leaves | target | captured from the page before the action runs: the neighbouring list item's `a[id^="up-next-"]`, else `UP_NEXT_HEADING_ID` |
| pill and progress line | status after the check | `getReconciledShowStatus`; on `/shows/{id}` every reader of this show's status goes through it (the grids there read other shows' statuses, which the check never touches) |
| AC-19 pin | whether the current item sends a write | `state.source` from `getShowStatus`, already passed to `ShowStatusControl` |

**Key invariants**:
- `completed` with source `system` is written only by `complete_show_automatically`; `watching` with source `system` is written only by `start_watching_show`, `reopen_show_automatically` and the reopen trigger.
- A completion is stored only when the database itself confirmed every eligible id watched in the same statement.
- No incomplete or failed TMDB read ever changes a status, in either direction.
- A visit never changes a row whose source is `user`.
- No automatic path touches `user_episode_state`; the trigger only reads `old`.
- Nothing derived is stored: no progress, no evidence snapshot, no TMDB status.
- Specials never complete, block, or reopen a show.

**Security model**:

Private and owner only (`AGENTS.md` section 11). Both functions are `security invoker` with `set search_path = ''`, use `auth.uid()` as the owner, and get `revoke all ... from public, anon, authenticated` then `grant execute ... to authenticated`. The trigger function is `security invoker` too, so the forced RLS of `user_show_state` applies to whoever made the episode write: a user can only reopen their own show, and a cascade run by the auth admin role matches no row and changes nothing. A user who calls `complete_show_automatically` directly with made up ids can only mark their own Watching show Completed, which `set_show_status` already lets them do; the source then reads `system`, which a later visit may reopen, and that only affects their own row. No link in the app sets `prefetch`, and under `cacheComponents` a default prefetch does not run the session dependent parts, so a prefetch never runs the check; even if one did, writing on a page load is safe to repeat, because each write only moves the caller's own row toward what TMDB and their own history already say. Actions and page checks use the per request server client, never the service role. No personal value enters a `use cache` scope; logs carry an event and an outcome class only. No regulated data.

**Configuration required**: none. No new environment variable, credential, or scheduled job.

**Critical test scenarios**:
- Happy path, write: fixture show with `Ended`, every aired regular episode watched but the last; mark it on Up Next; toast "Marked … · Moved to Completed", card gone, focus on the next card; row is `completed`·`system`, verifies **AC-4**, **AC-5**, **AC-7**
- Happy path, visit: a `watching`·`system` row on a caught up `Ended` show; open `/shows/{id}`; the pill reads Completed; open `/upcoming`, the show is absent, verifies **AC-10**, **AC-11**
- Reopen by unmark: untick one regular episode of that show on the season page; row is `watching`·`system`; `/upcoming` lists it with that episode; untick a special instead and nothing changes, verifies **AC-8**
- Reopen by new episode: an automatic Completed show whose fixture gains a newly aired regular episode (or whose status becomes `Returning Series`); open `/upcoming`; it is listed first, verifies **AC-10**, **AC-11**
- Partial fetch: block one season's TMDB read; no visit or write completes or reopens anything, and no error shows, verifies **AC-2**, **AC-6**, **AC-12**
- Manual choices: On Hold, Dropped, Completed·user and a Watching·user on a caught up `Ended` show survive visits unchanged; choosing Watching after an automatic completion is not undone by a reload, verifies **AC-14**
- Episode rows: every path leaves watched dates and ratings identical, verifies **AC-15**
- Auth: user B calling both functions on user A's show changes nothing; `anon` gets permission denied; a user delete cascades cleanly, verifies **AC-9**, **AC-17**

## Build plan

Tracer Bullet: the first task is one thin real thread, a finale mark completing a show from the database to the screen, then each strand thickens it end to end.

1. The thin thread: `showStatus` on `ShowEpisodes` (`lib/tmdb/types.ts`, `show-episodes.ts`, and the fixtures and tests that build it, `batch.test.ts` among them); `isFinishedShowStatus` and `completionVerdict` in `lib/tv/auto-completion.ts` with unit tests for every table row; one migration for `complete_show_automatically` (with its `for share` read and grants) and for `rate_episode` recreated with `newly_marked` (and `05-functions.sql`), so the types regenerate once; pgTAP in a new `130-automatic-completion.test.sql` for its guards (still Watching, source rule, distinct and foreign ids, id limits, no row, episode rows unchanged, a second call writing nothing) and `080` updated for the new `rate_episode` column; `applyAutoCompletion` with the gated `write` check wired into `setEpisodeWatched`; `showCompleted` on the result types; the Up Next combined toast; verified in the running app, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-15**, **AC-16**
2. The write strand: the check in `setEpisodeRating`, `setSeasonWatched` and the restore branch of `undoSeasonWatched` (always `newlyWatchedRegular = false`); the season and single tick toasts and the "completed wins" rule in the season store; the log registry entries and failure handling; `UP_NEXT_HEADING_ID` and the focus target captured before the Up Next call, with a jsdom test, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**
3. The reopen strand: migration for `reopen_completed_show` and its two triggers with their `when` clauses (and `03-triggers.sql`); pgTAP in `130` for update, delete, specials, `completed`·`user`, a rating clear, a many episode season unmark, the `auth.users` cascade in both orders, and the `restore_show_status` window case; the Undo paths checked in the running app, satisfies **AC-8**, **AC-9**, **AC-15**
4. The visit strand: migration for `reopen_show_automatically`; `getSystemShows`, `getReconciledShowStatus` used by `ShowStatusSlot` and `ShowProgressSlot`; `reconcileUpNextShows` as the first await before `getUpNextShows`, settled per show; `request-scope.test.ts` updated; failure handling, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-16**
5. The pin and guard strand: `set_show_status` changed for AC-19 (and `05-functions.sql`), `090` updated; `ShowStatusControl` sending the current item for a `system` source, with its test; pgTAP and unit tests for the whole status matrix, manual Watching after an automatic completion, and cross user and `anon` calls (`030` extended), satisfies **AC-14**, **AC-17**, **AC-19**
6. Proof: 375px and keyboard passes on the new toasts and the focus move; the two browser idempotence step; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm build`; the cold and warm `/upcoming` timings of AC-18; `verify.md`, satisfies **AC-16**, **AC-18**

## Consequences

**Positive**:
- Up Next stops carrying finished shows, and a revived or continued show comes back on its own, with no job, key, or new table to run.
- A partial TMDB read can never finish or reopen a show, and the database itself confirms "every eligible episode watched" before it stores a completion.
- The unmark path is atomic and covers every current and future way of clearing a watched mark.
- The rule is one pure function that tests fully without a network.

**Negative / tradeoffs**:
- A change you never visit waits: a show that ends, or gains episodes, while you stay away from the show page and `/upcoming` keeps its old status until you come back. `/watchlist` can show an ended, caught up show as "Up to date" until then.
- A show you set to Watching by hand stays Watching when it ends while you are already caught up; only your own finishing write, or the pill, completes it.
- The show page status pill now waits for the TMDB episode read when your row was set by the system. This narrows spec 0013 AC-11 ("its read does not wait on the progress read") to rows with source `user`.
- The Up Next list waits for every system row's TMDB read before it renders. Most are cache hits; a heavy user on a cold cache waits longer (AC-18 measures it).
- A server render now writes. It is idempotent and only ever moves your own row toward the truth, but it is a new pattern in this codebase.
- The TMDB cache is `hours`, so a completion can land on a list that is up to a few hours old; a newly listed episode then reopens it on a later visit.
- When your own finale mark completes a Watching you picked by hand, the Undo reopens it as `watching`·`system`, so your manual choice becomes an automatic one. Pick Watching again from the pill (AC-19) to make it yours.
- A completion or reopen bumps the row's `updated_at`, so an open status Undo (spec 0013's 10 minute window in `restore_show_status`) on that show can then refuse as `undo_expired`, and a reopen can lengthen a stale one. pgTAP pins the first case.
- A reopened show deliberately outranks shows you watched more recently in the Up Next order, since its `status_changed_at` is now.

**Neutral**:
- A reopened show jumps to the top of `/watchlist` and of Up Next, through the existing `listed_at` and `status_changed_at` triggers.
- Shows longer than 20000 aired episodes never complete automatically.
- `rate_episode` is dropped and created again for its new column; the app and the generated types move with it.

### Changes to earlier specs

- Spec 0013 AC-2, last sentence: replaced by AC-19 (choosing the current status pins a `system` status as `user`).
- Spec 0013 AC-11: the pill's read now waits on the TMDB episode read when the row's source is `system`.
- Spec 0014 AC-10 and its invariant "Marking from Up Next never changes a status": a mark may now complete the show (AC-4, AC-5).
- Spec 0014 AC-16: after a mark that completes a show, focus goes to the neighbouring card or the heading (AC-7); after its Undo the card returns first in the list, not in its old place.

## Follow-up

- [ ] `/sync` should flag the four earlier spec lines listed under *Changes to earlier specs*.
- [ ] If "a change you never visit waits" proves a real complaint, a scheduled job is the next step; it would need a server side elevated role and its own spec.
