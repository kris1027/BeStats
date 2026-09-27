# 0013. TV status and progress: decision record

Build spec: [index.md](index.md).

## Context

Spec 0001 created `user_show_state` with one `status`, a `status_source` that tells a deliberate choice from an automatic one, and `status_changed_at`, but nothing writes it yet. Episodes and seasons can be marked and rated (spec 0011) and averaged (spec 0012), yet a show has no status, the hero place spec 0009 reserved for a status control is empty, the user has no idea how far through a show they are, and `/watchlist` holds only movies while the artboard draws show cards beside them.

`AGENTS.md` sets hard rules. Want to Watch is the TV watchlist state, with no second flag. Status and episode history are separate: a status change must keep every watched episode and rating. Watching an episode may move a new or Want to Watch show to Watching, but must not silently resume an On Hold or Dropped one. Progress counts aired regular episodes only; specials, unaired and undated episodes leave the total, and a zero total needs an empty state, not a division or an automatic completion. The air date boundary must be documented; spec 0011 already fixed it as the UTC calendar date, with `lib/tv/air-status.ts` as its only home.

Three forces pull against each other. Correctness under concurrency: an episode write and a status move made as two calls can race between tabs or half fail. Truthful lists: the watchlist must page and count exactly across two tables. Cost: progress and the Next episode pill need every regular season of a show from TMDB, which is many requests for a long show, and spec 0008 ruled out caching TMDB metadata in Postgres.

Leaving this open means `/develop` would choose where the automatic move lives, how movies and shows share one order, and what "watched" counts, and features 15 and 16 (Up Next, automatic completion) would inherit whichever guess landed first.

## Options considered

### Option 1: SQL functions for every status write, the automatic move inside the episode functions, pure TypeScript progress, a view for the watchlist

Status writes go through three security invoker functions that return the previous values for Undo. The three episode write functions call a small helper that starts the show in the same statement. Progress and the next episode are a pure function over `getShowEpisodes` and the user's watched ids, computed per request. `/watchlist` reads a `security_invoker` view that unions planned movies with Want to Watch and Watching shows.

**Pros**:
- The automatic move and the episode write commit or fail together; two tabs cannot race.
- Undo gets exact previous values without a separate read.
- One pure progress rule, directly testable and reusable by features 15 and 16.
- The watchlist stays one ordered, paged, exactly counted query, as spec 0008 built it.

**Cons**:
- Changing the episode functions' return shapes forces a drop and recreate and a coordinated types update.
- More SQL to grant and pgTAP test than plain upserts.

### Option 2: Plain PostgREST upserts and deletes from Server Actions, automatic move as a second call

The action writes the episode, then upserts the status when the pre read showed none or Want to Watch. Status changes are plain upserts; Undo reads the row first.

**Pros**:
- Least SQL; the logic reads top to bottom in one TypeScript file.
- No change to the existing episode functions.

**Cons**:
- Read then write races between tabs: a stale tab can move a show a user just put On Hold back to Watching, which `AGENTS.md` forbids.
- A failure between the two calls leaves an episode watched and the status unchanged, with no rollback.
- Undo depends on a read taken before the write, which can already be stale.

### Option 3: A database trigger on `user_episode_state` for the automatic move

An `after insert or update` trigger on episode rows starts the show whenever a regular episode becomes watched.

**Pros**:
- Every current and future episode write path gets the rule for free.
- No change to function return shapes.

**Cons**:
- The caller cannot learn that the show started, so the "moved to Watching" toast needs another read.
- Restore paths (`restore_episodes_watched`) would also start shows unless the trigger inspects session settings, which is hidden coupling.
- Triggers that write other tables are the hardest behaviour to find when debugging.

### Option 4: Merge the watchlist in TypeScript instead of a view

Read planned movies and listed shows separately and merge by time in the action.

**Pros**:
- No database object added; the two existing reads stay as they are.

