# Planned and watched are exclusive, and a score needs a watch mark

No spec: a movie only rule change decided in grilling (2026-10-10). It reverses spec 0020 AC-14 (a watched movie kept its plan) and rewrites the "removing a watched mark does not delete its rating" rule in `AGENTS.md` section 7 for movies. Branch `feat/movie-plan-watched-exclusive`.

## Goal

A movie is in at most one of two states: **planned** or **watched**. A score lives only on a watched movie.

- Marking watched turns the plan off and opens the score picker.
- Planning a watched movie removes the watch mark and the score, with Undo.
- Unmarking watched removes the score too, with Undo.
- You cannot score an unwatched movie. You can watch without scoring.

Episodes are unchanged.

## Inspected code

- `supabase/schemas/02-tables.sql`: `user_movie_state` (`in_watchlist`, `watched_at`, `rating`, `watchlisted_at`) with independent columns. Its comment cites section 7's rating rule. Partial index `user_movie_state_watchlist_idx … where in_watchlist and watched_at is null`.
- `supabase/schemas/05-functions.sql`:
  - `mark_movie_watched` keeps `in_watchlist` (spec 0020 AC-14).
  - `rate_movie` upserts and marks an unwatched movie watched.
  - `restore_movie_watchlist` re-plans with the 10 minute window.
  - `restore_movie_watched(id, watched_at)` restores only `watched_at`.
  - All are SECURITY INVOKER, have an empty `search_path`, and their grants are hand-carried into migrations.
- `supabase/schemas/03-triggers.sql`: `set_watchlisted_at`, which stamps or keeps the plan time.
- `app/movies/actions.ts`:
  - `setMovieWatchlist` is a plain upsert or update.
  - `setMovieWatched(true)` calls the RPC, and `setMovieWatched(false)` clears only `watched_at`.
  - `setMovieRating(n)` calls `rate_movie`, and `setMovieRating(null)` clears only `rating`.
  - `restoreMovieWatched` and `restoreMovieWatchlist` are the Undo actions.
  - The release gate is `runTrackingWrite`'s `"released"` check (`prompts/movie-release-gate.md`).
- `lib/tracking/intent.ts`: `applyTrackingIntent`, the optimistic mirror of the SQL.
- `components/tracking/movie-tracking-controls.tsx`:
  - Plan, Mark watched and the score popover, with `useOptimistic`.
  - The release gate's `planOnly` branch.
  - No toasts on success, and no Undo.
- `components/tracking/card-bookmark-button.tsx`: plans from a poster card. It knows only `inWatchlist` (`getWatchlistedMovieIds`), not whether the movie is watched.
- `components/library/library-grid.tsx`:
  - The Watched page's Remove calls `setMovieWatched(id, false)`.
  - Its toast says "Your score is kept.".
  - Its Undo calls `restoreMovieWatched(id, watchedAt)`.
- `lib/tracking/messages.ts` (`LIBRARY_MESSAGES.watched.scoreKept`) and `lib/tracking/types.ts` (`MovieTrackingResult` carries no data).
- `lib/catalog/movie-page.ts` / `lib/tracking/library-lists.ts`: a watched movie is on Watched whatever its plan says. This stays correct and becomes moot.
- pgTAP `050-movie-tracking-functions`, `060-watchlisted-at`, `070-movie-restore-functions` pin the old couplings.
- `docs/specs/0020-progress-based-library-pages/index.md` AC-14.

## Skills

- `supabase-postgres-best-practices` and `supabase` for the constraints, functions, migration and pgTAP.
- `next-dev-loop` for the running app check.

## Decisions (settled in grilling, 2026-10-10)

1. **Rules, movies only.**
   - `in_watchlist` and `watched_at` are never both set.
   - `rating` is set only when `watched_at` is set.
   - Episodes keep their current behaviour (Q5).
2. **Mark watched** clears the plan every time, rewatch included. On the movie page, the score picker opens as soon as the click lands (optimistically). Closing it leaves the movie watched with no score. If the write fails, the picker closes, the error toast shows and the state rolls back (Q3, Q7).
3. **The score pill is hidden** until the movie is watched (Q6). The pill row is Plan and Mark watched until then.
4. **Planning a watched movie** clears `watched_at` and `rating`. This applies on the movie page and from a poster card's bookmark (Q2, Q8). A toast says "Moved to your plan. Watched mark and score removed." (or "Watched mark removed." when there was no score), with Undo. Undo restores the old `watched_at` and `rating` and turns the plan off. Planning an unwatched movie shows no toast, as today.
5. **Unmarking watched** clears `rating` too (Q1).
   - On the movie page, a toast shows only when a score was removed: "Score removed too.", with Undo.
   - On the Watched page, the removal toast keeps its Undo. Its second line changes from "Your score is kept." to "Your score was removed too." when there was one.
