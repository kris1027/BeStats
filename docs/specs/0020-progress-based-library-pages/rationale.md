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
