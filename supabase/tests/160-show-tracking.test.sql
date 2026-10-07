-- Spec 0020 AC-1, AC-3 to AC-5, AC-20: tracking a show.
--
-- Pins the four tracking functions, the trigger that owns `tracked_at` and
-- `hold_changed_at`, the `user_tracked_shows` view and the hold check: their
-- shape (invoker rights, empty search_path, who may execute), what they write
-- and report, the expected value check, the Stop tracking and Undo round
-- trip with its bounds, that an episode mark tracks an untracked show and
-- never clears a hold, the legacy status mirror, and that user A can never
-- read or change user B's rows through any of them.
--
-- The AC-19 mapping runs once, inside the expand migration, so it is proved
-- against that migration itself (spec 0020 `verify.md`), not here.
--
-- Shows 960001 to 960049 and episodes 970001 to 970099 are free for user A in
-- this file; show 960050 belongs to user B. Rows that need past times are
-- pinned as `postgres` with `session_replication_role = replica`, which skips
-- the triggers, as `090-show-status-functions.test.sql` does.

begin;
select plan(61);

-- Shape (AC-20)

select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.track_show(integer)'::regprocedure,
     'public.set_show_hold(integer, public.show_hold, public.show_hold)'::regprocedure,
     'public.untrack_show(integer, public.show_hold)'::regprocedure,
     'public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz)'::regprocedure,
     'public.set_tracking_times()'::regprocedure
   )
     and not prosecdef
     and proconfig = array['search_path=""']),
  5,
  'all five functions are security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.track_show(integer)', 'execute')
  and not has_function_privilege('anon', 'public.set_show_hold(integer, public.show_hold, public.show_hold)', 'execute')
  and not has_function_privilege('anon', 'public.untrack_show(integer, public.show_hold)', 'execute')
  and not has_function_privilege('anon', 'public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz)', 'execute'),
  'anon cannot execute any tracking function'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.track_show(integer)'::regprocedure,
      'public.set_show_hold(integer, public.show_hold, public.show_hold)'::regprocedure,
      'public.untrack_show(integer, public.show_hold)'::regprocedure,
      'public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz)'::regprocedure,
      'public.set_tracking_times()'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on any of them'
);
select ok(
  has_function_privilege('authenticated', 'public.track_show(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.set_show_hold(integer, public.show_hold, public.show_hold)', 'execute')
  and has_function_privilege('authenticated', 'public.untrack_show(integer, public.show_hold)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz)', 'execute'),
  'authenticated can execute the four callable ones'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_tracking_times()', 'execute'),
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
select has_index(
  'public', 'user_show_state', 'user_show_state_held_idx',
  'the partial held index exists'
);

-- Fixtures pinned as postgres, triggers off.
set local session_replication_role = replica;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at, tracked_at, hold_state, hold_changed_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 960050, 'watching', 'user', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', null, null, '2020-01-01T00:00:00Z'),
  -- A: tracked long ago, no hold.
  ('11111111-1111-1111-1111-111111111111', 960010, 'watching', 'user', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', null, null, '2020-01-01T00:00:00Z'),
  -- A: paused, for "same hold writes nothing" and Resume.
  ('11111111-1111-1111-1111-111111111111', 960011, 'on_hold', 'user', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'paused', '2020-02-01T00:00:00Z', '2020-02-01T00:00:00Z'),
  -- A: dropped, for Stop tracking and Undo.
  ('11111111-1111-1111-1111-111111111111', 960012, 'dropped', 'user', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'dropped', '2020-03-01T00:00:00Z', '2020-03-01T00:00:00Z'),
  -- A: paused, for "an episode mark never clears a hold".
  ('11111111-1111-1111-1111-111111111111', 960013, 'on_hold', 'user', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'paused', '2020-02-01T00:00:00Z', '2020-02-01T00:00:00Z');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  -- A: the dropped show's history, which Stop tracking must keep.
  ('11111111-1111-1111-1111-111111111111', 970001, 960012, 1, 1, '2021-01-01T00:00:00Z', 8),
  -- A: the view's times on show 960010: a regular episode, a newer special,
  -- and an unwatched newer row that must not count.
  ('11111111-1111-1111-1111-111111111111', 970002, 960010, 1, 1, '2021-05-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970003, 960010, 0, 1, '2021-06-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970004, 960010, 1, 2, null, 9),
  -- B: a watched episode on B's show.
  ('22222222-2222-2222-2222-222222222222', 970050, 960050, 1, 1, '2021-01-01T00:00:00Z', 7);

-- The check itself, with the trigger out of the way.
select throws_ok(
  $$ insert into public.user_show_state (user_id, show_id, status, hold_state, hold_changed_at)
     values ('11111111-1111-1111-1111-111111111111', 960049, 'on_hold', 'paused', null) $$,
  '23514', null, 'the check refuses a hold with no time'
);
select throws_ok(
  $$ insert into public.user_show_state (user_id, show_id, status, hold_state, hold_changed_at)
     values ('11111111-1111-1111-1111-111111111111', 960049, 'on_hold', null, now()) $$,
  '23514', null, 'the check refuses a time with no hold'
);
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
select results_eq(
  $$ select tracked_at = now(), hold_state::text, hold_changed_at, status::text, status_source::text
     from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960001 $$,
  $$ values (true, null::text, null::timestamptz, 'watching', 'user') $$,
  'the new row is tracked now, with no hold, mirrored as Watching by the user'
);
select is(public.track_show(960001), false, 'tracking it again reports nothing');
select is(public.track_show(960011), false, 'tracking a paused show reports nothing');
select results_eq(
  $$ select tracked_at, hold_state::text, hold_changed_at from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011 $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 'paused', '2020-02-01T00:00:00Z'::timestamptz) $$,
  'and keeps its hold and its times'
);

-- The trigger: no client chooses tracked_at or hold_changed_at.
insert into public.user_show_state (user_id, show_id, tracked_at, hold_state, hold_changed_at)
values ('11111111-1111-1111-1111-111111111111', 960002, '1999-01-01T00:00:00Z', 'paused', '1999-01-01T00:00:00Z');
select results_eq(
  $$ select tracked_at = now(), hold_changed_at = now() from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960002 $$,
  $$ values (true, true) $$,
  'an insert that sends both times gets now() instead'
);
update public.user_show_state
set tracked_at = '1999-01-01T00:00:00Z', hold_changed_at = '1999-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960013;
select results_eq(
  $$ select tracked_at, hold_changed_at from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960013 $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, '2020-02-01T00:00:00Z'::timestamptz) $$,
  'an update that sends both times keeps the stored ones'
);