**Cons**:
- An exact page 5 needs the first 100 of both lists; the cost grows with the library and the count is only correct if both lists are fully read.

### Sub decision: what "watched" counts

Count only watched episodes that are also in the eligible set, matched by TMDB episode id. The runner up, counting every watched regular episode by stored season number, can show 41 of 40 when an episode's date moves into the future or TMDB renumbers, and would let progress reach 100% early.

### Sub decision: the hero menu component

Base UI's Menu through the shadcn base-nova `dropdown-menu`, because a status is a single choice and Menu gives `menuitemradio`, arrow key movement and focus return for free. The runner up, reusing the existing `Popover` with a radio list like `ScorePicker`, avoids a new component but needs the keyboard model hand built.

### Sub decision: the order key for shows on the watchlist

A trigger owned `listed_at`, the show counterpart of spec 0008's `watchlisted_at`, set on entering Want to Watch or Watching and kept between them. The runner up, `status_changed_at`, needs no schema change but would jump a show to the top the moment its first episode is watched.

### Sub decision: the watchlist query plan (added 2026-09-27)

The first draft of build plan step 6 expected both partial indexes to feed an index ordered merge with no sort. The recorded `explain analyze` (in `verify.md`, 300 movie rows and 300 show rows for one user, page 2) showed otherwise: a seq scan or bitmap index scan per half, a `WindowAgg` for the exact count, then a top N heapsort of 27 kB, 0.37 ms in total. The planner cannot merge the union in index order because the constant `kind` column breaks the shared sort key, and the exact count must visit every listed row of the user anyway, so the "no sort" goal could never hold together with AC-13's exact count.

The engineer accepted the plan as it is. What matters is that the work is bounded by one user's listed rows, never by the size of either table, and that the planner is free to choose a seq scan when it is cheaper. The bound comes from the explicit `.eq("user_id", userId)` filter in `lib/tracking/library-lists.ts`; row level security is the second guard, not the mechanism the plan relies on.

The ceiling is 50 ms at 1,000 listed entries for one user. It is a loose sanity limit, about a hundred times the measured trend, not a tight regression guard. It is not measured yet; the next `/check verify` measures it under the same conditions as the 350 entry run, so the two numbers compare: the page query from `getWatchlistPage` in `lib/tracking/library-lists.ts` with its exact count, run as `authenticated` for the seeded user on the local Docker stack (`pnpm dev:docker`), page 2, with a warm cache (the median of three runs after one discarded run). The runner up, paging each half with its own index ordered `LIMIT offset + 20`, merging in SQL and counting separately, matches the old wording but adds a function and more code for no measurable gain at this size.

## Decision

Option 1, with the watched count restricted to eligible episodes, Base UI Menu for the hero, and `listed_at` as the show order key.

## Rationale

The rule `AGENTS.md` cares most about here is that deliberate choices survive: a show put On Hold must never come back to Watching because an episode was marked in a stale tab. Only a check made in the same statement as the write can promise that, which rules out Option 2. Between the two database placements, the engineer's wish to be told when a show starts decides it: a function can return `show_started`, a trigger cannot, and the function also leaves the restore paths alone without hidden session flags. The price is a one time change of return shapes, paid in one migration with the regenerated types.

Progress stays in TypeScript for the same reason spec 0011 kept the air status rule there: it has more readers than writers (the hero, the watchlist pill, and next Up Next and automatic completion), `today` must never be frozen inside a cache, and TMDB data is not in Postgres to compute over. Matching by episode id rather than stored numbers makes the count immune to TMDB renumbering, and hiding the number on an incomplete read applies the same honesty rule feature 16 needs for completion.

The view keeps spec 0008's strongest property, an exact count from one query, while adding shows. The engineer chose Want to Watch plus Watching on the watchlist because the artboard draws both, and On Hold for Stop watching because a single tap with no confirm should be the gentlest pause; Undo on every card removal, and no confirm on Remove status, follow spec 0008's pattern where a reversible action gets a toast rather than a dialog.