6. **Undo restores both** the watch mark and the score. It keeps the existing 10 minute window and the release gate. An Undo for an unreleased movie is still refused with `not_released`, as in `prompts/movie-release-gate.md`.
7. **Enforced in Postgres** with two CHECK constraints. Each write that couples fields runs in one statement in a SECURITY INVOKER function, so two tabs cannot race.
8. **Existing rows** are fixed once in the migration, before the constraints are added:
   - planned and watched → keep watched, clear the plan (`in_watchlist = false`, `watchlisted_at` kept as the trigger already does);
   - scored but unwatched → `watched_at = updated_at`.

   No data the user entered is dropped.
9. **The client never sees the old values from the database directly.** The two clearing writes return what they cleared (`watched_at`, `rating`), and the action passes that back for the Undo.

## Design

### Database (`supabase/schemas/` + one generated migration)

- `02-tables.sql`: two new constraints, plus a rewritten table comment.
  - `user_movie_state_plan_or_watched_check check (not (in_watchlist and watched_at is not null))`
  - `user_movie_state_rating_needs_watched_check check (rating is null or watched_at is not null)`
  - The watchlist partial index may drop its now redundant `and watched_at is null`. Keep it as is: it is harmless, and changing it is churn.
- `05-functions.sql`:
  - `mark_movie_watched(id)`: upsert. On conflict, `watched_at = coalesce(s.watched_at, now())` and `in_watchlist = false`.
  - `rate_movie(id, rating)`: plpgsql update only, `where watched_at is not null`. If no row is found, it raises `not_watched` (new SQLSTATE mapping, see below). It never inserts.
  - New `plan_movie(id) returns table (cleared_watched_at timestamptz, cleared_rating smallint)`. It locks the row (`select … for update`) to read the old values, then upserts `in_watchlist = true, watched_at = null, rating = null`, and returns the old values (both null when nothing was cleared or no row existed).
  - New `unmark_movie_watched(id) returns table (cleared_watched_at, cleared_rating)`: the same pattern, setting `watched_at = null, rating = null`. It is an update only and never inserts.
  - `restore_movie_watched(id, watched_at, rating smallint default null)` sets `watched_at`, `rating` and `in_watchlist = false` where `watched_at is null`, with the same bounds and window. The rating check constraint bounds `p_rating`. The signature change means a `drop function` of the old two argument version in the migration.
  - `restore_movie_watchlist`: adds `and watched_at is null` to its `where`, so it can never violate the constraint (a refusal is `undo_expired`).
  - Grants: revoke from `public, anon, authenticated` and grant to `authenticated` for each new or changed function. The `revoke … from anon` lines are carried into the migration by hand, as the earlier migrations do.
- The migration (`supabase db diff`, then hand edits) runs in this order:
  1. Fix the data (decision 8).
  2. Add the constraints.
  3. Drop and recreate the changed functions.
  4. Write the grants.

### Server Actions (`app/movies/actions.ts`)

- `MovieTrackingResult` becomes `{ ok: true; cleared?: { watchedAt: string; rating: number | null } } | { ok: false; error }`. `cleared` is present only when a watch mark was removed. It is the user's own data, for their own session only.
- `setMovieWatchlist(true)` calls `plan_movie`. The `"exists"` check stays. `setMovieWatchlist(false)` is unchanged.
- `setMovieWatched(false)` calls `unmark_movie_watched` and returns `cleared`.
- `setMovieRating(n)` keeps the `"released"` check and calls `rate_movie`. A row that isn't watched returns the new error `not_watched`.
- `restoreMovieWatched(id, watchedAt, rating)`: Zod adds `rating: int 1..10 | null` to `restoreWatchedInputSchema`.
- `runTrackingWrite` gains a way to return the RPC's data. The write step can return `{ data, error }`, and the action maps the data to `cleared`.
- `lib/tracking/types.ts`: `MovieTrackingError` gains `not_watched`, with the copy "Mark it watched before scoring." It only appears on a stale tab or a crafted call. `classifyTrackingError` maps the new SQLSTATE: `rate_movie` raises a custom code such as `P0001` with message `not_watched`, or a dedicated code. The exact choice is made while reading `supabase-error.ts`. As built: `rate_movie` raises `BS001`, which `classifyMovieTrackingError` in `supabase-error.ts` maps to `not_watched` before delegating to `classifyTrackingError`, so the episode and show writes can never return it.

