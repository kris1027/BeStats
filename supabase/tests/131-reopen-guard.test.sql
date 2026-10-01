-- Spec 0015 AC-10 and AC-16: a visit reopen is confirmed by the database.
--
-- `reopen_show_automatically(p_show_id, p_episode_ids)` reopens a show TMDB
-- still says is finished only when one of the sent ids is not watched by the
-- caller, so a visit that read the watched ids before another tab marked the
-- finale cannot undo the completion that tab stored. A null list (the
-- default) is the reason that does not depend on watched state, TMDB no
-- longer saying finished, and reopens unchecked.
--
-- Shows 991001 to 991009 and episodes 996001 to 996099 are free for user A in
-- this file; show 991010 and episode 996101 belong to user B. Fixtures are
-- written as `postgres` with `session_replication_role = replica`, as
-- `130-automatic-completion.test.sql` does, and the whole file rolls back.

begin;
select plan(16);

-- Shape (AC-17)

select is(
  (select count(*)::int from pg_proc
   where oid = 'public.reopen_show_automatically(integer, integer[])'::regprocedure
     and not prosecdef
     and proconfig = array['search_path=""']),
  1,
  'reopen_show_automatically is security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.reopen_show_automatically(integer, integer[])', 'execute')
  and not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.reopen_show_automatically(integer, integer[])'::regprocedure
      and a.grantee = 0
  )
  and has_function_privilege('authenticated', 'public.reopen_show_automatically(integer, integer[])', 'execute'),
  'only authenticated can execute reopen_show_automatically'
);
select is(
  (select count(*)::int from pg_proc
   where proname = 'reopen_show_automatically'
     and pronamespace = 'public'::regnamespace),
  1,
  'the unguarded one argument version is gone'
);

-- Fixtures
set local session_replication_role = replica;
delete from public.user_episode_state where show_id between 991001 and 991010;
delete from public.user_show_state where show_id between 991001 and 991010;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at, updated_at, status_changed_at)
values
  -- Every sent id watched: the finale was marked in another tab.
  ('11111111-1111-1111-1111-111111111111', 991001, 'completed', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  -- One sent id unwatched (a row with only a rating), one with no row.
  ('11111111-1111-1111-1111-111111111111', 991002, 'completed', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 991003, 'completed', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  -- Null: TMDB no longer says finished.
  ('11111111-1111-1111-1111-111111111111', 991004, 'completed', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  -- Rows the reopen must never move.
  ('11111111-1111-1111-1111-111111111111', 991005, 'completed', 'user', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 991006, 'watching', 'system', '2020-01-01T00:00:00Z', '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 991007, 'on_hold', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 991010, 'completed', 'system', null, '2020-06-01T00:00:00Z', '2020-06-01T00:00:00Z');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 996001, 991001, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 996002, 991001, 1, 2, '2021-01-02T00:00:00Z', 7),
  ('11111111-1111-1111-1111-111111111111', 996011, 991002, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 996012, 991002, 1, 2, null, 6),
  ('11111111-1111-1111-1111-111111111111', 996021, 991003, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 996041, 991004, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 996051, 991005, 1, 1, null, null),
  ('11111111-1111-1111-1111-111111111111', 996061, 991006, 1, 1, null, null),
  ('11111111-1111-1111-1111-111111111111', 996071, 991007, 1, 1, null, null),
  -- User B's own unwatched row on B's show.
  ('22222222-2222-2222-2222-222222222222', 996101, 991010, 1, 1, null, null);
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- Every sent id watched: nothing to reopen (AC-16).
select is(
  public.reopen_show_automatically(991001,array[996001, 996002, 996001]),
  false,
  'a reopen whose ids are all watched reports false'
);
select is(
  (select status::text || '/' || status_source::text || '/'
     || (updated_at = '2020-06-01T00:00:00Z' and status_changed_at = '2020-06-01T00:00:00Z')::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 991001),
  'completed/system/true',
  'and writes nothing: the completion another tab stored stands'
);

-- One unwatched id reopens.
select is(
  public.reopen_show_automatically(991002, array[996011, 996012]),
  true,
  'one id that is only rated, not watched, reopens'
);
select is(
  public.reopen_show_automatically(991003, array[996021, 996022]),
  true,
  'one id with no row at all reopens'
);
select is(
  (select string_agg(status::text || '/' || status_source::text, ',' order by show_id)
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and show_id in (991002, 991003)),
  'watching/system,watching/system',
  'both are Watching set by the system'
);

-- Null, or the argument left out: reopens without the check.
select is(
  public.reopen_show_automatically(991004, null),
  true,
  'a null list reopens even though every episode is watched'
);
select is(
  public.reopen_show_automatically(991004),
  false,
  'the default is null, and a second call writes nothing'
);

-- Rows the reopen never moves, with and without ids.
select is(
  (select count(*)::int from (values
     (public.reopen_show_automatically(991005, array[996051])),
     (public.reopen_show_automatically(991006, array[996061])),
     (public.reopen_show_automatically(991007, null)),
     (public.reopen_show_automatically(991008, array[996081])),
     (public.reopen_show_automatically(991010, array[996101])),
     (public.reopen_show_automatically(991010, null))
   ) as calls(reopened) where reopened),
  0,
  'a Completed the user chose, a Watching, an On Hold, no row and user B''s row never reopen'
);

reset role;
select is(
  (select string_agg(status::text || '/' || status_source::text, ',' order by show_id)
   from public.user_show_state
   where show_id in (991005, 991006, 991007, 991008, 991010)),
  'completed/user,watching/system,on_hold/system,completed/system',
  'each keeps its status, user B''s included, and no row is inserted'
);
set local role authenticated;

-- Invalid input (the same rules as complete_show_automatically).
select throws_ok(
  $$ select public.reopen_show_automatically(0, array[996001]) $$,
  '23514', null, 'a show id that is not positive is refused'
);
select throws_ok(
  $$ select public.reopen_show_automatically(991001, array[]::integer[]) $$,
  '22023', null, 'an empty list is refused'
);
select throws_ok(
  $$ select public.reopen_show_automatically(991001, array[996001, null]) $$,
  '22023', null, 'a null id is refused'
);
select throws_ok(
  $$ select public.reopen_show_automatically(991001, array(select generate_series(1, 20001))) $$,
  '22023', null, 'more than 20000 ids are refused'
);

select * from finish();
rollback;
