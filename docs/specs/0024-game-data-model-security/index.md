# 0024. Game data model and security policies: one private row per user and game

**Date**: 2026-10-18
**Status**: In Progress

Scope feature: [G2. Game data model and security policies](../../scope/games.md) · GA tier

Builds on: [0023](../0023-igdb-integration-module/index.md) (the IGDB game id and the release date the Server Action gates on). Settled in an `/architect` session on 2026-10-18, on top of the games rules from the 2026-10-17 grilling in [docs/scope/games.md](../../scope/games.md).

## Summary

This adds the one private table every games feature reads and writes: `user_game_state`, one row per user and game, holding its status (Want to play, Playing or Finished), an optional score from 1 to 10, and three dates (added, started, finished). The database itself holds the rules: a score only on Playing or Finished, the dates set by a trigger (a function the database runs on every write) so no client can choose them, and row level security (RLS, the database rule that each row is visible only to its owner) so one user can never reach another's games. G2 ships no write functions and no UI; G4 adds those on top. The migration is pushed to the cloud before the PR merges, and stays unused there until the GAMES tab ships in G5.

## Requirements

**User stories**:
- As a signed in user, I want my games list stored privately so that only I can see or change what I want to play, am playing and have finished.
- As the G4 builder, I want the status, score and date rules held by the database so that every write path, including a direct API call, obeys them.
- As the G4 builder, I want a narrow, server only way to restore a game's dates so that Undo can put a game back exactly as it was.

**Acceptance criteria**:
- **AC-1**: A migration creates the enum `public.game_status` with the values `want_to_play`, `playing`, `finished`, in that order, and the table `public.user_game_state` with exactly the columns in the data model below, primary key `(user_id, game_id)`, `user_id` referencing `auth.users (id) on delete cascade`, and the check `game_id > 0`.
- **AC-2**: `rating` is null or an integer from 1 to 10, and a non null `rating` needs `status` to be `playing` or `finished`. A write that leaves a score on a `want_to_play` row is refused with a check violation (`23514`); nothing clears the score silently, so the write that moves a game to Want to play must null it in the same statement.
- **AC-3**: A `playing` row always has a `started_at`, and a `finished_at` is required on a `finished` row (check constraints). There is no ordering check between `started_at` and `finished_at`: a game set straight to Finished and later replayed has a start after its finish.
- **AC-4**: On insert, the trigger sets `created_at`, `updated_at` and `added_at` to now, `started_at` to now when the status is `playing` and null otherwise, and `finished_at` to now when the status is `finished` and null otherwise, whatever values the client sent for those five columns.
- **AC-5**: On update, whatever the client sent for the dates, `created_at` keeps its stored value and `updated_at` becomes now (`set_updated_at`); and for the other three, where "kept" always means the stored value (`new.x := old.x`), never a value the client sent: a move to `want_to_play` from another status sets `added_at` to now and keeps `started_at` and `finished_at`; a status that becomes `playing` sets `started_at` to now only when it is null (the first start), and keeps it otherwise; a status that becomes `finished` from another status sets `finished_at` to now; a move from `finished` to `playing` keeps `finished_at`. An update that does not change the status (a score change, a repeated save) moves no date.
- **AC-6**: On update, `user_id` and `game_id` never change: the trigger puts back the stored values, so a row's identity never moves, whichever write path is used and also under the restore escape of AC-7. An update that tries is not an error; it succeeds and changes nothing about the identity.
- **AC-7**: When the transaction local setting `bestats.restore_game` is `on` (read as `coalesce(current_setting('bestats.restore_game', true), '') = 'on'`), an insert or update keeps the `added_at`, `started_at` and `finished_at` it was given, so G4's Undo can put a game back exactly as it was: Undo of a removal is an insert, Undo of a status move is an update. The identity pin (AC-6), the `created_at` and `updated_at` ownership (AC-4, AC-5) and the checks of AC-1 to AC-3 still apply. With the setting `off` or unset, AC-4 and AC-5 hold. Only a server function sets it; PostgREST gives a client no way to set a custom setting.
- **AC-8**: Repeated writes never create a second row: an upsert on `(user_id, game_id)` updates the one row, and an upsert repeating the stored status moves no date (AC-5). Postgres checks NOT NULL, the CHECK constraints and the insert policy against the proposed row before it looks for a conflict, so every upsert sends `status`; a score only change is a plain update (PATCH), and a move to Want to play always sends `rating: null` (PostgREST's merge sets only the columns in the payload).
- **AC-9**: RLS is enabled and forced on `user_game_state`, with four policies to `authenticated` (select, insert, update, delete), each on `(select auth.uid()) = user_id`, and the update policy also checks the new row. `anon` and `public` hold no privilege on the table; `authenticated` holds exactly select, insert, update and delete (no truncate). The trigger function's execute is revoked from `public`, `anon` and `authenticated`. The grants copy `04-policies.sql` exactly (no extra grant to `postgres` or `service_role`, nothing on the enum type, whose default usage stays), and the revokes are written into the migration by hand, because the declarative diff does not track default privileges.
- **AC-10**: pgTAP proves, acting as user A with both the role and the JWT claim set: A reads none of B's game rows; A cannot insert a row for B (refused by the insert policy), update or delete B's row (zero rows affected), or hand one of A's own rows to B (the update succeeds, and the identity pin of AC-6 keeps the row A's); and `anon` reading or writing the table is refused.
- **AC-11**: Deleting a user from `auth.users` deletes every one of their game rows (cascade).
- **AC-12**: The table has no index beyond its primary key. A tab holds at most 500 games per user, which the primary key prefix scan and an in memory sort serve; G5 adds a library index only if its real read shape needs one.
- **AC-13**: `supabase/schemas/` holds the table, type, trigger, policies and grants, and the hand written migration matches them: `supabase db diff` against the local database after `supabase db reset` reports no difference. After the reset, `pnpm test:db` passes, including the new `180-game-state.test.sql`, the extended `010`, `020` and `030` files (each `plan(n)` raised to the new count), and `140-security-sweep` unchanged.
- **AC-14**: `lib/supabase/database.types.ts` is regenerated with `pnpm db:types` against the running local stack and carries the table (`rating: number | null`, the three dates as `string`, nullable where the table is) and `Enums.game_status`; `pnpm db:types:check`, `pnpm typecheck` and `pnpm lint` pass.
- **AC-15**: The migration is pushed to the linked cloud project with `supabase db push` before the PR merges, following [docs/deploy.md](../../deploy.md), and the push result is reported.