### Optimistic state (`lib/tracking/intent.ts`)

| Intent | Result |
| --- | --- |
| watchlist true | `{ inWatchlist: true, watched: false, rating: null }` |
| watchlist false | `inWatchlist: false` |
| watched true | `{ watched: true, inWatchlist: false }`, rating unchanged (always null by invariant) |
| watched false | `{ watched: false, rating: null }` |
| rating n | sets it only when `watched`; otherwise the state is unchanged |
| rating null | clears it |

### UI

- `movie-tracking-controls.tsx`:
  - The score popover renders only when `optimistic.watched`.
  - `toggleWatched` to true also calls `setPickerOpen(true)` in the same click, and a failed result closes it.
  - Planning or unmarking with a `cleared` result shows the Undo toast (decisions 4 and 5). Undo calls `restoreMovieWatched` and shows the mark and score back optimistically while it runs, like every other click on these controls (the Watched page's Undo stays non-optimistic, since its card needs the server's order). An `undo_expired` result shows "Couldn't undo. Mark it watched again." The release gate branches (`planOnly`, disabled mark) stay.
- `card-bookmark-button.tsx`: a plan result with `cleared` shows the same Undo toast. The card has no other watched UI.
- `library-grid.tsx`: the Watched page Remove uses `cleared.rating` (or the item's rating) for the new second line, and its Undo passes the rating.
- `lib/tracking/messages.ts`:
  - `scoreKept` is replaced by `scoreRemoved: "Your score was removed too."`.
  - New `MOVIE_CLEARED_MESSAGES`: `planned` "Moved to your plan. Watched mark and score removed." / "Moved to your plan. Watched mark removed.", and `unwatched` "Score removed too."
  - New copy for `not_watched`.
- The toasts use the existing sonner setup and `UNDO_ACTION_LABEL`. `use-movie-cleared-undo.ts` holds the page's and the card's shared copy, and `runUndoInToast` with `UNDO_TOAST_MS` in `tracking-toast.ts` is the one Undo runner the page, the card and the Watched page share. On Watched, an unmark that cleared nothing (another tab got there first) shows no score line and no Undo, per decision 9.

### Documentation

- `AGENTS.md` section 7: replace "Watched state and rating are separate…" with a movie rule and an episode rule:
  - Movie: "A movie is either planned or watched, never both: marking watched removes the plan, and planning a watched movie removes its watch mark and score, with Undo. A movie score needs a watch mark; removing the mark removes the score, with Undo. A movie can be watched without a score."
  - Episode: "Episodes keep watched state and rating separate: removing an episode's watched mark does not delete its rating."
- `AGENTS.md` section 8, Movie state: note the two constraints.
- `AGENTS.md` section 9: "a watched movie is on Watched whatever its plan says" becomes "a watched movie is on Watched (it cannot also be planned)".
- `AGENTS.md` section 13 gains item 17: "A movie is never both planned and watched, and a movie score exists only on a watched movie; planning or unmarking offers Undo that restores mark and score."
- `docs/specs/0020-progress-based-library-pages/index.md` AC-14 gets a dated "superseded by prompts/movie-plan-watched-exclusive.md" note.
- Comments in `02-tables.sql`, `05-functions.sql` and `intent.ts` are rewritten to match.

## Expected files

- `supabase/schemas/02-tables.sql`, `05-functions.sql`
- `supabase/migrations/<ts>_movie_plan_watched_exclusive.sql`
- `supabase/tests/050-…`, `060-…`, `070-…` (updated), and maybe a new `170-movie-plan-watched-exclusive.test.sql`
- `lib/supabase/database.types.ts` (`pnpm db:types`)
- `app/movies/actions.ts`, `app/movies/actions.test.ts`
- `lib/tracking/intent.ts` (+ test), `types.ts`, `messages.ts` (+ test), `schemas.ts` (+ test), `supabase-error.ts` (+ test)
- `components/tracking/movie-tracking-controls.tsx` (+ test), `card-bookmark-button.tsx` (+ test), `use-movie-cleared-undo.ts` (new), `tracking-toast.ts`
- `components/library/library-grid.tsx` (+ test)
- `AGENTS.md`, `docs/specs/0020-progress-based-library-pages/index.md`

## Requirements

- R1. The database rejects any row that is planned and watched, or scored and unwatched, whatever the client sends.
- R2. `mark_movie_watched` leaves the plan off and keeps an existing `watched_at`.
- R3. `plan_movie` on a watched row leaves it planned, unwatched and unscored, and returns the old `watched_at` and `rating`.
- R4. `unmark_movie_watched` leaves the row unwatched and unscored, returns the old values, and never inserts.
- R5. `rate_movie` writes only on a watched row. Otherwise it fails with `not_watched` and writes nothing.
- R6. `restore_movie_watched` puts back `watched_at` and `rating` and clears the plan, inside the existing window. A second call is `undo_expired`.
- R7. Each write is idempotent: repeating it gives the same row.
- R8. The movie page, poster card and Watched page behave as decisions 2 to 6 describe. The optimistic state never shows a combination the database would reject.
- R9. RLS and `auth.uid()` ownership stay unchanged. Each function is SECURITY INVOKER, and `anon` cannot execute any of them.

## Security

- No new trust: `user_id` always comes from `auth.uid()`, and the new functions run as the caller under the existing RLS policies.
- The client-supplied `rating` on Undo is Zod-validated (1 to 10 or null) and bounded by the table constraint. It can only restore the caller's own row, within 10 minutes of a change. The caller could write the same value with `rate_movie` anyway once the movie is released and watched.
- `cleared` values go back only to the session that owns them, never into a shared cache.

## Acceptance criteria

- AC-1. On the movie page, marking a planned movie watched turns Plan off and opens the score picker. Closing it leaves the movie watched and unscored.
- AC-2. The score pill is absent on an unwatched movie and appears once it's watched.
- AC-3. Planning a watched, scored movie (page or card) leaves it planned only and shows the toast. Undo brings back the watch mark (original date) and score and turns the plan off.
- AC-4. Unmarking a scored movie (page pill or Watched page Remove) removes the score with the "removed too" copy. Undo restores both.
- AC-5. A crafted `rate_movie` on an unwatched movie fails with `not_watched` and changes nothing.
- AC-6. After the migration, no existing row breaks either constraint, and rows that broke them were fixed as decision 8 says.
- AC-7. Episodes behave exactly as before.
- AC-8. The release gate still holds: an unreleased movie can be planned only, and an Undo that would restore its watch mark is refused with `not_released`.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- `pnpm db:types:check` after `pnpm db:types`.
- `supabase db reset`, then `pnpm test:db`, covering the constraint rejections, each function's row result, the data fix (seed a planned+watched and a scored+unwatched row in the test, apply the fix statements), the grants (no `anon` execute), and cross-user isolation.

## Remote migration

Per `docs/deploy.md`: once approved and verified locally, run `supabase db push` before merging the PR. Ask before the push.

## Manual test steps

Run `pnpm dev:docker` and sign in.

1. Open `/movies/550` with no state. You see Plan and Mark watched and no score pill. Click Plan: it is pressed, and the movie is on `/watchlist?type=movie`.
2. Click Mark watched. Plan unpresses, Watched presses, and the score picker opens. Press Escape. The movie is watched with no score, and the score pill now shows "Not rated". It is on `/watched?type=movie` and not on Watchlist.
3. Open the score pill and pick 8.
4. Click Plan. The toast reads "Moved to your plan. Watched mark and score removed." The movie is planned only, and the score pill is gone. Press Undo: Watched and 8 come back, Plan is off, and `/watched?type=movie` shows it at its original date.
5. Click Watched to unmark it. The toast reads "Score removed too.", and the score pill disappears. Press Undo: watched and 8 are back.
6. On `/watched?type=movie`, click Remove on the movie. The toast reads "Removed from Watched / Your score was removed too." Press Undo: it is back with 8.
7. On `/movies`, find a watched movie's poster card and click its bookmark. You get the same toast as step 4, and Undo works.
8. Crafted call: in a second tab opened before step 5's unmark, pick a score. The toast reads "Mark it watched before scoring.", and nothing changes.
9. An unreleased movie: Plan only, as before. Seed `watched_at` and `rating` in Studio, plan it, then press Undo. The toast reads "This movie hasn't been released yet."
10. Mark an episode watched and rate it, then unmark it. The rating is kept, as before.
11. At 390px width, the toasts and picker fit and the pills wrap cleanly.
