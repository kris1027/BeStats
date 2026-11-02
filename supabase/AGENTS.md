# supabase

The database: declarative schema in `schemas/` (`schema_paths` in `config.toml`), the migrations generated from it in `migrations/`, pgTAP suites in `tests/`. Load the `supabase-postgres-best-practices` skill before changing any of it. Governed by specs 0001 and 0024.

## Data model

- One table per media shape, so a TMDB movie ID and TV ID never collide; each primary key is `(user_id, <external id>)`, which makes repeated writes idempotent.
- Movie row: planned flag, watched timestamp, optional 1 to 10 rating. Checks: never planned and watched at once; a rating needs a watched timestamp.
- Episode row: TMDB episode ID plus show ID, season and episode number for ordering, watched timestamp, optional 1 to 10 rating.
- `user_show_state`: `user_id`, `show_id`, `tracked_at` and timestamps, nothing more. The spec 0020 contract migration (`20261010120000_show_tracking_contract.sql`) dropped the status columns, the `tv_status`, `status_source` and `show_hold` enums and every status function; `user_tracked_shows` is the one view.
- `user_game_state`: one row per user and game with `status` (`game_status` enum), `rating`, and `added_at`, `started_at`, `finished_at`. Checks: a rating only on Playing or Finished, and each of those has its timestamp.
- No catalog metadata and no season or show rating is stored; both are derived at read time.
- `profiles` holds only the username ([prompts/account-username.md](../prompts/account-username.md)): unique ignoring case, changeable once per rolling week, both enforced in the database (trigger `guard_username_change`, SQLSTATE `BS002`). Only its owner sees it. `public.username_available(text)` is the one `security definer` function and the one `anon` may call, a named exception in `tests/140-security-sweep.test.sql`.

## Security

RLS is on for every user-owned table; policies constrain select, insert, update and delete to `auth.uid()`, including the `with check` on new rows. `tests/030-cross-user-isolation` and `140-security-sweep` prove it; extend them with every new table or function.

## Workflow

- Change `schemas/`, add the matching migration, then regenerate types with `pnpm db:types` (`pnpm db:types:check` confirms they match).
- `pnpm test:db` runs pgTAP against the local stack (`pnpm dev:docker`). Leftover verify fixtures fail 030 and 040, so `supabase db reset` first.
- Remote: `supabase db push` before merging the PR that adds the migration; auth settings only through `supabase config push`. Both apply without a prompt from an agent shell, so run them only once approved ([docs/deploy.md](../docs/deploy.md)).
