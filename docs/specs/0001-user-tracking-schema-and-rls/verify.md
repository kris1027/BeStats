# Verify: Data model and security policies · spec 0001 · updated 2026-09-20
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

All of this needs the local stack running. Start it with `pnpm exec supabase start`
(Docker or OrbStack must be up first).

## Commands

- [x] `pnpm exec supabase db reset` → applies the one migration and the seed with no error → AC-1
- [x] `pnpm exec supabase db reset && pnpm exec supabase db dump --local -f /tmp/a.sql && pnpm exec supabase db reset && pnpm exec supabase db dump --local -f /tmp/b.sql && diff /tmp/a.sql /tmp/b.sql` → no output, the two dumps are identical → AC-1
- [x] `pnpm test:db` → all files pass, 69 assertions, `Result: PASS` → AC-2 to AC-13
- [x] `pnpm exec supabase db advisors --local` → `No issues found`. Treat as a net, not a proof: the advisors check that row level security is enabled, not that it is forced → AC-2
- [x] `pnpm db:types:check` → `matches the database schema`. Then change any column in `supabase/schemas/02-tables.sql`, regenerate the migration, reset, and rerun → it fails and names the drift → AC-14
- [x] `pnpm typecheck` → passes → AC-14
- [x] `pnpm lint` → passes → AC-14
- [x] Stop the local stack, then `pnpm build` → succeeds with no database reachable → AC-14
- [x] `git grep -n -iE "service_role|sb_secret" -- lib app scripts .env.example ':(glob)*.ts' ':(glob)*.mjs'` → no match outside skill documentation → AC-15. The two root globs matter: `proxy.ts` builds a Supabase client on every request, and an earlier version of this step missed it.
- [x] After `pnpm build`, `grep -r "service_role\|sb_secret" .next/static` → no match → AC-15

## Database checks (psql through the running container)

Run each with:
`docker exec -i supabase_db_BeStats psql -U postgres -d postgres -c "<sql>"`

- [x] `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('user_movie_state','user_show_state','user_episode_state');` → all three rows show `t` and `t`. Forced is the half the advisors do not check → AC-2
- [x] `select tablename, cmd, roles, with_check is not null from pg_policies where schemaname='public' and tablename in ('user_movie_state','user_show_state','user_episode_state');` → twelve rows, four per table, one per command, every one `{authenticated}`, and each UPDATE row showing a with check clause → AC-2, AC-5
- [x] `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('user_movie_state','user_show_state','user_episode_state');` → `anon` and `PUBLIC` appear nowhere; `authenticated` shows exactly SELECT, INSERT, UPDATE, DELETE and no TRUNCATE → AC-4

  This is the one that catches the trap. Supabase's default privileges grant `anon`
  full access the moment a table is created, and the declarative diff engine does
  not emit the revoke. If a future schema change regenerates the migration, check
  this again before trusting it.

## Value sourcing checks

One per row of the spec's Value sourcing table, exercising the edge that breaks if the source is wrong.

- [x] Acting as user A (`set local request.jwt.claims` plus `set local role authenticated`), insert a row with `user_id` set to user B → refused with `42501`. The client does supply `user_id`; the insert policy is what forces it to match the authenticated user, so a forged owner is rejected rather than trusted. The application write path additionally takes the value from the verified session and never from a request field → AC-3
- [x] As user A, update your own row setting `user_id` to user B → refused with `42501`. Without the update policy's with check clause this would silently move the row → AC-5
- [x] Insert a row with an explicit old `updated_at`, then update any other column → `updated_at` jumps to now without the write path setting it → AC-12
- [x] On the same row, update `status_source` only → `status_changed_at` does not move. Then update `status` → it does move → AC-12
- [x] Upsert an episode sending only `watched_at`, on an episode that already carries a rating → the rating survives. Send the full row instead and it does not: this is the partial write rule, and the most likely way to break AC-6 and AC-10 → AC-6, AC-10
- [x] Upsert the same movie twice with different ratings → one row, carrying the later rating → AC-6
- [x] Clear `watched_at` to null on a rated movie → the rating is untouched. Clear `rating` to null → the rest of the row is untouched → AC-10
- [x] Insert a rating of 0, then 11, then -3 → each rejected with `23514` by the database itself, not by Zod → AC-7
- [x] Insert a status of `binging`, then a `status_source` of `robot` → each rejected with `22P02` → AC-8
- [x] Insert `season_number` 0 → accepted, so specials are storable. Insert -1, and `episode_number` 0 → each rejected → AC-9
- [x] Insert an episode row for a show id with no `user_show_state` row → succeeds. Episode history must not depend on a status existing → AC-13
- [x] `delete from auth.users where id = '22222222-2222-2222-2222-222222222222'` → no rows remain for that id in any of the three tables → AC-11
- [x] As `anon` (`set local role anon`), select and insert on each table → permission error `42501`, not an empty result. An empty result would mean only row level security is stopping it → AC-4

## Acceptance-criteria coverage

- AC-1 covered by the reset, double reset diff and structure tests
- AC-2 covered by the advisors run, the forced RLS query, the policy query and `020-security-configuration.test.sql`
- AC-3 covered by `030-cross-user-isolation.test.sql` and the session ownership check
- AC-4 covered by the privilege query, the anon behaviour check and `020`
- AC-5 covered by the reassignment checks and the update policy with check assertion
- AC-6 covered by the repeated upsert and repeated season upsert checks
- AC-7 covered by the rating bound checks
- AC-8 covered by the enum rejection checks
- AC-9 covered by the season and episode number checks
- AC-10 covered by the clearing checks
- AC-11 covered by the account deletion check
- AC-12 covered by the two trigger timing checks
- AC-13 covered by the orphan episode check
- AC-14 covered by `pnpm db:types:check`, `pnpm typecheck` and the offline build
- AC-15 covered by the source grep and the bundle grep

## Not covered here

- Behaviour through PostgREST and the Supabase server client, rather than through
  psql. The policies are the same either way, but the session plumbing is scope
  feature 6's, so an end to end check waits for authentication to exist.
- Anything against a deployed Supabase project. Everything above is local only.
