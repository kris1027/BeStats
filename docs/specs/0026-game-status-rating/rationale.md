# 0026. Game status and rating: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file holds the why.

## Context

G2 (spec 0024) shipped `user_game_state` with its rules in the database: one row per user and game, a score only on Playing or Finished, every date owned by a trigger, and a `bestats.restore_game` escape that only a server function may set, so an Undo can put a game back exactly as it was. G3 (spec 0025) shipped a public `/games/{id}` whose hero already has an empty `tracking` slot. Nothing writes to the table yet, so a user cannot record anything about a game.

The games rules were settled on 2026-10-17: three statuses set by hand, any status to any other in one click, removal deletes the row with Undo, a score from 1 to 10 only on Playing or Finished, moving back to Want to play clears the score with Undo, and a release gate (UTC day of IGDB `first_release_date`) that holds Playing, Finished and scoring back and that the database cannot check, because it never sees IGDB data. The project already has a mature movie tracking stack (Server Actions that never throw, `security invoker` SQL functions, optimistic pills, Undo through toasts, boundary tests) that reviewers and tests know well.

The forces: two of the writes must hand back what they cleared (the score on a move to Want to play, the whole row on a removal), and two tabs open on the same game must not both receive an Undo for one change. The release gate needs IGDB at write time, which can fail. The page shell must stay prerendered (spec 0025, AC-9), so anything that reads the session must stream inside its own boundary. And the feature is GA tier: it holds private data and enforces the status and score rules, so every write path must fail visibly, never with a false success.

Not deciding leaves G5 and G8 with no write path to build on, and leaves the restore escape that spec 0024 built unused and unguarded.

## Options considered

### Option 1: Server Actions over `security invoker` SQL functions

Each Server Action parses, checks the session and IGDB, then calls one SQL function (`set_game_status`, `rate_game`, `remove_game`, two restores) that locks the row, reads what it is about to change and writes it, in one statement or one transaction. Clearing a score is a plain PATCH, as for movies.

**Pros**:
- The previous values for Undo are read under the same row lock as the write, so two tabs never both get an Undo for one change.
- The restore guards (past dates, a 10 minute window, the expected current state) and the escape's on and off live next to the write they guard, inside the database.
- The same shape as `plan_movie`, `unmark_movie_watched` and the movie restores; the sweep tests and review habits already cover it.

**Cons**:
- Five functions to write, grant by hand, test in pgTAP and keep in step with the TypeScript reducer.
- A rules change touches SQL, generated types and TypeScript together.

### Option 2: Direct PostgREST writes from the Server Actions

The actions upsert, update and delete `user_game_state` directly, reading the row first when an Undo needs it.

**Pros**:
- No new SQL; the table's checks and trigger already refuse every invalid state.
- Fewer moving parts to review.

**Cons**:
- The read for the Undo and the write are two requests, so a second tab can change the row between them and the Undo restores the wrong thing.
- The restores still need the escape, which PostgREST cannot set, so at least the restore functions are needed anyway; the result is a mix of both patterns.

### Option 3: One generic `save_game(p_game_id, p_status, p_rating)` function

A single function handles set, rate and remove (a null status meaning remove), returning the previous row every time.

**Pros**:
- One function to grant and test; one RPC call shape in TypeScript.

**Cons**:
- Every call carries both status and score, so a score change races a status change from another tab and can overwrite it.
- Branching on null to mean removal hides a destructive write behind an ordinary save, which is harder to review and to log.
- It still needs separate restore functions for the escape.

## Rationale

Option 1 is chosen because the two Undo payloads are the load bearing part of this feature, and only a function can read them under the row lock in the same transaction as the write. Option 2 leaves a real race between two tabs (both act on one stale read) and still needs functions for the restores, so it saves nothing. Option 3 trades that race for another (status and score overwriting each other) and makes removal look like a save. Copying the movie stack also means the boundary suites (`private-actions-boundary.test.ts`, `140-security-sweep`) and the reviewers' checklist apply with no new pattern to learn, which matters for a GA feature.

The calls made in the session, each with its runner up:

