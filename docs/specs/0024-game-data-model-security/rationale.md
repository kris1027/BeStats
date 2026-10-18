# 0024. Game data model and security policies: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file says why.

## Context

Games are a third media type next to shows and movies (scope features G1 to G10). G1 gave BeStats a server only IGDB module; nothing yet stores what a user does with a game. Every later games feature (the status control in G4, the library pages in G5, the cards in G8) needs one place for that private state, and needs it to be right before any UI writes to it.

The rules were settled on 2026-10-17. A game has three statuses set by hand (Want to play, Playing, Finished), moving between any two in one click, with removal deleting the row. A personal score from 1 to 10 is allowed only on Playing or Finished, and moving back to Want to play clears it. Three dates drive the library sorts: added, started (the first time a game becomes Playing) and finished (every time it becomes Finished). Unlike shows, nothing is worked out from progress, because a game has no episodes. The release gate (no Playing, Finished or score before release) needs IGDB's date, which the database does not hold.

The forces are the same ones that shaped the movie and show tables. AGENTS.md section 11 makes PostgreSQL and RLS the security boundary, independent of the UI; section 8 asks for explicit constraints and idempotent writes; Supabase's default privileges hand `anon` every new table in `public` unless a migration takes it back. The project has also learned that a client chosen sort date is a bug waiting to happen (`watchlisted_at` and `tracked_at` are trigger owned for that reason), and that Undo needs a narrow, server only way to put old values back.

If this is left loose, G4 would invent the rules in TypeScript, a direct API call could store states the product forbids, and the library sorts would trust dates any client can send.

## Options considered

### Option 1: One table, status enum, checks, trigger owned dates

`user_game_state` with a `game_status` enum column, a nullable score, and three date columns that a trigger owns, with check constraints for the score and status rules and a transaction local escape for Undo.

**Pros**:
- Every invariant the database can know is enforced on every path, including direct API writes.
- The same shape as `user_movie_state`, so the grants, RLS pattern, sweep and tests transfer directly.
- One row per user and game keeps the library reads to one index scan per tab.

**Cons**:
- Only the first start and the latest finish survive; history is lost.
- The trigger is one more piece of hidden behaviour, with an escape that new write paths must not misuse.

### Option 2: Status worked out from the dates

No status column: the game is Finished when `finished_at` is set, Playing when only `started_at` is set, and Want to play otherwise, the way a movie's watched state is its `watched_at`.

**Pros**:
- No status and date can disagree, because there is only the dates.
- No enum to migrate if the statuses ever change.

**Cons**:
- It cannot represent the agreed rules: a replay (Finished back to Playing) keeps `finished_at`, and moving back to Want to play keeps both dates, so the dates alone no longer say the status.
- Every read and index needs a case expression instead of an equality filter.

### Option 3: Current row plus a status history table

The current status table as in Option 1, plus an append only `user_game_events` table recording every status change, from which dates could be read.

**Pros**:
- Full history: replays, finish count and every date stay available.
- Undo could replay the event log instead of a restore escape.

**Cons**:
- Two tables to keep consistent, with a trigger or function writing both on every change.
- A second private table to secure, sweep and test, and to clean up on removal, for a history no feature asks for.
- More moving parts in exactly the GA tier code that has to be right first.

### Option 4: One shared media state table

A single `user_media_state` keyed on `(user_id, media_type, media_id)` for games, and later the others.

**Pros**:
- One place for every kind of title, one set of policies.

**Cons**:
- Games and movies have different rules (statuses vs planned or watched), so most checks become conditional on `media_type`.
- It only pays off if the movie and show tables move too, which is a large rewrite of shipped, tested code for no user gain.

## Rationale

Option 1 is the only one that holds the agreed rules exactly. Option 2 breaks on the two transitions the engineer chose to keep dates for (a replay keeps `finished_at`; back to Want to play keeps both dates), so a status column is not redundant here as it is for movies. Option 3 adds history nobody asked for, at the cost of a second private table in GA tier code; if a finish count or a replay log is ever wanted, an events table can be added beside this one without changing it. Option 4 trades a shipped, proven per media type layout for conditional checks.

The finer calls follow the forces in Context. Trigger owned dates, chosen over dates set by the write functions, keep the library sorts honest on every path, as `watchlisted_at` and `tracked_at` already do. A check constraint for the score rule, chosen over a trigger that clears the score, makes a forgotten clear a visible failed save instead of silent data loss, the movie table's approach. Keeping the started and finished dates on a move back to Want to play preserves the first start the rules define, and resetting `added_at` puts the game at the top of Want to play, where a user expects a game they just moved. The restore escape ships now, so the trigger is written and tested once; G4 only turns it on. The identity pin on `user_id` and `game_id` is cheap and stops an update from moving a row's history onto another game, as `guard_username_change` pins `user_id`. The trigger also owns `created_at` and `updated_at`, unlike the older tables, because G4's Undo window will be measured on `updated_at` and a client must not be able to forge it. No library index ships yet: a tab holds at most 500 games per user, which the primary key prefix scan and an in memory sort serve, the same reasoning that left `user_show_state` with its key alone; G5 adds one if a measured read needs it.

Direct writes stay granted, as for movies. A read only grant would not make the release gate enforceable, because the database still would not know the date, and `security invoker` functions need the write grants anyway; the alternative would be `security definer` functions, which AGENTS.md keeps to one named exception. The accepted gap is a user marking their own unreleased game through a hand made API call, which harms no one else.

The scope boundary keeps G2 to the table, its rules and its security, and leaves the write functions to G4, where the UI that calls them shapes their arguments and error codes. Pushing to the cloud before merge follows the runbook and keeps the cloud schema matching `main`; the table is harmless there until the GAMES tab ships.
