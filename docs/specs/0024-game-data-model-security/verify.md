# Verify: Game data model and security policies · spec 0024 · updated 2026-10-18
_Steps come from the acceptance criteria in spec 0024. `/check verify` runs these, and `/test` locks in the ones worth keeping._

## Commands
- [x] `pnpm exec supabase db reset` then `pnpm test:db` → all files pass, including `180-game-state.test.sql`; `140-security-sweep` unchanged → AC-1 to AC-13
- [x] `pnpm exec supabase db diff` after the reset → "No schema changes found" → AC-13
- [x] `pnpm db:types:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` → all pass; `lib/supabase/database.types.test.ts` pins the game row and `Enums.game_status` → AC-14
- [x] `docker exec supabase_db_BeStats psql -U postgres -c "select game_id, status, added_at, started_at, finished_at from public.user_game_state order by 1"` after a reset → three seed rows with the fixed 2026-08 and 2026-09 dates, not today (the seed went in under the restore escape) → AC-7
- [x] `supabase db push` against the linked project, per `docs/deploy.md`, once the PR is approved → the migration is listed as applied → AC-15

## Direct API (PostgREST, local stack, signed in as seed user A with `password-a`)
- [x] POST `/rest/v1/user_game_state` `{ user_id: <A>, game_id: 500, status: "playing", added_at: "2000-01-01" }` → returned row has `added_at` and `started_at` equal to now, not 2000 → AC-4, Value sourcing (dates come from the trigger)
- [x] PATCH that row with `{ status: "finished" }` → `finished_at` is now, `started_at` unchanged → AC-5
- [x] PATCH it with `{ status: "want_to_play" }` while it has a score → refused with `23514`; with `{ status: "want_to_play", rating: null }` → succeeds, `added_at` moves to now → AC-2, AC-5
- [x] POST with `user_id` set to user B → refused with `42501` → AC-9, AC-10, Value sourcing (`user_id` comes from the session)
- [x] PATCH your own row with `{ user_id: <B>, game_id: 999 }` → succeeds, row still belongs to A with its old game id → AC-6
- [x] GET `/rest/v1/user_game_state` as A → only A's rows; with only the anon key → permission denied (`42501`) → AC-9, AC-10
- [x] POST the same upsert (`Prefer: resolution=merge-duplicates`) twice → one row, dates unchanged by the second → AC-8

## Acceptance criteria coverage
- AC-1: 010 (table, columns, key, enum order), 180 (game id check)
- AC-2, AC-3: 180 checks and the Want to play cases
- AC-4, AC-5: 180 insert and update transition cases
- AC-6: 180 game id pin, 030 user id pin
- AC-7: 180 restore escape cases, seed query above
- AC-8: 180 upsert shapes
- AC-9: 020, 180 (trigger function execute)
- AC-10: 030 game block
- AC-11: 180 cascade
- AC-12: 010 no extra index
- AC-13: db diff and test:db commands
- AC-14: types check, typecheck, lint
- AC-15: db push (applied 2026-10-18)