- **Visitors see nothing in the slot.** Matches the movie and show pages, and keeps "sent to sign in" to the session expired toast. Runner up: show the pills and send a click to sign in, which would make the game page the only title page that does this.
- **Live as soon as it ships, no flag.** Only people who already have a `/games/{id}` URL reach it (the page is `noindex`), and their games show up when G5 ships. Runner up: a `NEXT_PUBLIC_` flag until G5, which adds a variable and a redeploy for little gain.
- **Score picker opens by itself only on a move into Finished.** Finishing is when people rate; starting a game is not. Runner up: open on Playing too, which would mean dismissing it every time.
- **Undo on a move to Want to play only when a score was cleared.** Mirrors unmarking a movie: a toast only when data is lost. The cost is that an unscored move loses its old place on Want to play. Runner up: always offer Undo.
- **Stored early, only undo, never advance.** Before release a game can go back to Want to play, be removed, or lose its score, but cannot move to or between Playing and Finished or gain or change a score. Same as movies. Runner up: no gate once a row is past Want to play, which skips the scope's rule.
- **IGDB checked on status and score, never on removal, clearing or restore.** Removal must work during an IGDB outage and for a game IGDB later hides (AGENTS.md, Games, catalog filter). _Amended after the cross check on 2026-10-24:_ the restores first carried the gate too, which made the Undo of removing an unreleased Playing game always fail; a restore only puts back a state the user had, so it never advances and needs no IGDB. Want to play refuses only an unknown id and accepts a hidden one. Runner up: check only creating writes, which would let a move between existing statuses skip the gate.
- **Movie release wording.** "Releases {date}" or "Release date to be announced", through helpers that share `airStatus` and `UPCOMING_MESSAGES`, so both title pages read alike. Runner up: the shorter "TBA" from the scope note.
- **Removal Undo limited by a removal time in the payload.** The deleted row leaves no `updated_at` to measure from, so `remove_game` returns `removed_at = now()` and the restore accepts it only within 10 minutes and not in the future. A forged time can only bring back the caller's own game. Runner up: no window, which lets a stale tab restore a game removed hours ago.
- **No dates on the game page.** "Finished {month year}" arrives with the G5 cards; G4 stays status and score. Runner up: one date line under the pills.
- **Three glass pills in a group, toggles with `aria-pressed`.** One look across the title pages, and toggle semantics fit "click the pressed one to remove", which a radio group does not. Runner up: a joined segmented bar, a new glass component plus a `/showcase` entry.

Decided while writing (no engineer input needed):

- **Two restore functions, not one.** Undoing a status move is an update guarded on `updated_at`; undoing a removal is an insert guarded on the row's absence. One function branching on which case applies would hide two different guards behind one name. Runner up: one `restore_game` with an optional `p_removed_at`.
- **`BS004` for a score without Playing or Finished.** The app's own SQLSTATE, so the action recognises it without reading a message, like `BS001` for movies. Runner up: reuse `BS001`, which would mix a movie refusal into games.
- **`BS003` mapped to `write_failed` with its own `identity_locked` log outcome.** The functions never send a different id, so reaching it means a bug, and a distinct outcome keeps it from hiding among network failures. Runner up: fold it into `db_error`.
- **`igdb_unavailable` instead of reusing `tmdb_unavailable`.** The toast names the right source, and the movie and game error unions stay separate. Runner up: a shared `catalog_unavailable`, which would mean renaming the movie code.
- **`restore_removed_game` uses `on conflict do nothing` plus `if not found` → `P0002`.** A row that reappeared meanwhile (another tab added the game again) means the Undo is stale, not that it should overwrite. Chosen over catching `unique_violation` in an exception block after the cross check: both raise the same `P0002`, and this form needs no subtransaction, so the escape's `off` is easy to place on every path. Runner up: the exception block.
- **Keep `rate_game` and `BS004`** rather than a filtered PATCH that reads zero rows as `not_started` (the cross check's simpler option), for parity with `rate_movie`, plus a `p_rating between 1 and 10` guard so a direct call cannot clear through it.
- **Score picker opens on a move into Finished only when unscored**, and an unscored pill reads `Rate` (decided after the cross check): a game that already has a score does not need asking again.
- **Release helpers in `lib/catalog/game-page.ts`, delegating to the movie ones' building blocks.** Pure and free of `server-only`, so the slot, the actions and the G5 and G8 cards share one day boundary. Runner up: call `isMovieReleased` directly, whose name would mislead.
