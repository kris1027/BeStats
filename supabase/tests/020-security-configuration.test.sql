-- Spec 0001 AC-2 and AC-4, the configuration half of the security boundary.
--
-- These assert the shape of the lock rather than trying the door. The
-- behavioural half is in 030. Both are needed: `supabase db advisors` checks
-- that row level security is enabled but not that it is forced, and it says
-- nothing about the privilege layer underneath, so these assertions are the
-- only place the full requirement is actually proven.

begin;
select plan(11);

-- Row level security enabled AND forced. Forced is the half nothing else
-- checks: without it the rules do not apply to the table owner.
select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and c.relrowsecurity
  ),
  3::bigint,
  'row level security is enabled on all three tables'
);
select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and c.relforcerowsecurity
  ),
  3::bigint,
  'row level security is forced on all three tables, so it applies to the owner too'
);

-- Exactly four policies per table, one per command, no more and no fewer. An
-- extra policy is as much a finding as a missing one: policies are OR'd, so a
-- fifth could widen access without touching the four below.
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
  ),
  12::bigint,
  'twelve policies exist in total, four per table'
);
select is(
  (
    select count(distinct (tablename, cmd)) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
  ),
  12::bigint,
  'each table carries one policy per command, with no command covered twice'
);

-- Every policy targets `authenticated` and nothing else. `to public` would
-- hand the policy to anon as well.
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and roles::text[] = array['authenticated']
  ),
  12::bigint,
  'every policy targets the authenticated role only'
);

-- `to authenticated` alone is authentication without authorization. Every
-- policy must also carry the ownership predicate.
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
      and coalesce(qual, '') || coalesce(with_check, '') like '%user_id%'
  ),
  12::bigint,
  'every policy predicates on auth.uid() against user_id'
);

-- The subselect form, so auth.uid() is evaluated once per statement rather
-- than once per row.
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and coalesce(qual, '') || coalesce(with_check, '') like '%SELECT auth.uid()%'
  ),
  12::bigint,
  'every policy wraps auth.uid() in a subselect so it runs once per statement'
);

-- Without `with check` on update, a person could hand a row to someone else.
-- This is the configuration half of AC-5.
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and cmd = 'UPDATE'
      and qual is not null
      and with_check is not null
  ),
  3::bigint,
  'every update policy carries both a using and a with check clause'
);

-- AC-4's second half. The `anon` refusal must not depend on row level security
-- staying enabled, so the privilege itself must be absent. This is the
-- assertion that catches Supabase default privileges quietly regranting anon
-- on a newly created table.
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and grantee in ('anon', 'PUBLIC')
  ),
  0::bigint,
  'anon and public hold no privilege at all on any of the three tables'
);
select is(
  (
    select count(*)
    from unnest(array['user_movie_state', 'user_show_state', 'user_episode_state']) as t(tbl),
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
    where has_table_privilege('anon', ('public.' || t.tbl)::regclass, p.priv)
  ),
  0::bigint,
  'anon can exercise none of select, insert, update, delete or truncate'
);

-- Least privilege the other way: authenticated gets exactly the four commands
-- the application needs. TRUNCATE in particular bypasses row level security
-- entirely, so it must not be here.
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and grantee = 'authenticated'
      and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  0::bigint,
  'authenticated holds nothing beyond select, insert, update and delete'
);

select * from finish();
rollback;
