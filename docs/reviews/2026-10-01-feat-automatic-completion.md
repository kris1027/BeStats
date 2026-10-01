# Review, feat/automatic-completion, 2026-10-01

**Reviewed by**: Sonnet 5.5 (author on same family; fresh context)
**Scope**: 31 tracked files changed plus 13 untracked, branch vs main
**Verdict**: Approve with nits

## Summary
Implements spec 0015: a pure `completionVerdict` rule, an `applyAutoCompletion` server module, two invoker SQL functions, two reopen triggers on `user_episode_state`, visit checks on the show page and `/upcoming`, the AC-19 pin in `set_show_status`, and the toasts and focus handling. The core invariants hold: partial or failed TMDB reads never complete or reopen, the database re-verifies watched ids with `for share`, user and source are never client supplied, and grants and RLS follow the project pattern. `pnpm typecheck`, `pnpm test` (1532 passed) and `pnpm lint:ci` ran clean here; pgTAP was not run. No blockers or majors, only minor robustness and performance notes.

## Minor
### 🟡 Possible lock-order deadlock between completion and a many-row unmark, `supabase/schemas/05-functions.sql` (complete_show_automatically, `for share` select)
**Problem**: `complete_show_automatically` takes share locks on episode rows in plan order, then updates `user_show_state`. A season unmark updates episode rows one by one (exclusive) and its trigger then updates the same `user_show_state` row. Two concurrent transactions touching overlapping episode rows in different order can wait on each other.
**Why it matters**: Postgres resolves it by aborting one transaction, so rarely an unmark or a check fails with a `40P01` and shows the generic error toast. Needs two concurrent requests from one user (two tabs), so low likelihood.
**Suggested fix**: Add `order by s.episode_id` to the locking select so lock order is deterministic, or document the accepted risk; the unmark path would need the same ordering to be fully safe.

### 🟡 Visit check reads every season of every system show, with no cheap gate, `lib/tracking/auto-completion.ts:~240` (reconcileUpNextShows) and `applyAutoCompletion`
**Problem**: The write trigger gates on `getTvShow().status` before reading seasons, but the visit trigger goes straight to `getShowEpisodes` for every `watching`/`completed` system row, uncapped. For a `watching` show whose TMDB status is not Ended/Canceled the verdict can only be `none`.
**Why it matters**: `/upcoming` blocks on this. A heavy user with a cold cache issues seasons x shows TMDB calls before Up Next renders (measured 2.3 s for 40 shows, spec accepts it). Cost grows linearly with tracked shows.
**Suggested fix**: For `watching` rows on a visit, use the same one-call `getTvShow` status gate first; only read episodes when the status is finished. Completed rows still need the full read.

### 🟡 Reopen downgrades a `user` Watching to `system`, `supabase/migrations/20260930120100_reopen_completed_show.sql:26` and `20260930120000_...sql:~100`
**Problem**: A `watching`/`user` row completed by the user's own finishing write becomes `completed`/`system`; an Undo or unmark then reopens it as `watching`/`system`. The user's choice of Watching is lost, and a later visit can complete it without a new write (AC-14 says a user Watching changes only through the write trigger).
**Why it matters**: Matches the spec's transition table, but it quietly weakens the "your choices stay yours" promise after an Undo. Low impact (the show is still fully watched at that point).
**Suggested fix**: Confirm intent in the spec; if unwanted, leave the source as is on reopen of rows that were `user` before completion (would need a stored marker), or note it in rationale.

### 🟡 Non TMDB errors misclassified as `db_error`, `lib/tracking/auto-completion.ts` (tmdbFailure)
**Problem**: `tmdbFailure` rethrows any non `TmdbError`; the outer `catch` then logs `db_error`. A TMDB-side bug would be reported as a database failure.
**Why it matters**: Misleading log class when debugging; behaviour (no change) is still safe.
**Suggested fix**: Return a distinct outcome (or `tmdb_unavailable`) instead of rethrowing.

## Nits
- ⚪ `lib/tracking/auto-completion.ts` (reconcile worker), `Promise.allSettled` over a one element array adds nothing since `applyAutoCompletion` never throws after `requireUser`; a plain await in try/catch reads clearer.
- ⚪ `supabase/schemas/05-functions.sql` (set_show_status section comment), the edited comment line is now far over the file's wrap width.
- ⚪ `docs/specs/0015-automatic-completion/index.md`, status still "In Progress" while `verify.md` is fully checked.

## Strengths
- The rule lives in one pure function with the cheap-gate ordering in the server module, so a partial TMDB read can never complete or reopen a show; unit tests cover every table row.
- Defence in depth: the database re-confirms every eligible id is watched under `for share`, grants are revoked from public/anon, user id comes from `auth.uid()`/`old` row, and reopen is a table trigger so every unmark path is covered.
- Schema files, migrations, regenerated types and pgTAP (010, 030, 080, 090, new 130) are kept in sync; focus management on Up Next is thoughtfully handled and tested.

## Test coverage
Vitest covers `completionVerdict`, `applyAutoCompletion` (gating, failures, concurrency), messages, actions, the season store, status control and the Up Next button focus. pgTAP 130 covers guards, triggers, cascades and cross-user isolation (030 extended). Not covered by an automated test: the concurrent complete-vs-unmark lock ordering and a visit-check race where the watched ids snapshot is stale (self-heals on the next visit). pgTAP was not executed in this review.