-- set_show_hold (AC-2, AC-4)

select is(
  public.set_show_hold(960010, 'paused', null)::text,
  'paused',
  'pausing a show with no hold returns the new hold'
);
select results_eq(
  $$ select tracked_at, hold_state::text, hold_changed_at = now(), status::text, status_source::text
     from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960010 $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 'paused', true, 'on_hold', 'user') $$,
  'the pause is stamped now, keeps tracked_at and is mirrored as On Hold'
);
select throws_ok(
  $$ select public.set_show_hold(960010, 'dropped', null) $$,
  'BS409', 'hold_changed',
  'a hold change over a hold the caller did not see is refused'
);
select is(
  (select hold_state::text from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960010),
  'paused',
  'and writes nothing'
);
select is(
  public.set_show_hold(960010, 'dropped', 'paused')::text,
  'dropped',
  'pause to drop, over the hold the caller saw'
);
select is(
  (select status::text from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960010),
  'dropped',
  'the drop is mirrored as Dropped'
);
select is(
  public.set_show_hold(960011, 'paused', 'paused')::text,
  'paused',
  'choosing the hold the row holds returns it'
);
select is(
  (select updated_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011),
  '2020-02-01T00:00:00Z'::timestamptz,
  'and writes nothing'
);
select is(
  public.set_show_hold(960011, null, 'paused'),
  null::public.show_hold,
  'Resume clears the hold'
);
select results_eq(
  $$ select hold_state::text, hold_changed_at, status::text from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011 $$,
  $$ values (null::text, null::timestamptz, 'watching') $$,
  'a resumed show has no hold time and is mirrored as Watching'
);
select throws_ok(
  $$ select public.set_show_hold(960040, 'paused', null) $$,
  'BS404', 'not_tracked',
  'holding an untracked show is refused'
);

-- Episode marks (AC-5)

select is(
  (select show_started from public.mark_episode_watched(960003, 1::smallint, 1::smallint, 970010)),
  true,
  'marking a regular episode of an untracked show tracks it'
);
select is(
  (select hold_state from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960003),
  null::public.show_hold,
  'with no hold'
);
select is(
  (select show_started from public.mark_season_watched(
     960004, 1::smallint, array[970020, 970021], array[1, 2]::smallint[])),
  true,
  'marking a season of an untracked show tracks it'
);
select is(
  (select show_started from public.rate_episode(960005, 1::smallint, 1::smallint, 970030, 6::smallint)),
  true,
  'rating an unwatched regular episode of an untracked show tracks it'
);
select is(
  (select show_started from public.mark_episode_watched(960013, 1::smallint, 1::smallint, 970040)),
  false,
  'marking an episode of a paused show reports nothing'
);
select results_eq(
  $$ select hold_state::text, hold_changed_at from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960013 $$,
  $$ values ('paused', '2020-02-01T00:00:00Z'::timestamptz) $$,
  'and the pause stays exactly as it was'
);

