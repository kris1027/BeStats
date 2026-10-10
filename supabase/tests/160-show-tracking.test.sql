-- Spec 0020 AC-1, AC-3 to AC-5, AC-19, AC-20 (amended 2026-10-10): tracking
-- a show.
--
-- Pins the three tracking functions, the trigger that owns `tracked_at` and
-- the `user_tracked_shows` view: their shape (invoker rights, empty
-- search_path, who may execute), what they write and report, idempotent Stop
-- tracking, the Undo round trip with its bounds, that an episode mark tracks
-- an untracked show, that the contract left no status or hold behind, and
-- that user A can never read or change user B's rows through any of them.
--
-- Shows 960001 to 960049 and episodes 970001 to 970099 are free for user A in
-- this file; show 960050 belongs to user B. Rows that need past times are
-- pinned as `postgres` with `session_replication_role = replica`, which skips
-- the triggers.

begin;
select plan(42);

-- Shape (AC-1, AC-20)

select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.track_show(integer)'::regprocedure,
     'public.untrack_show(integer)'::regprocedure,
     'public.restore_show_tracking(integer, timestamptz)'::regprocedure,
     'public.set_tracked_at()'::regprocedure
   )
     and not prosecdef
     and proconfig = array['search_path=""']),
  4,
  'all four functions are security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.track_show(integer)', 'execute')
  and not has_function_privilege('anon', 'public.untrack_show(integer)', 'execute')
  and not has_function_privilege('anon', 'public.restore_show_tracking(integer, timestamptz)', 'execute'),
  'anon cannot execute any tracking function'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.track_show(integer)'::regprocedure,
      'public.untrack_show(integer)'::regprocedure,
      'public.restore_show_tracking(integer, timestamptz)'::regprocedure,
      'public.set_tracked_at()'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on any of them'
);
select ok(
  has_function_privilege('authenticated', 'public.track_show(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.untrack_show(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_show_tracking(integer, timestamptz)', 'execute'),
  'authenticated can execute the three callable ones'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_tracked_at()', 'execute'),
  'authenticated holds no execute on the trigger function'
);
select ok(
  (select 'security_invoker=true' = any(reloptions)
   from pg_class where oid = 'public.user_tracked_shows'::regclass),
  'user_tracked_shows runs with the reader''s rights'
);
select ok(
  not has_table_privilege('anon', 'public.user_tracked_shows', 'select')
  and has_table_privilege('authenticated', 'public.user_tracked_shows', 'select')
  and not has_table_privilege('authenticated', 'public.user_tracked_shows', 'insert')
  and not has_table_privilege('authenticated', 'public.user_tracked_shows', 'update')
  and not has_table_privilege('authenticated', 'public.user_tracked_shows', 'delete'),
  'the view is a read for authenticated alone'
);

-- The contract left nothing of statuses or holds (AC-1).
select columns_are(
  'public', 'user_show_state',
  array['user_id', 'show_id', 'tracked_at', 'created_at', 'updated_at'],
  'a tracked show carries no status and no hold'
);
select columns_are(
  'public', 'user_tracked_shows',
  array['user_id', 'show_id', 'tracked_at', 'last_regular_watched_at', 'last_watched_at', 'last_activity_at'],
  'the view exposes no hold'
);
select is(
  (select count(*)::int from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname in ('tv_status', 'status_source', 'show_hold')),
  0,
  'the tv_status, status_source and show_hold types are gone'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'set_show_hold', 'set_show_status', 'remove_show_status', 'restore_show_status',
     'start_watching_show', 'complete_show_automatically', 'reopen_show_automatically',
     'reopen_completed_show', 'legacy_hold_for_status', 'legacy_status_for_hold',
     'set_listed_at', 'set_status_changed_at', 'set_tracking_times'
   )),
  0,
  'every status, hold and legacy function is gone'
);

