-- Row level security and table privileges.
--
-- AGENTS.md section 11 makes Postgres, not routing, the security boundary.
-- Every table here holds private user owned data; none of it is public.
--
-- Two independent locks are applied on purpose:
--
--   1. Privileges. `authenticated` is granted exactly the four commands it
--      needs; `anon` and `public` are revoked from explicitly. The revoke is
--      not tidiness: Supabase's default privileges on the `public` schema can
--      already grant these commands to `anon` on a new table, so never writing
--      a grant leaves a live grant that only row level security is masking.
--      With the privilege gone, a moment with RLS disabled for debugging does
--      not hand `anon` the whole table.
--   2. Row level security, enabled *and* forced, with one policy per command.
--      Forced means the rules apply even to the table owner.
--
-- Policy shape, per the `supabase` skill's security checklist:
--   - `to authenticated` alone is authentication without authorization, so
--     every policy also carries the ownership predicate.
--   - `(select auth.uid())` rather than bare `auth.uid()` so the value is
--     computed once per statement instead of once per row.
--   - update carries both `using` and `with check`; without `with check` a
--     person could hand their row to someone else.

alter table public.user_movie_state enable row level security;
alter table public.user_movie_state force row level security;
alter table public.user_show_state enable row level security;
alter table public.user_show_state force row level security;
alter table public.user_episode_state enable row level security;
alter table public.user_episode_state force row level security;

revoke all on table public.user_movie_state from anon, public;
revoke all on table public.user_show_state from anon, public;
revoke all on table public.user_episode_state from anon, public;

-- `authenticated` is revoked from as well, then granted back only the four
-- commands. The same default privileges that reach `anon` also hand
-- `authenticated` TRUNCATE, MAINTAIN, TRIGGER and REFERENCES, and a bare
-- `grant` adds to those rather than replacing them. TRUNCATE is the dangerous
-- one: it empties a table without consulting row level security at all.
revoke all on table public.user_movie_state from authenticated;
revoke all on table public.user_show_state from authenticated;
revoke all on table public.user_episode_state from authenticated;

grant select, insert, update, delete on table public.user_movie_state to authenticated;
grant select, insert, update, delete on table public.user_show_state to authenticated;
grant select, insert, update, delete on table public.user_episode_state to authenticated;

-- user_movie_state

create policy "Users select their own movie state"
  on public.user_movie_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own movie state"
  on public.user_movie_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own movie state"
  on public.user_movie_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own movie state"
  on public.user_movie_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- user_show_state

create policy "Users select their own show state"
  on public.user_show_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own show state"
  on public.user_show_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own show state"
  on public.user_show_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own show state"
  on public.user_show_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- user_episode_state

create policy "Users select their own episode state"
  on public.user_episode_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own episode state"
  on public.user_episode_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own episode state"
  on public.user_episode_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own episode state"
  on public.user_episode_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Both trigger functions: Postgres grants EXECUTE to PUBLIC on every new
-- function, so narrow them here too. They return `trigger`, which Postgres
-- refuses to call directly, so this is tidiness rather than a live hole.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_status_changed_at() from public, anon, authenticated;

-- Caveat worth knowing before you edit this file. The declarative diff engine
-- does not track grants that come from Supabase's default privileges, so the
-- revokes above generate no SQL of their own. Without them written into the
-- migration by hand, `anon` ends up with full read and write on all three
-- tables the moment they are created, and `authenticated` keeps TRUNCATE. The
-- generated migration was corrected by hand for exactly this, and the pgTAP
-- suite asserts the outcome so a future regeneration cannot quietly undo it.
-- Both revokes are written here anyway, so the next person regenerating the
-- migration reads the intent from the declarative source rather than having to
-- rediscover it from the old migration's diff.
