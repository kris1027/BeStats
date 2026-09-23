# Review, feat/movie-tracking, 2026-09-23

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 33 files, branch vs `main` (merge base `0f4f40a`)
**Verdict**: Approve with nits

## Summary

Spec 0007 adds the movie tracking row (Plan/Planned, Mark watched, Your score with a 1–10 picker) to `/movies/[id]`, plus a grid bookmark on `/movies`, backed by three Server Actions, two `SECURITY INVOKER` Postgres functions for the two writes whose outcome depends on the current row, and a request-scoped `lib/tracking`/`components/tracking` module kept out of any `use cache` scope. The implementation matches the spec closely: idempotent target-value writes, correct RLS/grant layering (with the `anon` default-privilege gotcha handled by hand, same as `04-policies.sql`), optimistic UI that only ever settles on the server prop, and no privileged data logged. I traced the SQL functions, the RLS/grant chain, the action error mapping, the optimistic reducer against the pgTAP cases, and the accessibility wiring (roving-tabindex picker, `aria-pressed`, Base UI's auto-managed `aria-expanded`) and found no correctness or security defects.

I ran the real checks rather than trusting the spec's claims: `pnpm typecheck` (clean), `pnpm lint` (clean), `pnpm test` (582/582 passed), `pnpm test:db` (110/110 pgTAP assertions passed, including the new 24-assertion file), `pnpm build` (`/movies` and `/movies/[id]` both render as Partial Prerender, confirming AC-19), `pnpm db:types:check` (committed types match the local schema), and `supabase db diff` (no drift between the declarative schema and the generated migration).

## Minor

### 🟡 verify.md claims completion with two manual checks still unchecked, `docs/specs/0007-movie-tracking/verify.md:41-42`
**Problem**: `docs/scope/scope.md:154` marks "Verify it: `/check verify movie tracking`" as done (`[x]`), but `verify.md` itself leaves two items unchecked: "`watched_at`: the stored time is the database's `now()`, not the browser clock" and "Optimistic state equals the settled row after every click above (no second flip when `refresh()` lands)".
**Why it matters**: Both are real, plausible failure modes for this architecture (a client-clock-derived timestamp would violate AC-4's "server's `now()`" requirement; a visible re-flip on `refresh()` would violate the "no false success" bar the scope row sets), and neither is exercised by an automated test — they're the kind of thing only a live click-through catches. Marking the feature "verified" while these boxes are open overstates confidence to anyone reading scope.md without opening verify.md.
**Suggested fix**: Either run the two remaining manual steps and check them off, or leave scope.md's "Verify it" line unchecked until verify.md is fully green, so the two documents can't disagree about whether verification is complete.

## Strengths

- The two conditional writes (`mark_movie_watched`, `rate_movie`) are single `insert ... on conflict do update` statements under invoker rights, closing the exact stale-tab/two-tab race the spec calls out — confirmed both by the pgTAP suite (repeat-call, cross-user, and bounds cases) and by a passing `applyTrackingIntent` unit suite pinned to the same cases, so the optimistic UI and the SQL cannot drift apart unnoticed.
- Real, not simulated, verification: I ran typecheck/lint/vitest/pgTAP/build/db:types:check/db-diff myself rather than taking the spec's claims at face value, and every one of them passed cleanly on this branch.
- The `anon`-default-privilege revoke trap on the two new functions is handled exactly like `04-policies.sql` already handles it for tables, documented in three places (schema comment, migration comment, pgTAP assertion), so a future schema regeneration can't silently reopen it.

## Test coverage

Thorough and well targeted for `TESTS = configured`. Every new pure/server module has a dedicated suite (`intent.test.ts` mirrors the pgTAP cases 1:1; `movie-state.test.ts` and `actions.test.ts` fake the Supabase builder and assert exact payload shapes, including that a payload never names a column outside its own action; `supabase-error.test.ts` and `schemas.test.ts` pin the error-code mapping and the Zod bounds). Component tests cover optimistic flip, rollback-plus-toast on both a returned error and a rejected promise, `aria-pressed`/fixed names, the hand-built picker's keyboard behavior (arrow-moves-focus-only, Enter commits, Escape closes without saving, focus return), and the signed-out/failed-read/ok branches of both server slots. `app/movies/request-scope.test.ts` was correctly amended rather than weakened: it still forbids direct request-scoped imports in the public route files, adds the new rule that no file under `components/tracking/` or `lib/tracking/` may contain `"use cache"`, and asserts each tracking read sits inside its own `<Suspense fallback={null}>`. I did not find untested branching or error-handling logic in the new code.