-- Fixtures pinned as postgres, triggers off.
set local session_replication_role = replica;
insert into public.user_show_state (user_id, show_id, tracked_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 960050, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z'),
  -- A: tracked long ago, for the view's times.
  ('11111111-1111-1111-1111-111111111111', 960010, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z'),
  -- A: tracked long ago with nothing watched.
  ('11111111-1111-1111-1111-111111111111', 960011, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z'),
  -- A: for Stop tracking and Undo.
  ('11111111-1111-1111-1111-111111111111', 960012, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  -- A: the stopped show's history, which Stop tracking must keep.
  ('11111111-1111-1111-1111-111111111111', 970001, 960012, 1, 1, '2021-01-01T00:00:00Z', 8),
  -- A: the view's times on show 960010: a regular episode, a newer special,
  -- and an unwatched newer row that must not count.
  ('11111111-1111-1111-1111-111111111111', 970002, 960010, 1, 1, '2021-05-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970003, 960010, 0, 1, '2021-06-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970004, 960010, 1, 2, null, 9),
  -- B: a watched episode on B's show.
  ('22222222-2222-2222-2222-222222222222', 970050, 960050, 1, 1, '2021-01-01T00:00:00Z', 7);
set local session_replication_role = origin;

-- The episode rows as they were, to prove no tracking write touches them.
create temporary table tracking_episodes_before on commit drop as
  select * from public.user_episode_state
  where user_id = '11111111-1111-1111-1111-111111111111';
grant select on tracking_episodes_before to authenticated;

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- track_show (AC-1, AC-2)

select is(public.track_show(960001), true, 'tracking an untracked show reports it as new');
select is(
  (select tracked_at = now() from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960001),
  true,
  'the new row is tracked now'
);
select is(public.track_show(960001), false, 'tracking it again reports nothing');
select is(public.track_show(960011), false, 'tracking a tracked show reports nothing');
select is(
  (select tracked_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011),
  '2020-01-01T00:00:00Z'::timestamptz,
  'and keeps its tracked_at'
);

-- The trigger: no client chooses tracked_at.
insert into public.user_show_state (user_id, show_id, tracked_at)
values ('11111111-1111-1111-1111-111111111111', 960002, '1999-01-01T00:00:00Z');
select is(
  (select tracked_at = now() from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960002),
  true,
  'an insert that sends tracked_at gets now() instead'
);
update public.user_show_state
set tracked_at = '1999-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011;
select is(
  (select tracked_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011),
  '2020-01-01T00:00:00Z'::timestamptz,
  'an update that sends tracked_at keeps the stored one'
);

-- Episode marks (AC-5)

select is(
  (select show_tracked from public.mark_episode_watched(960003, 1::smallint, 1::smallint, 970010)),
  true,
  'marking a regular episode of an untracked show tracks it'
);
select is(
  (select show_tracked from public.mark_season_watched(
     960004, 1::smallint, array[970020, 970021], array[1, 2]::smallint[])),
  true,
  'marking a season of an untracked show tracks it'
);
select is(
  (select show_tracked from public.rate_episode(960005, 1::smallint, 1::smallint, 970030, 6::smallint)),
  true,
  'rating an unwatched regular episode of an untracked show tracks it'
);
select is(
  (select show_tracked from public.mark_episode_watched(960011, 1::smallint, 1::smallint, 970040)),
  false,
  'marking an episode of a tracked show reports nothing'
);

-- untrack_show (AC-3, AC-4)

select results_eq(
  $$ select tracked_at from public.untrack_show(960012) $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz) $$,
  'Stop tracking returns the deleted row''s tracked_at'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960012),
  0::bigint,
  'the row is gone'
);
select results_eq(
  $$ select watched_at, rating from public.user_episode_state
     where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 970001 $$,
  $$ values ('2021-01-01T00:00:00Z'::timestamptz, 8::smallint) $$,
  'its episode mark and rating stay'
);
select is_empty(
  $$ select * from public.untrack_show(960012) $$,
  'stopping an untracked show is a no op that returns no row'
);

-- restore_show_tracking (AC-3)

select throws_ok(
  $$ select public.restore_show_tracking(960012, now() + interval '1 hour') $$,
  'P0002', 'undo_expired',
  'a tracked_at in the future is refused'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, null) $$,
  'P0002', 'undo_expired',
  'a null tracked_at is refused'
);
select is(
  (select tracked_at from public.restore_show_tracking(960012, '2020-01-01T00:00:00Z')),
  '2020-01-01T00:00:00Z'::timestamptz,
  'Undo puts the row back with its exact tracked_at'
);
select is(
  current_setting('bestats.restore_tracking', true),
  'off',
  'the restore setting is switched off again after a restore'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-01-01T00:00:00Z') $$,
  'P0002', 'already_tracked',
  'a second Undo is refused'
);
select is(
  current_setting('bestats.restore_tracking', true),
  'off',
  'the restore setting is off after a refused restore too'
);

-- user_tracked_shows (data model)

select results_eq(
  $$ select last_regular_watched_at, last_watched_at, last_activity_at
     from public.user_tracked_shows
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960010 $$,
  $$ values ('2021-05-01T00:00:00Z'::timestamptz, '2021-06-01T00:00:00Z'::timestamptz, '2021-05-01T00:00:00Z'::timestamptz) $$,
  'the view''s times: newest regular, newest of any season, and activity'
);
select is(
  (select last_activity_at from public.user_tracked_shows
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960002),
  now(),
  'a show with nothing watched sorts by tracked_at'
);

-- No tracking write touched an episode row, apart from the marks above.
select set_eq(
  $$ select * from tracking_episodes_before $$,
  $$ select * from public.user_episode_state
     where user_id = '11111111-1111-1111-1111-111111111111'
       and episode_id not in (970010, 970020, 970021, 970030, 970040) $$,
  'no tracking function wrote an episode row'
);

-- Cross user isolation (AC-20): user B's show 960050, reached as user A.

select is(
  (select count(*) from public.user_tracked_shows
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'user A reads none of user B''s rows through the view'
);
select is_empty(
  $$ select * from public.untrack_show(960050) $$,
  'user A cannot stop tracking user B''s show'
);
select is(public.track_show(960050), true, 'tracking the same show id makes user A''s own row');
select throws_ok(
  $$ select public.restore_show_tracking(960050, '2020-01-01T00:00:00Z') $$,
  'P0002', 'already_tracked',
  'a restore on that id only ever reaches user A''s own row'
);

-- Back to postgres to read user B's row as it is.
reset role;
select results_eq(
  $$ select tracked_at, updated_at from public.user_show_state
     where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 960050 $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, '2020-01-01T00:00:00Z'::timestamptz) $$,
  'user B''s row is untouched after user A called every function on it'
);

-- anon reaches none of it.
set local role anon;
select throws_ok(
  $$ select public.track_show(960001) $$,
  '42501', null,
  'anon cannot call track_show'
);
select throws_ok(
  $$ select * from public.user_tracked_shows $$,
  '42501', null,
  'anon cannot read the view'
);

select * from finish();
rollback;