## Decision

**Chosen option**: Option 1: one table with a status enum, checks for the score and status rules, and trigger owned dates (see [rationale.md](rationale.md)).

`user_game_state` mirrors `user_movie_state`: a composite primary key, owner only RLS that is enabled and forced, the same grant hardening, and the database refusing every state the games rules forbid. Its dates belong to a trigger with a restore escape, like `watchlisted_at` and `tracked_at`.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`public.game_status` enum: `want_to_play`, `playing`, `finished`.

`public.user_game_state`, one row per user and IGDB game; the game is in the user's list while the row exists, and removing it deletes the row.

| Column | Type | Null | Default | Owned by |
|---|---|---|---|---|
| `user_id` | uuid, PK, FK `auth.users (id) on delete cascade` | not null | none | the session, through RLS; pinned on update (AC-6) |
| `game_id` | integer, PK, check `> 0` (IGDB game id) | not null | none | the write; pinned on update (AC-6) |
| `status` | `public.game_status` | not null | none | the write |
| `rating` | smallint, check `between 1 and 10` | null | none | the write |
| `added_at` | timestamptz | not null | `now()` | trigger (AC-4, AC-5) |
| `started_at` | timestamptz | null | none | trigger |
| `finished_at` | timestamptz | null | none | trigger |
| `created_at` | timestamptz | not null | `now()` | trigger: now on insert, pinned on update |
| `updated_at` | timestamptz | not null | `now()` | trigger: now on insert; `set_updated_at` on update |

Constraints, named in the repo's style:
- `user_game_state_pkey primary key (user_id, game_id)`
- `user_game_state_game_id_check check (game_id > 0)`
- `user_game_state_rating_check check (rating between 1 and 10)`
- `user_game_state_rating_needs_status_check check (rating is null or status in ('playing', 'finished'))`
- `user_game_state_playing_started_check check (status <> 'playing' or started_at is not null)`
- `user_game_state_finished_at_check check (status <> 'finished' or finished_at is not null)`

