# Review, feat/game-data-model, 2026-10-18

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 15 files, branch vs main (plus uncommitted test and doc edits)
**Verdict**: Approve with nits

## Summary
The change adds the private `user_game_state` table, the `game_status` enum, a trigger that owns every date and pins the row identity, a restore escape for Undo, four owner only policies and hardened grants. The migration matches the declarative schema files, and I found no correctness or security defects. I ran `pnpm test:db` (14 files, 392 tests, all pass), `pnpm db:types:check` (matches) and `pnpm typecheck` (clean) against the running local stack. The remaining findings are about spec wording and a hardening note for G4.

## Minor
### 🟡 Spec contradicts itself on grants to postgres and service_role, `docs/specs/0024-game-data-model-security/index.md` (Security model section)
**Problem**: The Security model says to grant the full set to `postgres` and `service_role`. AC-9 says the grants copy `04-policies.sql` exactly, with no extra grant to those roles. The code follows AC-9.
**Why it matters**: A later reader may add the grant to "fix" the migration, widening access for no reason, since the app never uses `service_role`.
**Suggested fix**: Remove the sentence from the Security model so it matches AC-9 and the code.

### 🟡 The restore escape is only guarded by convention, `supabase/schemas/03-triggers.sql` (set_game_timestamps, the `bestats.restore_game` check)
**Problem**: Any code that can run SQL in the session can set `bestats.restore_game` (the pgTAP tests do it as `authenticated`). With it on, a row can take any date, including future ones, and the checks only require the dates to exist. The safety rests on PostgREST not exposing a way to set it and on G4's restore function validating its arguments.
**Why it matters**: This is accepted in the spec, and it does not break ownership. But if G4 ships a restore function that skips the "dates not after now" and Undo window guards, a user could forge sort order and started or finished dates.
**Suggested fix**: When G4 is built, give it a pgTAP test that its restore function refuses future dates and stale Undo windows, and that it resets the setting to off. Consider a sentence in the trigger comment saying the guards live in G4.

## Nits
- ⚪ `supabase/seed.sql`, the seed sets and resets the escape by hand in its own `begin/commit`. It is transaction local so it is safe, but a comment that says why it is its own transaction would help.
- ⚪ `docs/specs/0024-game-data-model-security/verify.md`, the AC-15 `db push` box is ticked in the diff. I could not verify a cloud push from here, so it is unverified by me.

## Strengths
- The identity pin runs before the restore early return, so even the escape cannot move a row to another user or game, and the update policy WITH CHECK then sees the pinned owner.
- Policies use `(select auth.uid())`, RLS is forced, grants are revoked then re granted exactly, the trigger function is security invoker with an empty search_path and execute revoked, and no new security definer function is added.
- The check constraints hold the score and date rules for every write path, and the tests cover client sent dates, each transition row, upsert shapes, the escape and cross user attempts.

## Test coverage
Strong. `180-game-state.test.sql` covers checks, insert and update date ownership, identity pin, escape, upserts and cascade. `010`, `020` and `030` were extended with raised plans, including no extra index, forced RLS, grants and cross user and anon access. `database.types.test.ts` pins the generated row and enum. No untested new logic found.