-- untrack_show (AC-3, AC-4)

select throws_ok(
  $$ select * from public.untrack_show(960012, null) $$,
  'BS409', 'hold_changed',
  'Stop tracking over a hold the caller did not see is refused'
);
select results_eq(
  $$ select tracked_at, hold_state::text, hold_changed_at from public.untrack_show(960012, 'dropped') $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 'dropped', '2020-03-01T00:00:00Z'::timestamptz) $$,
  'Stop tracking returns the deleted row''s times and hold'
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
select throws_ok(
  $$ select * from public.untrack_show(960012, 'dropped') $$,
  'BS404', 'not_tracked',
  'stopping an untracked show is refused'
);

-- restore_show_tracking (AC-3)

select throws_ok(
  $$ select public.restore_show_tracking(960012, now() + interval '1 hour', 'dropped', '2020-03-01T00:00:00Z') $$,
  'P0002', 'undo_expired',
  'a tracked_at in the future is refused'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-01-01T00:00:00Z', 'dropped', now() + interval '1 hour') $$,
  'P0002', 'undo_expired',
  'a hold time in the future is refused'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-01-01T00:00:00Z', 'dropped', null) $$,
  'P0002', 'undo_expired',
  'a hold with no time is refused'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-01-01T00:00:00Z', null, '2020-03-01T00:00:00Z') $$,
  'P0002', 'undo_expired',
  'a time with no hold is refused'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-04-01T00:00:00Z', 'dropped', '2020-03-01T00:00:00Z') $$,
  'P0002', 'undo_expired',
  'a hold time before tracked_at is refused'
);
select results_eq(
  $$ select tracked_at, hold_state::text, hold_changed_at, status::text
     from public.restore_show_tracking(960012, '2020-01-01T00:00:00Z', 'dropped', '2020-03-01T00:00:00Z') $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 'dropped', '2020-03-01T00:00:00Z'::timestamptz, 'dropped') $$,
  'Undo puts the row back with its exact times and hold'
);
select is(
  current_setting('bestats.restore_tracking', true),
  'off',
  'the restore setting is switched off again after a restore'
);
select throws_ok(
  $$ select public.restore_show_tracking(960012, '2020-01-01T00:00:00Z', 'dropped', '2020-03-01T00:00:00Z') $$,
  'P0002', 'already_tracked',
  'a second Undo is refused'
);
select is(
  current_setting('bestats.restore_tracking', true),
  'off',
  'the restore setting is off after a refused restore too'
);
select results_eq(
  $$ select tracked_at = now(), hold_state from public.restore_show_tracking(960006, now() - interval '1 minute') $$,
  $$ values (false, null::public.show_hold) $$,
  'an Undo with no hold restores a row with no hold'
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
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960011),
  '2020-01-01T00:00:00Z'::timestamptz,
  'a show with nothing watched sorts by tracked_at'
);

-- No tracking write touched an episode row, apart from the marks above.
select set_eq(
  $$ select * from tracking_episodes_before $$,
  $$ select * from public.user_episode_state
     where episode_id not in (970010, 970020, 970021, 970030, 970040) $$,
  'no tracking function wrote an episode row'
);

-- Cross user isolation (AC-20): user B's show 960050, reached as user A.

select is(
  (select count(*) from public.user_tracked_shows
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'user A reads none of user B''s rows through the view'
);
select throws_ok(
  $$ select public.set_show_hold(960050, 'paused', null) $$,
  'BS404', 'not_tracked',
  'user A cannot hold user B''s show'
);
select throws_ok(
  $$ select * from public.untrack_show(960050, null) $$,
  'BS404', 'not_tracked',
  'user A cannot stop tracking user B''s show'
);
select is(public.track_show(960050), true, 'tracking the same show id makes user A''s own row');
select throws_ok(
  $$ select public.restore_show_tracking(960050, '2020-01-01T00:00:00Z', 'dropped', '2020-03-01T00:00:00Z') $$,
  'P0002', 'already_tracked',
  'a restore on that id only ever reaches user A''s own row'
);

-- Back to postgres to read user B's row as it is.
reset role;
select results_eq(
  $$ select tracked_at, hold_state::text, updated_at from public.user_show_state
     where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 960050 $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, null::text, '2020-01-01T00:00:00Z'::timestamptz) $$,
  'user B''s row is untouched after user A called every function on it'
);
select is(
  (select tracked_at = now() from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 960050),
  true,
  'user A''s track landed on user A''s own row'
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
