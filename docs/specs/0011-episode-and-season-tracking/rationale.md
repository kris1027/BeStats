# 0011. Episode and season tracking: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Scope feature 12 is the first TV write path. A signed in user needs to mark episodes watched, rate them 1 to 10, and mark a whole season watched, on the season pages spec 0009 built with empty `tracking` places in the header and each episode row. The table already exists: spec 0001 created `user_episode_state` with one row per user and episode, rating bounds, forced Row Level Security (database rules that limit each person to their own rows), and a partial write rule so a column not being changed is left out of the write entirely.

`AGENTS.md` sets hard rules. Watched state and rating are separate, and removing one never deletes the other. Marking a season watched covers only episodes that have already aired, never future or unknown date episodes, must be idempotent (safe to repeat with the same result), and must keep ratings. Specials (season 0) can be tracked and rated but stay out of overall progress and ratings. TV status and episode history are separate, and the air date boundary must be written down.

The forces pulling on the design: TMDB gives air dates with no time and no timezone, and the season read is cached for hours, so "has it aired" cannot be answered inside the cache. A season can hold hundreds of episodes, so a bulk write has to be one statement and a page read has to be one query. Two tabs or a double click must not move a first watched date or duplicate a row, which rules out read then write sequences in the application. The season page is a public, partially prerendered route whose purity is guarded by a test, so private state has to stream in without touching the catalog. And a bulk action with no undo turns a misclick into twenty manual fixes.

Leaving this undecided means `/develop` would pick the boundary, the unknown date handling, and the bulk write shape on the fly, and features 14 to 16 (progress, Up Next, automatic completion) would each inherit whichever guess landed first.

## Options considered

### Option 1: Plain PostgREST writes from Server Actions

Actions validate and write with ordinary `upsert` and `update` calls. Keeping the first watched date is done by reading the row first and choosing the payload; mark season sends one array upsert with `ignoreDuplicates`; unmark season reads the watched rows, then updates them.

**Pros**:
- No new database functions, so no grants to carry into migrations by hand.
- Every rule reads as TypeScript in one file.

**Cons**:
- Read then write races between two tabs: a stale tab can overwrite a first watched date.
- `ignoreDuplicates` skips existing rows entirely, so an episode that was rated then unwatched would never be marked by the season action.
- Unmark season cannot report the dates it cleared in one statement, so Undo would rest on a separate, racy read.

### Option 2: Server Actions, invoker functions for conditional writes, and a season scoped optimistic store (chosen)

The spec 0007 pattern extended: actions validate, authenticate, confirm with TMDB, apply the pure air status rule, and call small `SECURITY INVOKER` functions for every write whose result depends on the current row. A client store wrapping the season page queues optimistic intents so the header and every row move together.

**Pros**:
- Each conditional write is one atomic statement, so races and double clicks settle correctly.
- The bulk functions report exactly what they changed, which is what makes a precise Undo possible.
- Reuses the actions, result union, error mapping, toasts, pills and picker movies already use.

**Cons**:
- Five functions, each needing grants written by hand into its migration.
- The optimistic reducer must mirror the SQL exactly, a second place to keep in sync (held by shared test cases).

### Option 3: Push eligibility and bulk logic fully into Postgres

The action sends only the show and season; a function receives the TMDB episode list with air dates as JSON and decides eligibility with `current_date` in SQL.

**Pros**:
- The aired rule and the write sit in one transaction.

**Cons**:
- The air status rule then lives in SQL, where features 14 to 16 (which render progress and Up Next in TypeScript) cannot share it, so the rule would exist twice.
- The function would trust client or server supplied air dates as data, giving no real extra safety over the action.
- Harder to unit test at the date boundary than a pure function.

## Rationale

Option 2 is the one that holds the `AGENTS.md` rules under real conditions. The rules that break under load are the conditional ones: keep the first watched date, never mark twice, report what changed so Undo is exact. Those need the row's current value inside the same statement, which only a database function gives you without a race. Option 1 is simpler on day one but fails the exact cases the scope's "done when" names (idempotent season marking, ratings preserved) as soon as a second tab or an unwatched rated episode appears.

The air status rule stays in TypeScript, in one pure module, because it has more readers than writers: the page, three actions, and later progress, Up Next and automatic completion all need it. Keeping it out of the `use cache` scope is the key point, since the season read is cached for hours while "today" changes daily. UTC was chosen over the user's local date because it needs no timezone source and no fallback path; its worst case is a few hours of early or late availability around a premiere, which is cheap to revisit later by changing `todayUtc` alone. Episodes with no date stay markable one at a time because older shows and specials often lack TMDB dates, and blocking them would make real history impossible to record, while the season action and the count stay strictly aired only, as `AGENTS.md` requires.

The Undo design follows spec 0008: the only client supplied timestamp is bounded in SQL (still unwatched, recent, not in the future) and can only restore the caller's own earlier value. The unmark path takes the ids the page rendered rather than asking TMDB, so it keeps working during an outage, and it is safe because unmarking your own episodes is always allowed. TV status stays out of this feature on purpose, so feature 14 designs the status machine whole rather than inheriting a piece of it.
