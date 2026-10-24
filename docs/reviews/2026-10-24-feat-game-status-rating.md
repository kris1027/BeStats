# Review, feat/game-status-rating, 2026-10-24

**Reviewed by**: Claude Sonnet 5.5 (author on the same model family, fresh context)
**Scope**: about 40 files, branch vs main (plus 3 untracked test files)
**Verdict**: Approve with nits

## Summary
The change adds the game status pills and score on the game page, five security invoker SQL functions, and five Server Actions that parse, check the session, check IGDB and the release day, write under the user's JWT and refresh. I found no bugs and no security problems. The SQL, the actions and the optimistic reducer agree with each other and with the spec. The vitest run for the changed areas passes (531 tests) and typecheck passes. I did not run pgTAP or the build.

## Minor
### 🟡 Unsafe casts on RPC rows, `app/games/actions.ts:188` and `app/games/actions.ts:273`
**Problem**: The `prev_*` and `removed_*` rows are read with an `as` cast because the generated types mark nullable columns as not null.
**Why it matters**: If a column name changes in the SQL, the cast hides it from the compiler and the Undo silently stops appearing.
**Suggested fix**: Parse the row with a small Zod schema, or add a test that fails when the cast shape and the generated type drift.

### 🟡 Clearing a score bumps `updated_at`, `app/games/actions.ts:248`
**Problem**: The plain update that clears a score also fires when the row is Want to play or already unscored, and moves `updated_at`.
**Why it matters**: `restore_game_status` uses `updated_at` for its 10 minute window, so a stale tab clicking Clear rating can extend an old Undo. Harmless (own row only) but surprising.
**Suggested fix**: Add `.not("rating", "is", null)` to the update so it only touches a scored row.

### 🟡 Spec and code differ on parameter order, `supabase/migrations/20261024120000_game_tracking_functions.sql:152`
**Problem**: The spec table lists `restore_game_status(game, status, rating, added_at, ...)`, but the function takes `p_added_at` before `p_rating`. The spec also says "four" functions in places and lists five.
**Why it matters**: A later reader following the spec could call it positionally and swap values. The app uses named arguments, so nothing breaks today.
**Suggested fix**: Update the spec text to match the migration.

## Nits
- ⚪ `components/tracking/game-status-control.tsx:121`, the picker is opened with `setPickerOpen(true)` outside the transition; fine today, but a comment on why it is safe would help.
- ⚪ `app/games/actions.ts:96`, the catch drops all error detail, including non IGDB bugs rethrown by `readGame`; they log as `db_error`, which can mislead. Consider a separate outcome.

## Strengths
- Row lock plus read plus write in one SQL function gives a correct Undo payload under two tabs, and the escape setting is turned off on every path, including before a raise.
- Release gate, hidden game rules and "restores never call IGDB" are exactly as the spec says, and the boundary test registers every new action.
- Grants are written by hand and asserted in pgTAP 020; the migration and schema file bodies are identical.

## Test coverage
Good. Actions, reducer, schemas, error classification, the control, the slot, the release helpers and the SQL functions each have tests, including failure and release gate cases. Only gap: nothing pins the `as` casts to the generated types (see Minor).