Indexes: none beyond the primary key (AC-12). It serves the one row reads (the game page), each library tab's prefix scan, and every RLS predicate.

No relationship to the movie, show or episode tables. A game id lives only in its own table, so an IGDB id can never collide with a TMDB id (AGENTS.md section 8, "Catalog identity"). No IGDB metadata is stored (no title, cover or release date), the same rule as TMDB.

Files: the type and table in `supabase/schemas/02-tables.sql`, the trigger function `public.set_game_timestamps()` and the triggers `user_game_state_set_timestamps` (before insert or update) and `user_game_state_set_updated_at` (before update) in `03-triggers.sql`, the policies and grants in `04-policies.sql`, and one migration `supabase/migrations/20261018120000_user_game_state.sql`, written by hand from those files.

**State transitions**:

Any status to any other in one click, plus insert (add) and delete (remove). The dates move like this (trigger, outside the restore escape):

| From → to | `added_at` | `started_at` | `finished_at` | `rating` |
|---|---|---|---|---|
| (none) → want_to_play | now | null | null | must be null |
| (none) → playing | now | now | null | allowed |
| (none) → finished | now | null | now | allowed |
| want_to_play → playing | kept | now if null, else kept | kept | allowed |
| want_to_play → finished | kept | kept | now | allowed |
| playing → finished | kept | kept | now | kept |
| finished → playing | kept | now if null, else kept | kept | kept |
| playing or finished → want_to_play | now | kept | kept | must be nulled by the same write (AC-2) |
| same status → same status | kept | kept | kept | free to change within AC-2 |
| any → (deleted) | row gone | row gone | row gone | row gone |

The trigger body, in order: on insert set `created_at` and `updated_at` to now; on update pin `user_id`, `game_id` and `created_at` to the old values; if `coalesce(current_setting('bestats.restore_game', true), '') = 'on'`, return the row with its given `added_at`, `started_at` and `finished_at`; otherwise apply the table above, where every "kept" cell is `new.x := old.x`. It is `security invoker` with `set search_path = ''`, like every trigger in `03-triggers.sql`. On an upsert that hits an existing row, the insert branch runs first on the proposed row and the update branch then decides from the old row, so the result equals a plain update (the same note as `set_watchlisted_at`).

**API surface**:

