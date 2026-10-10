# 0020. Rationale

## Context

Specs 0013, 0014, 0015 and 0019 tie each library page to a stored status:
- **Watchlist** is Want to Watch plus Watching.
- **Upcoming** is the Up Next card of every Watching show.
- **Watched** is Completed.

The status is set by hand, by an episode write (Want to Watch becomes Watching), or by the automatic completion check that runs when you open a show or `/upcoming`.

That model asks the user to keep a label in step with facts the app already knows. A show you are caught up on still sits on Watchlist as Watching, and its Up Next card says "You're up to date". A show waiting on an undated new season can only reach Watched if TMDB calls it Ended. A show with a dated next episode looks no different from one with aired episodes waiting. The owner wants the page to say where you are with a show: something to watch now, something to wait for, or something done for now.

The forces:
- TMDB metadata is never stored in Postgres (spec 0008, kept since).
- The pages promise exact counts and stable pagination (spec 0008, AC-3 of 0019).
- The cold read of every season for 20 Watching shows took about 17 s in spec 0014's verify.
- The production app reads `status` directly, so a schema change needs a safe rollout.
- Status and episode history must stay separate (`AGENTS.md` section 7). Ratings and specials rules do not change.

## Options considered

### Option 1: Keep statuses, set them automatically

Redefine the statuses to match the three pages and let the system move them on episode writes and page visits, as automatic completion does today.

**Pros**:
- Pages stay a single indexed query with an exact count, with no TMDB fan out.
- Smallest change to views and tests.

**Cons**:
- Status changes when a date appears or an episode airs, with no user action, so it needs page load writes or a scheduled job (an elevated role nothing else uses). It is stale until one of them runs.
- It keeps the hardest machinery in the codebase (pins, reopen guards, `status_source`), which is the thing being removed.

### Option 2: Classify per request from the TMDB show details read (chosen)

Store only tracked and an optional hold. On each request, read each title's cached TMDB details (one call per show; `last_episode_to_air`, `next_episode_to_air` and the season episode counts) and classify in a pure function.

**Pros**:
- Never stale beyond the `hours` cache. No writes on load, and no scheduler.
- One call per title, not 1 plus N seasons, so the cold cost is bounded and much lower than Up Next's.
- The classifier is pure and table testable.

**Cons**:
- Counts and pages need every title's read first, so a cold large library is slow. That's bounded by the 500 ceiling.
- It relies on TMDB's contiguous episode numbering and on `last_episode_to_air` being current.

### Option 3: Classify per request from full season reads

Reuse `upNextState` over `getShowEpisodes` for every title.

**Pros**:
- Exact per episode air dates, including episodes with unknown dates in the middle of a season.

**Cons**:
- 1 plus N TMDB reads per show, measured at about 17 s cold for 20 shows. The page cannot paginate until all of them finish.

### Option 4: Store the classified page in Postgres

Persist the page per title, refreshed on writes and visits.

**Pros**:
- Fast indexed reads with exact counts.

**Cons**:
- It goes stale between visits, needs writes on page load or a scheduler, and stores data derived from catalog metadata, against spec 0008's choice.

## Rationale

The owner's goal is that pages reflect reality without upkeep. Only Options 2 and 3 meet that without page load writes or a scheduler, which `AGENTS.md` and the deferred list treat as a cost to avoid. Between them, the details read gives the same answer for every show TMDB numbers normally, at a fraction of the cold cost. The edge it misses (an unknown dated episode mid season) is rare, and errs toward showing the show on Watchlist, where the user can see the next episode. The Watchlist card still streams the exact episode name per card, as Up Next does today.

Pause and Drop survive because they are the one thing progress cannot express: a decision to stop. Everything else the statuses said (planned, watching, completed) is visible in the episode history. Keeping a single `hold_state` column with an expected value check reuses the concurrency pattern of `set_show_status`, so a stale tab cannot silently overwrite a newer choice.

The rollout uses expand then contract, because production reads `status` today. Making `status` nullable with a default lets the old app keep inserting during the deploy window, and dropping it only after the new app is verified keeps rollback a one click Vercel revert.

### Recommended calls made at write time

- **Paused & dropped on page 1 only**: keeps the paginated grid honest, and the section is secondary. Runner up: below every page.
- **Not found titles at the end of Watchlist**: gives the user a place to clear them. Runner up: count them in the failure note, which would hide a permanent condition behind Retry.
- **Upcoming tie break by `tracked_at`**: newest plans first among equal dates. Runner up: alphabetical.
- **The episode write toast "{Show} added to your shows"**: replaces "moved to Watching", which names a status that no longer exists.
- **Separate PR for the contract migration**: makes the rollback window explicit. Runner up: one PR with both migrations, which loses the safe revert.

## Amendment 2026-10-10: Pause and Drop removed

Settled in a grilling session on 2026-10-10. The owner wants one way off the pages, Stop tracking, and no parked state.

- **Existing holds are cleared, not untracked.** Every paused or dropped show becomes an ordinary tracked show and lands on the page its progress gives it. Runner up: untrack dropped shows, which would have read Drop as Stop tracking; rejected so no user loses a tracked show without choosing it.
- **The hold removal rides in the contract migration.** Both delete the same legacy mirror (`legacy_status_for_hold`, the rollback path), so a separate hold expand and contract would write a rollback safe `set_show_hold` only to drop it. The cost is a few minutes between `db push` and the Vercel deploy where the live app calls functions that no longer exist, accepted at the current user count; rollback after that is a forward fix.
- **The show page control becomes a toggle.** A menu with only Stop tracking is an extra click for nothing; the Undo toast covers a mistaken click, and the card bookmark already behaves this way. The tracked state is named "Stop tracking {title}", the action a click takes, as the card bookmark is. The grilling session agreed `aria-pressed` too, on the belief that the bookmark used it; it does not, and a pressed toggle whose name is an action reads as a contradiction, so the build kept the bookmark's pattern.
- **Stop tracking loses its stale guard.** With only tracked and untracked, deleting a row that is already gone is harmless, so `untrack_show` drops `p_expected` and becomes idempotent. A stop and retrack in another tab followed by a stop from a stale tab is rare, and Undo repairs it.
- **Specs are amended in place, not superseded.** 0020 is still in progress, so its ACs, data model, build plan and migration plan carry the change with a dated note; earlier specs and reviews stay as history.

## Amendment 2026-10-10: next episode after the furthest watched

Settled in a grilling session on 2026-10-10. The owner marked S1E2 of a show and the Watchlist card offered S1E1; the card should offer the episode after the one marked.

- **The anchor is the furthest watched episode, not the latest marked one.** It is the highest season and episode watched, so the classifier stays a pure function of (TMDB details, watched set, today) and reads no timestamps. Marking an earlier episode afterwards changes nothing. Runner up: the most recently marked episode, rejected because going back to mark S1E1 would point the card at S1E2, already watched, and the page would depend on click order.
- **Gaps are left alone.** Unwatched episodes before the furthest one stay unwatched, are never offered and do not keep a show on Watchlist, so a show with only gaps behind it is caught up (Upcoming or Watched). Runner up: ask "Also mark the earlier episodes watched?" when a mark skips some, as TV Time does; deferred as a separate feature.
- **Progress is unchanged.** It counts only watched episodes, so a gap shows as 9 of 10 while the show sits on Watched; the page says where you are, progress says what you watched.
- **One rule on every path.** The branch for a special as `last_episode_to_air` with undated seasons uses the same anchor, and a furthest watched episode past the last aired one (an undated episode marked by hand) is caught up.
