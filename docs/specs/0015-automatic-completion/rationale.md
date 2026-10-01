# 0015. Automatic completion: rationale

Decision record for [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

`AGENTS.md` section 9 allows one automatic move to Completed and hedges it heavily: only when TMDB identifies the show as ended or canceled and the user has watched every aired regular episode; only on complete episode metadata, never a partial fetch; ongoing shows stay Watching when caught up; intentional On Hold, Dropped and "manually selected statuses" survive metadata refreshes; and the automatic completion must be reversible when its condition changes. Section 8 asks the stored status to say whether it was a manual choice or an automatic one, which spec 0001 answered with `status_source` (`user` or `system`). Spec 0013 built the automatic Watching move inside the episode SQL functions and left completion to this feature; spec 0014 filters Up Next to Watching only, so completion is also how finished shows leave the queue.

The hard force is that the condition can change with nobody acting. A show you are caught up on can be marked Ended by TMDB next month. An ended show can get a new season, or a revival can flip it back to Returning Series. Neither event is a write in BeStats, so a rule that only runs inside episode writes cannot meet the scope's "reverts when new episodes appear". At the same time, the database cannot decide the rule alone: it holds no TMDB status and no air dates (spec 0008 keeps catalog data out of Postgres), so the verdict needs a server that can read TMDB.

Other forces: a background process over all users would need a role that bypasses row level security, which `AGENTS.md` section 5 keeps away from ordinary user operations and which this project has so far avoided entirely. TMDB reads are cached publicly for `hours`, cost a fan out across seasons on a cold cache, and can fail per season, which `getShowEpisodes` reports as `complete: false`. The Up Next page and the show page already read exactly the data the rule needs. Races are real: two tabs, a stale card, and an unmark landing between a verdict and its write.

Without a decision, Up Next keeps finished shows forever with "You're up to date", the Completed status is only ever manual, and section 13 acceptance item 10 stays unmet.

## Options considered

### Option 1: Check on writes and on visits, visits touching only system rows (chosen)

The Server Actions run the rule right after a successful episode write. The show page and `/upcoming` run it before they render, but only for rows with source `system`. Completion goes through a guarded invoker SQL function that confirms every eligible id is watched; reopening on unmark is a trigger in the same transaction as the unmark.

**Pros**:
- Catches both "the show ended" and "new episodes appeared" whenever you look, with no job, key, or new infrastructure.
- Every write is the user's own, under their session and row level security.
- Visits leave manual choices alone, the literal section 9 wording, and the check is free for rows with source `user`.
- The unmark path is atomic and cannot be skipped by any client path.

**Cons**:
- A change you never visit waits for your next visit.
- A server render now performs a write, a new pattern here, and the status pill and the Up Next list wait on TMDB for system rows.
- A Watching you chose by hand is never completed by a visit alone.

### Option 2: Check on writes only

Run the rule only after episode writes, and reopen only on unmark.

**Pros**:
- Smallest change; no render ever writes; nothing waits on TMDB at read time.

**Cons**:
- Misses a show ending while you are caught up, and misses new episodes after completion entirely, so it fails the scope's own "reverts when new episodes appear" and section 9's reversibility.

### Option 3: Writes plus a scheduled job

A daily Vercel Cron job (the plan's cron runs once a day) with the service role key walks every user's Watching and automatic Completed shows and applies the rule.

**Pros**:
- Correct without any visit; pages stay read only and never wait.

**Cons**:
- Introduces an elevated key that bypasses row level security and writes across users, a new secret, a new failure surface to monitor, and TMDB traffic proportional to all users' shows rather than to active ones.
- Still up to a day late, so the pages would want a visit check anyway.

### Option 4: Derive Completed at read time, never store it

Keep the stored status as Watching and display Completed whenever the rule holds.

**Pros**:
- Nothing to keep in sync; it can never be stale.

**Cons**:
- Every list that filters by status in SQL (the Up Next view, the watchlist view) would need TMDB data it does not have, so both views break or every list fans out to TMDB.
- The stored status and the shown status disagree, which section 8's single status per show forbids in spirit, and a manual Completed and a derived one become indistinguishable.

## Rationale

Option 1 is the only one that satisfies both halves of the section 9 rule, completion when the show ends and reversal when it changes, without adding a role that bypasses row level security. The visit check sits on pages that already fetch the same TMDB data (`getShowEpisodes` for every Up Next card and for the show page's progress line), so its marginal cost is mostly cache hits. Limiting visits to rows the system set is what makes it safe to run on every load: a visit is a "metadata refresh" in section 9's sense, and it must preserve manually selected statuses. A write is different, it is you watching the finale, so it may complete a Watching you picked by hand.

Two guards carry the "never on partial data" rule. The pure verdict answers `none` for any incomplete or failed read, in both directions. And `complete_show_automatically` takes the eligible ids from the same read and checks, in its own statement, that every one is watched. It reads those rows `for share`, because under Postgres's default isolation (read committed) a plain read would miss an unmark still in flight, while that unmark's trigger would still see Watching and do nothing, and both would commit a wrong Completed. With the shared lock, the completion waits for the unmark to finish and then sees it. The reopen direction needs no such guard: a wrong reopen only puts a show back to Watching, and the next check completes it again.

The reopen on unmark is a trigger, not a change to each unmark path, because two of the three unmark paths today are plain table updates (the single untick and the Up Next Undo), and row level security lets any client make such an update. A trigger runs for all of them, now and later, inside the same transaction. It uses `old.user_id` rather than `auth.uid()` and runs as the invoker, so a cascade from an account deletion matches nothing. It deliberately catches no error: a real failure should fail the unmark visibly rather than leave a finished status on an unfinished show, and pgTAP proves the cascade in both orders instead.

The engineer's calls, recorded: the combined toast on surfaces that already have an Undo reverses the mark, and the status follows through the reopen trigger, so one Undo undoes both; surfaces without an Undo get a plain "moved to Completed" toast, like the existing "moved to Watching"; visits announce nothing, since the pill and the list speak for themselves; `/watchlist` never runs the check, to keep its paginated, exactly counted list stable during a visit; `/upcoming` checks every system row with no cap, and its list waits for the check so its empty state is always true. After the cross check, the engineer also chose that picking the status a show already has turns a `system` status into a `user` one (AC-19), changing spec 0013 AC-2, because otherwise there is no way to keep a finished show closed when a new episode airs.

Decisions made in the spec with full context (pick, then runner up):
- **`showStatus` rides on `ShowEpisodes`**, from the same `fetchTvShow` read that lists the seasons, so status and episodes share one snapshot. Runner up: a separate `getTvShow` call, whose cache entry can expire apart from the episode list.
- **Only exactly `Ended` and `Canceled` count as finished.** An unknown or empty value is treated as ongoing, the safe side, since being wrongly ongoing only delays a completion. Runner up: also accepting `Cancelled`, which TMDB does not use.
- **`complete_show_automatically` takes the eligible ids and verifies them**, capped at 20000. Runner up: a bare status flip, which leaves the verdict to write race open.
- **`rate_episode` gains `newly_marked`**, the same signal `mark_episode_watched` got in spec 0014, so a rating that first marks the finale can complete a Watching you picked by hand. Runner up: treating any successful rating as a new watch, which would let rating an old episode complete a show you deliberately kept Watching.
- **The page check runs inside request scoped `cache()` functions** (`getReconciledShowStatus`, `reconcileUpNextShows`), so the status pill and the progress line share one check per request. Runner up: `after()`, which runs after the response and leaves the visit showing the old status.
- **Focus after a completed Up Next card leaves** goes to the next card, else the previous, else the heading, the same rule as Coming soon's removal in spec 0014. Runner up: the heading always, which loses your place in a long list.
- **Log event** `show_tracking.auto_complete` with an outcome class only, through `logTrackingEvent`. Runner up: no logging, which hides a broken grant.
- **The warm budget of AC-18 is 500 ms** over the same user with no system rows. Runner up: recording only, which gives `/check verify` nothing to fail on.
- **The write check is gated**: a status select, then the cached show read, and only for a Watching show TMDB calls finished does it read every season. Runner up: always reading the whole episode list, which puts a season fan out behind every tick on the Up Next hot path.
