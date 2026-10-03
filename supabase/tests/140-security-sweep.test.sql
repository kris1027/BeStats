-- Scope feature 19 (AGENTS.md section 13, items 3, 4 and 15): the whole
-- `public` schema, swept from the catalog.
--
-- 020 to 131 each prove the objects their own spec created, by name. That is
-- the right shape for behaviour and the wrong one for a boundary: a table, view
-- or function a later migration adds is exactly the one no named list
-- mentions, and Supabase's default privileges hand `anon` every new object in
-- `public` unless a migration takes it back. So this file names nothing. Every
-- assertion is a query for offenders, and `is_empty` prints any it finds.
--
-- Objects that belong to an extension are not ours to police and are left out
-- through `pg_depend`.

begin;
select plan(13);

-- The sweep must see something, or every empty result below is vacuous.
select ok(
  (select count(*) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') >= 3,
  'the sweep sees the user tables, so an empty offender list means something'
);
select ok(
  (select count(*) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prorettype <> 'trigger'::regtype) >= 10,
  'the sweep sees the callable functions too'
);

-- Tables: row level security enabled and forced (AGENTS.md section 11). Forced
-- matters because without it the policies skip the table owner.
select is_empty(
  $$select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not (c.relrowsecurity and c.relforcerowsecurity)$$,
  'every table in public has row level security enabled and forced'
);

-- A table with RLS on but no policy for a command silently refuses that
-- command; one with a policy that is not tied to auth.uid() leaks. Both are
-- caught by asking for the four commands, each predicated on the owner.
select is_empty(
  $$select c.relname::text || ' ' || w.command
    from pg_class c
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as w(command)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.cmd = w.command
          and p.roles::text[] = array['authenticated']
          and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%auth.uid()%'
      )$$,
  'every table has an owner policy for each of the four commands, for authenticated only'
);

-- Policies are OR'd, so one aimed at anon or PUBLIC widens access no matter
-- how tight the others are.
select is_empty(
  $$select tablename::text || ' ' || policyname::text from pg_policies
    where schemaname = 'public'
      and roles::text[] <> array['authenticated']$$,
  'no policy in public is granted to anyone but authenticated'
);

-- Ownership is a real foreign key, so a deleted account takes its rows with it
-- and no row can name a user who does not exist.
select is_empty(
  $$select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_constraint k
        join pg_attribute a
          on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
        where k.conrelid = c.oid
          and k.contype = 'f'
          and k.confrelid = 'auth.users'::regclass
          and k.confdeltype = 'c'
          and a.attname = 'user_id'
      )$$,
  'every table carries a user_id that references auth.users and cascades on delete'
);

-- Views: a view runs as its owner unless told otherwise, and the owner is the
-- one role RLS would not apply to without `force`. security_invoker makes the
-- reader's own policies apply.
select is_empty(
  $$select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('v', 'm')
      and not coalesce('security_invoker=true' = any(c.reloptions), false)$$,
  'every view in public runs with the reader''s rights'
);

-- The privilege layer under RLS. anon is a signed out visitor and owns no
-- data, so it must hold nothing on any table or view, whatever RLS says.
select is_empty(
  $$select c.relname::text || ' ' || priv
    from pg_class c
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                            'TRUNCATE', 'REFERENCES', 'TRIGGER']) as priv
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, priv)$$,
  'anon holds no privilege on any table or view in public'
);

-- TRUNCATE skips row level security entirely, so authenticated must never
-- hold it, nor anything beyond the four commands the app uses.
select is_empty(
  $$select c.relname::text || ' ' || priv
    from pg_class c
    cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) as priv
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('authenticated', c.oid, priv)$$,
  'authenticated holds no truncate, references or trigger privilege in public'
);

-- Functions: security definer runs as the owner and would step around the
-- caller's policies. Every function here is security invoker by design.
select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )$$,
  'no function in public is security definer'
);

-- An unpinned search_path lets a caller shadow a table or operator the
-- function names.
select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) as setting
        where setting like 'search_path=%'
      )
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )$$,
  'every function in public pins its search_path'
);

-- Every function a client can call over the API is refused to anon at the
-- privilege layer. Trigger functions are left to the next assertion: Postgres
-- refuses to run one as a plain call, whoever holds EXECUTE.
select is_empty(
  $$select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )$$,
  'anon can execute no callable function in public'
);

-- Proof that a trigger function anon can reach is still not a way in: the
-- direct call fails before the body runs.
set local role anon;
select throws_ok(
  $$select public.reopen_completed_show()$$,
  '0A000',
  null,
  'a trigger function cannot be called directly, even by a role holding execute'
);
reset role;

select * from finish();
rollback;