G2 adds no RPC function and no Server Action. The surface is the table itself through PostgREST, under the session's JWT and RLS. G4 adds `security invoker` functions (set status, rate, remove, restore) on top; they need these same grants.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `user_game_state` (select) | GET | `game_id` filter, `status` filter, order | the caller's rows only | authenticated | anon: permission denied (`42501`) |
| `user_game_state` (insert, upsert on the PK) | POST | `user_id` (must be the caller), `game_id`, `status` (always, AC-8), `rating` (`null` on a move to Want to play) | the row with trigger set dates | authenticated | RLS violation (`42501`) for another user; check violation (`23514`) for a bad score or id |
| `user_game_state` (update) | PATCH | `status`, `rating` | the row with trigger set dates | authenticated | another user's row: zero rows; check violation (`23514`) |
| `user_game_state` (delete) | DELETE | `game_id` filter | removed rows | authenticated | another user's row: zero rows |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| any write | `user_id` | `auth.uid()` from the verified JWT; RLS refuses any other value, and G4's functions write `auth.uid()` themselves |
| any write | `game_id` | the caller's input, a validated IGDB id (spec 0023's id parsing in G3 and G4) |
| any write | `status`, `rating` | the caller's input |
| insert, update | `added_at`, `started_at`, `finished_at` | `now()` in the trigger by the transition table; under the restore escape, the values the restore function passes (from G4's Undo payload) |
| insert, update | `created_at`, `updated_at` | `now()` in `set_game_timestamps` on insert; `created_at` pinned and `updated_at` from `set_updated_at` on update |
| G4's Server Action | whether the game is released | `releaseDate` from spec 0023 (UTC day of IGDB `first_release_date`); the database never sees it (see Security model) |
| G5's library reads | each tab's order | the matching date column (`added_at`, `started_at`, `finished_at`), sorted over the primary key prefix scan |

**Key invariants**:
- One row per user and game (primary key); no duplicate state from a repeated write.
- A score exists only on Playing or Finished, and only from 1 to 10.
- Playing always has a start date; Finished always has a finish date.
- No client chooses a date (`added_at`, `started_at`, `finished_at`, `created_at`, `updated_at`), and no write moves a row to another user or game. The only way to set an old date is the restore escape, from a server function.
- A row is reachable only by its owner, for every command.
- No season style derived value is stored; there is nothing to derive.

**Security model**:
- The table holds private user data and nothing else. RLS is enabled and forced, with the four owner policies of AC-9, using `(select auth.uid())` so the call is evaluated once per statement.
- Grants follow the base migration's hardening: revoke all from `public`, `anon` and `authenticated` first, then grant select, insert, update, delete to `authenticated`, and the full set to `postgres` and `service_role`. The app never uses `service_role` (AGENTS.md section 11).
- Direct writes from a signed in user's own session are allowed, as for movies. They cannot break any invariant the database can know, but they can skip the release gate, which needs IGDB's date: a user could mark their own unreleased game Playing through a hand made API call. That affects only their own private row and is accepted, the same split as movies (AGENTS.md "Games", release gate). G4's Server Action checks the gate for every write the app makes.
- No `security definer` function is added; `username_available` stays the only one, and `140-security-sweep` needs no new exception.
- `bestats.restore_game` is reachable only from SQL running in the database; PostgREST exposes no way to set it, the same reasoning as `bestats.restore_watchlist` and `bestats.restore_tracking`. But G4's restore function is `security invoker` and callable by any signed in user, so its date arguments are client chosen. G4 must therefore: accept only dates on or before now; refuse a restore outside an Undo window measured on the trigger owned `updated_at` (for an update) or on the absence of a row (for an insert after a removal, with the removal time carried in the Undo payload checked against now); and set the escape back to `off` after its statement, as `restore_movie_watchlist` does. Any other new write path must never set it.
- No compliance scope beyond what the app already carries: the row holds a game id, a status, a score and dates, tied to an account. No new processor, so `/privacy` and `PROCESSORS` stay unchanged.

**Critical test scenarios** (in `supabase/tests/180-game-state.test.sql` unless noted):
- Happy path: as user A, insert a game as Want to play, move it to Playing, rate it 8, move it to Finished; the dates follow the transition table and the score stays, verifies **AC-4**, **AC-5**.
- Replay: Finished to Playing keeps `started_at` and `finished_at`; set straight to Finished then Playing stamps the first `started_at`, verifies **AC-3**, **AC-5**.
- Back to Want to play: with the score left in place the update fails with `23514`; with the score nulled in the same update it succeeds, `added_at` moves to now, the other dates stay, verifies **AC-2**, **AC-5**.
- Client sent dates: an insert and an update that send past or future values for all five dates get the trigger's values, in every row of the transition table, verifies **AC-4**, **AC-5**.
- Identity pin: an update that sends a different `game_id` (and, as the owner, a different `user_id`) keeps the stored ones, verifies **AC-6**.
- Restore escape: with `set_config('bestats.restore_game', 'on', true)`, an insert keeps given dates while `created_at`, `updated_at` and the identity pin still apply; set back to `off` (a pgTAP transaction cannot truly unset it), the same insert gets now; a restore that would break AC-3 still fails, verifies **AC-6**, **AC-7**.
- Upsert shape: an upsert without `status` fails with `23502` even on an existing row; a move to Want to play that omits `rating: null` fails with `23514`; a score only PATCH succeeds, verifies **AC-8**.
- Idempotent writes: the same upsert twice leaves one row and the same dates, verifies **AC-8**.
- Checks: rating 0 and 11, `game_id` 0, Playing with no start under the escape, all refused, verifies **AC-1**, **AC-2**, **AC-3**.
- Auth/permission (in `030-cross-user-isolation.test.sql`): A cannot read, insert for, update, delete or take over B's rows; anon is refused, verifies **AC-9**, **AC-10**.
- Structure and configuration (in `010` and `020`): the table, enum values, key, policies, forced RLS and grants exist as specified, and the table has no index beyond its primary key, verifies **AC-1**, **AC-9**, **AC-12**.
- Cascade: deleting a fixture user removes their game rows, verifies **AC-11**.

## Build plan

Tracer Bullet for a schema foundation: first a thin thread through every layer this feature has (schema files, migration, local database, a cross user pgTAP test, generated types), then thicken the rules one at a time. All of it lands in one migration, grown across the tasks while it is unpushed, then pushed once.

1. Thin thread: in `supabase/schemas/` add the `game_status` enum and `user_game_state` with its key, foreign key, `game_id` check and `updated_at` trigger; add RLS enabled and forced, the four policies and the hardened grants in `04-policies.sql`; write `supabase/migrations/20261018120000_user_game_state.sql` to match; add game rows to `supabase/seed.sql` for user A (`1942` Playing with score 8, `119133` Finished with no score) and user B (`1942` Want to play), with fixed, distinct dates written under `set_config('bestats.restore_game', 'on', true)` (set back to `off` afterwards) once task 3 adds the trigger, so later sort tests see real orders; extend `030-cross-user-isolation.test.sql` with the game cases; run `supabase db reset`, `pnpm test:db` and `pnpm db:types`, satisfies **AC-1**, **AC-9**, **AC-10**, **AC-11**, **AC-14**.
2. Score and status rules: add the rating, score needs Playing or Finished, Playing has a start and Finished has a finish checks to the schema file and the migration, with their cases in a new `180-game-state.test.sql`, satisfies **AC-2**, **AC-3**.
3. Trigger owned dates: add `set_game_timestamps()` with the identity pin, the restore escape and the transition table, its execute revoked, and the trigger; cover every row of the transition table, client sent dates, the escape, the identity pin and the upsert shapes in `180`, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**.
4. Structure and sweep: extend `010-schema-structure` (including the no extra index assertion) and `020-security-configuration` with the new table, enum and policies, raising each `plan(n)`; confirm `140-security-sweep` passes untouched; run `supabase db diff` for drift; regenerate types and run `pnpm db:types:check`, `pnpm typecheck` and `pnpm lint`, satisfies **AC-12**, **AC-13**, **AC-14**.
5. Cloud: once the PR is approved, run `supabase db push` against the linked project per `docs/deploy.md`, then merge, satisfies **AC-15**.

## Consequences

**Positive**:
- Every games rule the database can know holds on every write path, so G4 and later features cannot store an impossible state by mistake.
- Dates are trustworthy for sorting: no client can move a game to the top of a page by sending a date.
- The security boundary is the same shape as movies and shows, so the existing sweep and the reviewers' habits cover it.
- G4's Undo is already possible without touching the trigger again.
- No index to maintain until a measured read needs one.

**Negative / tradeoffs**:
- The release gate is not enforced by the database; a hand made API call can mark one's own unreleased game Playing or score it.
- The write that moves a game to Want to play must remember to null the score; forgetting it is a visible failed save, not silent data loss.
- Status history is not kept: only the first start and the latest finish survive, so "finished three times" cannot be shown later without a new table.
- One more trigger with a restore escape to keep in mind: any new write path must not set `bestats.restore_game`.

**Neutral**:
- The table sits unused in production until G4 and G5 ship; the GAMES tab stays hidden until then.
- Seed data grows by three rows; the pgTAP suite still needs a clean `supabase db reset` before it runs.
- `database.types.ts` gains the table and the enum, which G4 starts from.

## Follow-up

- [ ] `/sync` after merge: add a repo fact line to `AGENTS.md` naming `user_game_state`, its trigger owned dates and the `bestats.restore_game` escape, next to the `user_show_state` line.
- [ ] G4 (`/architect game status and rating`): design the write functions (set status, rate, remove, restore) on this table, honouring the restore guards in the Security model (dates on or before now, an Undo window on the trigger owned `updated_at`, the escape set back to `off`), and decide the app error codes they raise.
- [ ] G5: cap each tab at 500 rows as for shows and movies, and add a partial index per tab only if `EXPLAIN` on real data shows the primary key scan is not enough (AC-12).
