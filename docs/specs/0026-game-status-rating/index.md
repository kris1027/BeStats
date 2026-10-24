# 0026. Game status and rating: the status pills, the score and their Undo on the game page

**Date**: 2026-10-24
**Status**: In Progress

Scope feature: [G4. Game status and rating](../../scope/games.md) · GA tier

Builds on: [0024](../0024-game-data-model-security/index.md) (the `user_game_state` table, its trigger owned dates and the `bestats.restore_game` escape) and [0025](../0025-game-page/index.md) (the game page, `loadGame` and the hero's `tracking` slot). Settled in an `/architect` session on 2026-10-24, on top of the games rules in [docs/scope/games.md](../../scope/games.md).

## Summary

This puts three status pills (Want to play, Playing, Finished) and a personal score on `/games/{id}` for a signed in user. A click on a pill sets that status, and a click on the pill that is already on removes the game, with Undo. The score (1 to 10) shows only on Playing or Finished. Moving back to Want to play clears it, and Undo brings it back. Every write goes through a Server Action that checks the session and IGDB (the release date gates Playing, Finished and scoring), then calls one of five small SQL functions that run as the user, so row level security (the database rule that a row is reachable only by its owner) still applies. No new table: the functions sit on top of spec 0024's table.

## Requirements

**User stories**:
- As a signed in user, I want to mark a game Want to play, Playing or Finished in one click so that my list reflects where I am with it.
- As a signed in user, I want to score a game I am playing or have finished so that I remember what I thought of it.
- As a signed in user, I want an Undo when a click removed a game or a score so that a slip never costs me data.
- As a signed in user, I want Playing, Finished and scoring held back until a game is out so that my list stays honest.

**Acceptance criteria**:
- **AC-1**: On `/games/{id}`, the status control renders in the hero's `tracking` slot, under the IGDB rating block, inside its own Suspense boundary with a `null` fallback. A visitor sees nothing there (the same as the movie and show pages). A signed in user sees the control already showing the stored state, never a default that then corrects itself. When the read fails, the slot shows `TRACKING_READ_FAILED` with a Retry link to `/games/{id}`. The page shell stays prerendered: nothing outside that boundary reads the session (spec 0025, AC-9).
- **AC-2**: The control is three glass pills in a `role="group"` labelled `Status for {name}`, in the order Want to play, Playing, Finished, using `glassPillClassName()` and `TRACKING_PILL` like the movie pills. Each pill is a toggle with `aria-pressed` and a fixed accessible name (`Want to play: {name}`, `Playing: {name}`, `Finished: {name}`), so a screen reader hears one control change state. At most one pill is pressed. A score pill follows them only while the status is Playing or Finished.
- **AC-3**: Clicking a pill that is not pressed sets that status through `setGameStatus(gameId, status)`, from any status (or none) to any other, in one click. The action takes a target value, never a toggle: the same call twice leaves one row and moves no date (spec 0024, AC-5, AC-8).
- **AC-4**: Clicking the pressed pill removes the game through `removeGame(gameId)`, which deletes the row. On success a toast reads `Removed from your games.` with an Undo action for `UNDO_TOAST_MS` (10 seconds). Undo calls `restoreRemovedGame` with what `remove_game` returned, and the game comes back with its old status, score, `added_at`, `started_at` and `finished_at`. A removal that finds no row (another tab already removed it) is a quiet success with no toast.
- **AC-5**: Moving a game from Playing or Finished to Want to play clears its score in the same statement (spec 0024, AC-2). When a score was cleared, a toast reads `Moved to Want to play. Your score was removed.` with Undo, which calls `restoreGameStatus` and puts back the old status, score and all three dates exactly. When there was no score, no toast shows.
- **AC-6**: Moving between Playing and Finished keeps the score. The score pill reads the score (`formatPersonalScore`) or `Rate` when there is none, with the accessible name `Your score for {name}: {score or Not rated}` (the movie wording), and opens the existing `ScorePicker` in a popover with the current score checked. A pick saves through `setGameRating(gameId, rating)` and closes the popover. Clear rating saves `null`, closes it and keeps the status. A score on a game with no row or on Want to play is refused by the database with `BS004` (`game_not_started`), reported as `not_started`.
- **AC-7**: A click that moves a game into Finished from any other status (or none) opens the score picker at once, but only when the game has no score yet. A move into Playing never does. Closing the picker leaves the game Finished and unscored. If the write fails, the picker closes with the rollback.
- **AC-8**: Before release (IGDB `releaseDate` null, or a UTC day after today's UTC day), the slot shows the release line under the pills: `Releases {date}` or `Release date to be announced`, the movie page's copy. The line lives in the slot, so only a signed in user sees it. The Playing and Finished pills are `aria-disabled` and do nothing, except the one that is pressed, which can still be clicked to remove the game. Want to play is never held back by the release gate (it can still fail with `not_found` or `igdb_unavailable`, AC-9). The score picker gets `unavailableNote` set to the release line, so its ten choices do nothing while Clear rating still works. A game stored as Playing or Finished before release keeps its pressed pill and score pill.
- **AC-9**: The Server Actions check IGDB through `loadGame` before writing, and only where a write could move a game forward: `setGameStatus` to `playing` or `finished` refuses an id IGDB does not know or hides with `not_found`, and refuses before release with `not_released`; `setGameStatus` to `want_to_play` refuses only an id IGDB does not know (`not_found`), and accepts a hidden game; `setGameRating` with a score refuses before release with `not_released`. An IGDB failure on any of these refuses with `igdb_unavailable`, which is accepted for Want to play too. `removeGame`, clearing a score, `restoreGameStatus` and `restoreRemovedGame` never call IGDB: a restore only puts back a state the user already had, so it never advances, and it works during an outage, for a hidden game, and before release. The slot decides the release line from `requestTodayUtc()` and the action from `todayUtc(new Date())`; across UTC midnight they can disagree, so an enabled pill can still return `not_released`, which is accepted.
- **AC-10**: Every action runs Zod parse, then `getOptionalUser()`, then the IGDB check, then the SQL call through the request's Supabase client under the user's JWT, then `refresh()` on success only. None throws or redirects; each returns `GameTrackingResult`. `user_id` is always `auth.uid()` inside the SQL, never an argument. A missing session returns `session_expired`, whose toast carries Sign in to `/sign-in?next=/games/{id}`. Each new export is registered in `private-actions-boundary.test.ts`, which proves it refuses a missing session before it opens a database client.
- **AC-11**: The control is optimistic through `useOptimistic` and a pure reducer `applyGameIntent` (moving to Want to play or removing nulls the score), so a click shows its result at once. A `rating` intent on no status or on Want to play changes nothing. On failure the control falls back to the server prop and shows the matching toast; when a score pick is queued behind a status write that fails (the auto open case), both roll back together and only the status toast shows (the score's `not_started` is not toasted while a status error is showing). Toast ids: `game-tracking-{id}-status` (status and removal failures), `game-tracking-{id}-rating` (score failures), `game-undo-{id}` (both Undo toasts). Every target is read from the optimistic value, so a double click sends two different targets, not the same one twice.
- **AC-12**: Every change survives a reload and shows in another signed in session: the slot reads the row per request with `getGameTracking(gameId)`, which never enters a shared or `use cache` scope (AGENTS.md section 11).
- **AC-13**: A migration adds `set_game_status`, `rate_game`, `remove_game`, `restore_game_status` and `restore_removed_game` exactly as in the API surface below, each `security invoker` with `set search_path = ''`, its execute revoked from `public`, `anon` and `authenticated` and granted back to `authenticated` only. `set_game_status` locks the existing row (`for update`) before it reads the previous values and writes, so two tabs cannot both receive the same Undo payload.
- **AC-14**: The restores refuse with `P0002`, reported as `undo_expired` with the existing Undo expired copy, unless: `p_added_at <= now()`, `(p_started_at is null or p_started_at <= now())` and `(p_finished_at is null or p_finished_at <= now())`; for `restore_game_status`, the row exists, is `want_to_play` with a null score, `updated_at > now() - interval '10 minutes'`, and the restored status is `playing` or `finished`; for `restore_removed_game`, no row exists (`insert … on conflict do nothing`, then `if not found` raises), `p_removed_at <= now()` and `p_removed_at > now() - interval '10 minutes'`. pgTAP pins both window boundaries. A payload that passes these guards but breaks a table check (a Playing state with no start) fails with `23514` as `write_failed`; the Zod schema refuses that shape first (API surface). Both set `bestats.restore_game` to `on` only around their one statement and back to `off` before returning or raising. The table checks (spec 0024, AC-1 to AC-3) still apply to what they write.
- **AC-15**: Errors map through `classifyGameTrackingError`, reading only `error.code`: `BS004` is `not_started`, `BS003` (the identity lock, unreachable through these functions) is `write_failed` logged as `identity_locked`, and every other code follows `classifyTrackingError`. Each refusal, `invalid_input` and `session_expired` included, is logged with `logTrackingEvent` under the action's own `game_tracking.*` event and an outcome class only, never an id, a date or a raw error.
- **AC-16**: `supabase/tests/190-game-tracking-functions.test.sql` covers every function, guard and refusal above; `020-security-configuration` asserts the new function grants; `140-security-sweep` passes unchanged (no `security definer`). `supabase db diff` after `supabase db reset` reports no drift, `pnpm db:types` regenerates the function signatures, and `pnpm db:types:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:db` and `pnpm build` pass. The migration is pushed with `supabase db push` before the PR merges (docs/deploy.md).
- **AC-17**: At 375px and 1280px the pills wrap without horizontal scroll, keep a 44px tap target through the `hit-area` utilities, show visible focus, and the score popover fits the screen (`max-w-[calc(100vw-2rem)]`). Keyboard alone can set every status, remove, open the picker, score and use Undo from the toast.

## Decision

**Chosen option**: Option 1: Server Actions over five `security invoker` SQL functions plus a plain PATCH to clear the score (see [rationale.md](rationale.md)).

The game page gets a `GameTrackingSlot` and a client `GameStatusControl` shaped like the movie ones, and `app/games/actions.ts` mirrors `app/movies/actions.ts`: one shared `runGameWrite` runs the parse, session, IGDB and release check, write and `refresh()` order, and every write whose result an Undo needs goes through a SQL function that locks, reads and writes in one transaction.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new table, column, index or enum value. Everything sits on `public.user_game_state` from spec 0024 (one row per user and game: `status`, `rating`, `added_at`, `started_at`, `finished_at`, `created_at`, `updated_at`), whose trigger owns every date and whose checks refuse a score on Want to play.

New in `supabase/schemas/05-functions.sql`, after the show tracking block, and in one hand written migration `supabase/migrations/20261024120000_game_tracking_functions.sql` (grown across the build tasks while unpushed, then pushed once):

| Function | Language | Does | Returns |
|---|---|---|---|
| `set_game_status(p_game_id integer, p_status public.game_status)` | plpgsql | `select … for update` the caller's row into the previous values (a missing row locks nothing and leaves them null); `insert into public.user_game_state as s … on conflict (user_id, game_id) do update set status = excluded.status, rating = case when excluded.status = 'want_to_play' then null else s.rating end`; `return query select` the previous values | always exactly one row: `table (prev_status public.game_status, prev_rating smallint, prev_added_at timestamptz, prev_started_at timestamptz, prev_finished_at timestamptz)`, all null when there was no row; the action reads `data[0]` |
| `rate_game(p_game_id integer, p_rating smallint)` | plpgsql | `update … set rating = p_rating where user_id = auth.uid() and game_id = p_game_id and status in ('playing', 'finished') and p_rating between 1 and 10`; when not found, `raise exception 'game_not_started' using errcode = 'BS004'` (a null `p_rating` from a direct call is refused the same way, so only the PATCH clears) | `void` |
| `remove_game(p_game_id integer)` | plpgsql | `delete from public.user_game_state as s where s.user_id = auth.uid() and s.game_id = p_game_id returning` the five values `into` locals; `if found then return query select` them with `now()` | `table (removed_status, removed_rating, removed_added_at, removed_started_at, removed_finished_at, removed_at timestamptz)`; zero rows when there was nothing to delete; the action reads `data?.[0]` |
| `restore_game_status(p_game_id integer, p_status public.game_status, p_added_at timestamptz, p_rating smallint default null, p_started_at timestamptz default null, p_finished_at timestamptz default null)` | plpgsql | Escape `on`; `update … set status, rating, added_at, started_at, finished_at` to the given values `where` the AC-14 guards hold; `if not found`, escape `off` then raise `P0002`; otherwise escape `off` | `void` |
| `restore_removed_game(p_game_id integer, p_status public.game_status, p_added_at timestamptz, p_removed_at timestamptz, p_rating smallint default null, p_started_at timestamptz default null, p_finished_at timestamptz default null)` | plpgsql | If the date and window guards of AC-14 fail, raise `P0002`; escape `on`; `insert … on conflict (user_id, game_id) do nothing`; `if not found` (a row appeared meanwhile), escape `off` then raise `P0002`; otherwise escape `off` | `void` |

`p_rating`, `p_started_at` and `p_finished_at` default to null. Clearing a score is not a function: the action sends `update user_game_state set rating = null where user_id = $user and game_id = $id`, which moves no date (spec 0024, AC-5). On a row another tab already removed it matches nothing and returns ok on purpose; `refresh()` then shows the true state. `set_game_status` does not check the release gate; only the Server Action does.

SQLSTATEs: `BS004` (`game_not_started`) is new, beside `BS001` to `BS003`. `P0002` is the shared Undo refusal.

**State transitions**:

The status machine and its dates are spec 0024's transition table, unchanged. What G4 adds is which click reaches which transition, and what it offers back:

| Current | Click | Write | Undo offered |
|---|---|---|---|
| none | Want to play, Playing or Finished | `set_game_status` (insert) | none |
| any status | a different, unpressed pill | `set_game_status` (update) | only on a move to Want to play that cleared a score (AC-5) |
| any status | the pressed pill | `remove_game` | always, when a row was deleted (AC-4) |
| Playing or Finished | a score, or Clear rating | `rate_game`, or the PATCH | none |
| unreleased, none or Want to play | Playing or Finished | none: the pill is disabled (AC-8) | |
| unreleased, Playing or Finished | the other of the two | none: disabled | |
| unreleased, Playing or Finished | Want to play, or the pressed pill | allowed, as above | as above |

**API surface**:

Server Actions in `app/games/actions.ts` (`"use server"`), each returning `GameTrackingResult`:

| Action | Key inputs | IGDB check | SQL | Key outputs | Key errors |
|---|---|---|---|---|---|
| `setGameStatus` | `gameId: number`, `status: "want_to_play" \| "playing" \| "finished"` | `want_to_play`: known to IGDB (hidden accepted); `playing` or `finished`: known, not hidden and released | `rpc("set_game_status")` | `{ ok: true, undo? }`, `undo` of kind `status` only when the previous status was `playing` or `finished`, the target is `want_to_play` and `prev_rating` was not null | `invalid_input`, `session_expired`, `not_found`, `not_released`, `igdb_unavailable`, `write_failed` |
| `setGameRating` | `gameId`, `rating: 1..10 \| null` | released, only when `rating` is not null | `rpc("rate_game")`, or the PATCH for `null` | `{ ok: true }` | `not_started`, `not_released`, plus the shared ones |
| `removeGame` | `gameId` | none | `rpc("remove_game")` | `{ ok: true, undo? }`, `undo` of kind `removed` when a row came back | shared ones |
| `restoreGameStatus` | `gameId`, `previous: GameRestoreState` | none | `rpc("restore_game_status")` | `{ ok: true }` | `undo_expired`, plus the shared ones |
| `restoreRemovedGame` | `gameId`, `previous: GameRestoreState`, `removedAt: string` | none | `rpc("restore_removed_game")` | `{ ok: true }` | `undo_expired`, plus the shared ones |

Shapes in `lib/tracking/types.ts`:
- `GameStatus = Database["public"]["Enums"]["game_status"]`.
- `GameTrackingState = { status: GameStatus | null; rating: number | null }`, `EMPTY_GAME_TRACKING = { status: null, rating: null }`.
- `GameRestoreState = { status: GameStatus; rating: number | null; addedAt: string; startedAt: string | null; finishedAt: string | null }`.
- `GameUndo = { kind: "status"; previous: GameRestoreState } | { kind: "removed"; previous: GameRestoreState; removedAt: string }`.
- `GameTrackingError = Exclude<TrackingError, "tmdb_unavailable"> | "igdb_unavailable" | "not_released" | "not_started"`.
- `GameTrackingResult = { ok: true; undo?: GameUndo } | { ok: false; error: GameTrackingError }`.

Zod in `lib/tracking/schemas.ts`: `gameIdSchema` with the bounds `parseGameId` uses, `gameStatusSchema = z.enum(["want_to_play", "playing", "finished"])`, `ratingSchema` reused, and a `gameRestoreStateSchema` whose dates are `z.iso.datetime({ offset: true })` (nullable for `startedAt` and `finishedAt`), as `restoreWatchedInputSchema` does, refined so `playing` needs `startedAt`, `finished` needs `finishedAt`, and `want_to_play` needs a null `rating` (the table's checks, refused early as `invalid_input`).

Read in `lib/tracking/game-state.ts` (`server-only`): `getGameTracking(gameId): Promise<TrackingRead<GameTrackingState>>`, using `getOptionalUser()` then `select status, rating … eq(game_id).maybeSingle()` under RLS; a failure is logged and returned as `failed`.

Pure helpers: `applyGameIntent` in `lib/tracking/game-intent.ts` (intents `{ kind: "status"; value: GameStatus | null }` and `{ kind: "rating"; value: number | null }`); `isGameReleased(releaseDate, today)` and `gameReleaseNote(releaseDate)` in `lib/catalog/game-page.ts`, delegating to `airStatus` and `UPCOMING_MESSAGES` so the copy and the UTC day boundary match `isMovieReleased` and `movieReleaseNote`, and so G5 and G8 reuse them.

UI: `components/tracking/game-tracking-slot.tsx` (server, like `MovieTrackingSlot`, computes the release line from `requestTodayUtc()`), `components/tracking/game-status-control.tsx` (client), and `components/tracking/use-game-undo.ts` (the two Undo toasts through `runUndoInToast`). The page passes `<Suspense fallback={null}><GameTrackingSlot … /></Suspense>` to `GameHero`'s `tracking` prop.

Copy in `lib/tracking/messages.ts`: `GAME_STATUS_LABELS` (`Want to play`, `Playing`, `Finished`), `GAME_TRACKING_MESSAGES: Record<GameTrackingError, string>` (reusing the movie wording for the shared classes, `Couldn't reach IGDB. Try again.` for `igdb_unavailable`, `This game isn't out yet.` for `not_released`, `Set Playing or Finished to score this game.` for `not_started`), and `GAME_UNDO_MESSAGES` (`removed: "Removed from your games."`, `scoreCleared: "Moved to Want to play. Your score was removed."`, `undoExpired` reusing the existing Undo expired copy).

Log events in `lib/tracking/log.ts`: `game_tracking.status`, `game_tracking.rate`, `game_tracking.remove`, `game_tracking.restore_status`, `game_tracking.restore_removed`, `game_tracking.read`; `TrackingOutcome` gains `GameTrackingError` and `identity_locked`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| any write | `user_id` | `auth.uid()` inside the SQL, from the verified JWT |
| any write | `game_id` | the action's `gameId`, parsed by `gameIdSchema`; on the page, the `id` already parsed by `parseGameId` |
| `setGameStatus` | `status` | the clicked pill, read as a target from the optimistic state |
| `setGameStatus` | the cleared score's Undo payload | `prev_*` columns returned by `set_game_status`, read under the row lock |
| `setGameRating` | `rating` | the picked score from `ScorePicker`, or `null` from Clear rating |
| `removeGame` | the removal's Undo payload and `removedAt` | `remove_game`'s `returning` and its `now()` |
| both restores | the dates, status and score to put back | the Undo payload the earlier write returned, carried in the toast closure, never shown or edited |
| both restores | whether the Undo is still allowed | `updated_at` (status) or `p_removed_at` (removal) against `now()` in the SQL; the toast's 10 seconds is the visible limit |
| release gate (server) | released or not | `Game.releaseDate` from `loadGame` (UTC day of IGDB `first_release_date`, spec 0023) against `todayUtc(new Date())` |
| release gate (page) | the release line and the disabled pills | `releaseDate` passed from the page to the slot, `requestTodayUtc()` in the slot, `gameReleaseNote` for the text |
| slot | stored status and score | `getGameTracking` per request |
| control | accessible names | the IGDB `name` the page already has |
| score pill | the shown score | `formatPersonalScore(optimistic.rating)` |
| `session_expired` toast | where Sign in returns | `returnPath = /games/{id}`, built in the slot |

**Key invariants**:
- One row per user and game; a repeated click writes the same row (spec 0024).
- A score exists only on Playing or Finished: the table check, `rate_game`'s `BS004`, and `set_game_status` nulling it on Want to play all hold it.
- No client chooses a date except through the two restores, which accept only past dates, only inside a 10 minute window, and only for the caller's own row. A direct call with a forged `p_removed_at` can therefore insert the caller's own row with any past dates, even Playing or Finished on an unreleased game; it touches only their own private row and is accepted (Security model).
- No new forward move the app makes (a status into Playing or Finished, a score) happens before release; removing, clearing, moving to Want to play and Undo are always possible.
- The confirmed state on screen is always the server's after `refresh()`; the optimistic value lives only while an action is in flight.
- No page writes when it loads (AGENTS.md, spec 0020 AC-21): the slot only reads.

**Security model**:
- `user_game_state` stays owner only under forced RLS (spec 0024, AC-9). Every new function is `security invoker`, so the four policies apply inside it, and writes `auth.uid()` itself. A null `auth.uid()` fails the `not null` on `user_id`, so no unauthenticated call writes.
- Execute on every new function is revoked from `public`, `anon` and `authenticated`, then granted to `authenticated` only, written into the migration by hand (the declarative diff does not track function privileges). No `security definer`; `username_available` stays the only one.
- The Server Actions are the only app write path and they re-check the session (`getOptionalUser`, never `getSession`) on every call; the proxy is not the boundary (`lib/auth/AGENTS.md`).
- The release gate is enforced in the Server Action, not the database (spec 0024 security model). A signed in user calling the functions directly can set their own unreleased game Playing; it touches only their own private row and is accepted, as for movies.
- The restores take client supplied dates. They are bounded to the past, to the caller's own row, to a state the matching write produced, and to 10 minutes; a forged `p_removed_at` lets a direct call insert the caller's own row with any past dates and any status, skipping the release gate, which is the same accepted own row exposure as calling `set_game_status` directly. The window is a staleness limit, not a security boundary (the same note as `restore_movie_watchlist`). The restores skip IGDB on purpose (AC-9), so this path never depends on IGDB.
- `bestats.restore_game` is set only inside the two restore functions and set back to `off` on every path, including before a raise.
- Logs carry an event and an outcome class only. No processor is added, so `/privacy` and `PROCESSORS` stay unchanged.

**Configuration required**:
- None. No new environment variable or credential; the IGDB credentials from spec 0023 already serve `loadGame`.

**Critical test scenarios**:
- Happy path (pgTAP and the dev loop): as user A, Want to play, then Playing, score 8, then Finished; the score stays and the dates follow spec 0024; reload and a second session show the same, verifies **AC-3**, **AC-6**, **AC-12**.
- Auto open: a move into Finished opens the picker, a move into Playing does not; a failed Finished write closes it, verifies **AC-7**.
- Removal and Undo: clicking the pressed pill deletes the row, `remove_game` returns the values and `removed_at`; `restore_removed_game` puts back status, score and all three dates exactly; a second `remove_game` returns zero rows and the action returns no `undo`, verifies **AC-4**, **AC-14**.
- Score cleared: Finished with score 9 to Want to play returns the previous values; `restore_game_status` restores Finished, 9 and the old `added_at`, `started_at`, `finished_at`; a move from unscored Playing returns no `undo`, verifies **AC-5**, **AC-14**.
- Undo refusals: a restore with a future date, after 10 minutes (`updated_at` or `p_removed_at` moved back in the test), on a row changed meanwhile to Playing, or a removal restore when the row already exists, each raise `P0002`, and the escape reads `off` afterwards, verifies **AC-14**.
- Score refusals: `rate_game` with no row and on Want to play raise `BS004`; the action maps it to `not_started`, verifies **AC-6**, **AC-15**.
- Release gate (Vitest on the actions, with `loadGame` mocked): Playing, Finished and a score refuse with `not_released` for a future date and a null date; Want to play, removal, Clear rating and both restores (of a Finished, scored state) succeed before release; a hidden game refuses `not_found` on Playing and Finished but is accepted on Want to play; an IGDB failure refuses `igdb_unavailable` on status and score while removal, clearing and both restores still work and never call `loadGame`, verifies **AC-8**, **AC-9**.
- Reducer edge cases: a `rating` intent on no status or Want to play is a no op; a score queued behind a failing status write rolls back with only the status toast, verifies **AC-11**.
- Score pill: `Rate` when unscored, the accessible name, the checked current score, closing after a pick; a move into Finished with an existing score does not open the picker, verifies **AC-6**, **AC-7**.
- Restore payload shapes: Zod refuses Playing with no `startedAt`, Finished with no `finishedAt` and Want to play with a score as `invalid_input`; `rate_game` with a null score raises `BS004`; `remove_game` on no row returns zero rows and `set_game_status` always one, verifies **AC-6**, **AC-13**, **AC-14**.
- Release gate (component test): an unreleased game shows the line, disabled Playing and Finished, and the picker's `unavailableNote`; a stored Playing unreleased game can still be removed and moved to Want to play, verifies **AC-8**.
- Concurrency: two `set_game_status` calls racing on one row both succeed, and only the first that moves Finished to Want to play receives a non null `prev_rating` (two sessions in pgTAP, or `for update` asserted through the function body), verifies **AC-13**.
- Optimistic: `applyGameIntent` pinned against the SQL outcomes; a double click sends two different targets; a failure rolls back and shows the toast, verifies **AC-11**.
- Auth and permission: every action without a session returns `session_expired` before any client opens (`private-actions-boundary.test.ts`); in pgTAP user A's functions never touch user B's row and `anon` cannot execute any of them; the visitor slot renders nothing, verifies **AC-1**, **AC-10**, **AC-13**.
- Read failure: `getGameTracking` returning `failed` shows the retry line, verifies **AC-1**.
- States: 375px and 1280px, keyboard only flow, focus and tap targets, verifies **AC-2**, **AC-17**.

## Build plan

Tracer Bullet: first one real thread from the pill to the database and back (one status write, read on reload), then thicken it with removal, the score, the release gate and the polish, each end to end. One migration, grown across tasks while unpushed, pushed once before merge.

1. Thin thread: `set_game_status` in `05-functions.sql` and the migration, with its grants and first cases in `190-game-tracking-functions.test.sql`; `pnpm db:types`; `GameStatus`, `GameTrackingState`, `GameTrackingResult` and the Zod schemas; `getGameTracking`; `setGameStatus` with the parse, session, `loadGame` existence check and `refresh()` (gate added in task 4); `GameTrackingSlot` and a first `GameStatusControl` with the three pills (set only), wired into the hero slot in its own Suspense; register the action in `private-actions-boundary.test.ts`; check in the running app that a click survives reload, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**, **AC-12**, **AC-13**.
2. Removal and its Undo: `remove_game` and `restore_removed_game` with their guards and tests; `removeGame` and `restoreRemovedGame`; clicking the pressed pill removes; `use-game-undo.ts` with the removal toast through `runUndoInToast`, satisfies **AC-4**, **AC-14**.
3. Score: `rate_game` with `BS004`; `classifyGameTrackingError`; `setGameRating` with the PATCH for `null`; the score pill and popover; auto open on Finished; `set_game_status`'s previous values turned into the `status` Undo, `restore_game_status` and `restoreGameStatus` with the score cleared toast, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-14**, **AC-15**.
4. Release gate: `isGameReleased` and `gameReleaseNote`; the server checks in every action that needs them, with `not_released` and `igdb_unavailable`; the release line, disabled pills and `unavailableNote` in the control, satisfies **AC-8**, **AC-9**.
5. Optimistic and failure handling: `applyGameIntent` with tests pinned to the SQL; `useOptimistic` in the control, the toast ids, the log events and messages, satisfies **AC-11**, **AC-15**.
6. States and checks: 375px and 1280px, keyboard and focus, `020` grant assertions, `140` untouched, `supabase db diff`, `pnpm db:types:check`, `typecheck`, `lint`, `test`, `test:db`, `build`; once the PR is approved, `supabase db push` per docs/deploy.md, then merge, satisfies **AC-16**, **AC-17**.

## Consequences

**Positive**:
- The game page now does the job the scope promised for one game, end to end, and G5 and G8 can reuse the actions, the read, the release helpers and the reducer as they are.
- Every Undo payload is read under a row lock in the same transaction as the write, so two tabs can never hand out a wrong Undo.
- The shape copies the movie tracking stack closely, so reviewers, tests and the boundary suites already know it.

**Negative / tradeoffs**:
- Five more SQL functions to keep in step with `applyGameIntent` and the trigger; a change to the games rules now touches SQL, TypeScript and tests together.
- Changing a status needs IGDB to answer; during an IGDB outage a user can remove a game, clear a score and use Undo, but not set a status, Want to play included.
- The release gate lives only in the Server Action, so a hand made API call can still set one's own unreleased game Playing.
- A move back to Want to play without a score offers no Undo, so its old `added_at` (its place on Want to play) is lost; one click restores the status but not that place.
- Saved games are invisible in any library until G5 ships, since the GAMES tab stays hidden.

**Neutral**:
- The control is live in production as soon as this merges, reachable only by people who already have a `/games/{id}` URL (the pages are `noindex` until G10).
- A new app SQLSTATE, `BS004`, joins `BS001` to `BS003`.
- `database.types.ts` gains the five function signatures.

## Follow-up

- [ ] `/sync` after merge: a repo fact line in `AGENTS.md` naming the five game functions, `BS004`, and that the game release gate lives in `app/games/actions.ts`; and the `lib/tracking/` reuse note for G5 and G8.
- [ ] G5 (`/architect games tab and library pages`): reuse `getGameTracking`'s shape for the list read, `isGameReleased` for the Want to play release badge, and the removal Undo for the library cards.
- [ ] G8 (`/architect game cards everywhere`): the card control reuses `setGameStatus`, `removeGame` and `applyGameIntent`; decide there whether the card offers the score.
- [ ] Check during `/develop` whether `/showcase` lists the movie tracking pills; if it does, add the game pills' pressed, disabled and release line states beside them.
