-- Spec 0011 AC-5, AC-6, AC-9 to AC-11, AC-15, AC-16, AC-19 and AC-24: the
-- five episode tracking functions.
--
-- They hold every episode rule that depends on the current row, so this file
-- pins them from every side: their shape (invoker rights, empty search_path,
-- who may execute), what they write, what they report, the guards, and that
-- user A can never read or change user B's rows through them.
--
-- `lib/tracking/episode-intent.test.ts` runs the same cases against the
-- TypeScript mirror, so the optimistic UI and the database cannot drift apart.
--
-- Show 900301 with episodes 930101 to 930120 is free for user A in this file;
-- episode 930150 of the same show belongs to user B. Rows that need a past
-- `updated_at` are pinned as `postgres` with `session_replication_role =
-- replica`, as `070-movie-restore-functions.test.sql` does.

begin;
select plan(54);

-- Shape (AC-19)

select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.mark_episode_watched(integer, smallint, smallint, integer)'::regprocedure,
     'public.rate_episode(integer, smallint, smallint, integer, smallint)'::regprocedure,
     'public.mark_season_watched(integer, smallint, integer[], smallint[])'::regprocedure,
     'public.unmark_episodes_watched(integer, integer[])'::regprocedure,
     'public.restore_episodes_watched(integer, jsonb)'::regprocedure
   )
     and not prosecdef
     and proconfig = array['search_path=""']),
  5,
  'all five functions are security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.mark_episode_watched(integer, smallint, smallint, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rate_episode(integer, smallint, smallint, integer, smallint)', 'execute')
  and not has_function_privilege('anon', 'public.mark_season_watched(integer, smallint, integer[], smallint[])', 'execute')
  and not has_function_privilege('anon', 'public.unmark_episodes_watched(integer, integer[])', 'execute')
  and not has_function_privilege('anon', 'public.restore_episodes_watched(integer, jsonb)', 'execute'),
  'anon cannot execute any of the five'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.mark_episode_watched(integer, smallint, smallint, integer)'::regprocedure,
      'public.rate_episode(integer, smallint, smallint, integer, smallint)'::regprocedure,
      'public.mark_season_watched(integer, smallint, integer[], smallint[])'::regprocedure,
      'public.unmark_episodes_watched(integer, integer[])'::regprocedure,
      'public.restore_episodes_watched(integer, jsonb)'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on any of the five'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_episode_watched(integer, smallint, smallint, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.rate_episode(integer, smallint, smallint, integer, smallint)', 'execute')
  and has_function_privilege('authenticated', 'public.mark_season_watched(integer, smallint, integer[], smallint[])', 'execute')
  and has_function_privilege('authenticated', 'public.unmark_episodes_watched(integer, integer[])', 'execute')
  and has_function_privilege('authenticated', 'public.restore_episodes_watched(integer, jsonb)', 'execute'),
  'authenticated can execute all five'
);

-- Fixtures pinned as postgres: B's row, and A's rows that need a past
-- updated_at or a known watched date.
set local session_replication_role = replica;
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 930150, 900301, 1, 50, '2020-01-01T00:00:00Z', 9, now()),
  -- A: unwatched long ago, for the expired Undo window.
  ('11111111-1111-1111-1111-111111111111', 930120, 900301, 2, 20, null, null, now() - interval '11 minutes');
set local session_replication_role = origin;

-- A snapshot of user_show_state, to prove no path touches it (AC-24).
create temporary table show_state_before on commit drop as
  select * from public.user_show_state;
grant select on show_state_before to authenticated;

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- mark_episode_watched (AC-5)

select public.mark_episode_watched(900301, 1::smallint, 1::smallint, 930101);

select ok(
  (select watched_at is not null and rating is null and show_id = 900301
      and season_number = 1 and episode_number = 1
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  'marking an untracked episode creates a watched row with the numbers passed in'
);

update public.user_episode_state
set watched_at = '2020-01-01T00:00:00Z', rating = 7
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101;

select public.mark_episode_watched(900301, 1::smallint, 1::smallint, 930101);

select is(
  (select watched_at from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  '2020-01-01T00:00:00Z'::timestamptz,
  'marking an already watched episode again keeps the original date'
);
select is(
  (select rating from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  7::smallint,
  'marking an episode watched never touches its rating'
);

-- A different number on conflict never rewrites the stored one.
select public.mark_episode_watched(900301, 3::smallint, 9::smallint, 930101);
select ok(
  (select season_number = 1 and episode_number = 1
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  'a later call never rewrites the stored season and episode numbers'
);

-- Specials are storable (AC-12).
select public.mark_episode_watched(900301, 0::smallint, 1::smallint, 930119);
select ok(
  (select season_number = 0 and watched_at is not null
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930119),
  'a special (season 0) can be marked watched'
);

-- rate_episode (AC-6)

select public.rate_episode(900301, 1::smallint, 2::smallint, 930102, 8::smallint);
select ok(
  (select rating = 8 and watched_at is not null
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930102),
  'rating an untracked episode stores the rating and marks it watched'
);

select public.rate_episode(900301, 1::smallint, 1::smallint, 930101, 5::smallint);
select ok(
  (select rating = 5 and watched_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  'rating a watched episode replaces the rating and keeps its date'
);

update public.user_episode_state
set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101;
select public.rate_episode(900301, 1::smallint, 1::smallint, 930101, 6::smallint);
select ok(
  (select rating = 6 and watched_at is not null
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930101),
  'rating an unwatched episode with a row marks it watched again'
);

select throws_ok(
  $$ select public.rate_episode(900301, 1::smallint, 2::smallint, 930102, 0::smallint) $$,
  '23514', null, 'a rating of 0 is refused'
);
select throws_ok(
  $$ select public.rate_episode(900301, 1::smallint, 2::smallint, 930102, 11::smallint) $$,
  '23514', null, 'a rating of 11 is refused'
);

-- AC-16: repeats and last write wins.
select public.rate_episode(900301, 1::smallint, 2::smallint, 930102, 7::smallint);
select public.rate_episode(900301, 1::smallint, 2::smallint, 930102, 8::smallint);
select public.mark_episode_watched(900301, 1::smallint, 2::smallint, 930102);
select public.mark_episode_watched(900301, 1::smallint, 2::smallint, 930102);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930102),
  1::bigint,
  'repeated calls leave exactly one row'
);
select is(
  (select rating from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930102),
  8::smallint,
  'picking 7 then 8 stores 8'
);

-- mark_season_watched (AC-9, AC-10)
-- State now: 930101 watched (rated 6), 930102 watched (rated 8). Rate an
-- unwatched 930103 through a plain row so its rating can be checked later.
insert into public.user_episode_state (user_id, episode_id, show_id, season_number, episode_number, rating)
values ('11111111-1111-1111-1111-111111111111', 930103, 900301, 1, 3, 4);

select is(
  public.mark_season_watched(
    900301, 1::smallint,
    array[930101, 930102, 930103, 930104, 930104],
    array[1, 2, 3, 4, 4]::smallint[]
  ),
  array[930103, 930104],
  'mark season returns only the newly marked ids, once each, despite a duplicated id'
);
select ok(
  (select bool_and(watched_at is not null) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and episode_id in (930101, 930102, 930103, 930104)),
  'every listed episode is watched afterwards'
);
select is(
  (select array_agg(rating order by episode_id) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and episode_id in (930101, 930102, 930103, 930104)),
  array[6, 8, 4, null]::smallint[],
  'mark season touches no rating'
);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930104),
  1::bigint,
  'a duplicated id creates one row'
);
select is(
  public.mark_season_watched(
    900301, 1::smallint, array[930101, 930102, 930103, 930104], array[1, 2, 3, 4]::smallint[]
  ),
  '{}'::integer[],
  'running mark season again changes nothing and reports nothing'
);

select throws_ok(
  $$ select public.mark_season_watched(900301, 1::smallint, '{}'::integer[], '{}'::smallint[]) $$,
  '22023', null, 'an empty episode list is refused'
);
select throws_ok(
  $$ select public.mark_season_watched(900301, 1::smallint, array[930105, 930106], array[5]::smallint[]) $$,
  '22023', null, 'arrays of different lengths are refused'
);
select throws_ok(
  $$ select public.mark_season_watched(
       900301, 1::smallint,
       array(select 930000 + g from generate_series(1, 1001) g),
       array(select 1::smallint from generate_series(1, 1001))
     ) $$,
  '22023', null, 'more than 1000 episodes are refused'
);
select throws_ok(
  $$ select public.mark_season_watched(900301, 1::smallint, array[930105], array[0]::smallint[]) $$,
  '23514', null, 'an episode number below 1 fails the constraint, and nothing is written'
);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930105),
  0::bigint,
  'the failed statement wrote no row'
);

-- unmark_episodes_watched (AC-10, AC-11)
-- 930101 and 930103 were watched at now() (one transaction, so now() is
-- fixed); 930104 is pinned to a known date. 930107 has no row and 930150 is
-- user B's.
update public.user_episode_state
set watched_at = '2021-05-05T10:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930104;

select results_eq(
  $$ select episode_id, watched_at from public.unmark_episodes_watched(
       900301, array[930101, 930103, 930104, 930107, 930150]) order by episode_id $$,
  $$ values (930101, now()), (930103, now()), (930104, '2021-05-05T10:00:00Z'::timestamptz) $$,
  'unmark reports each cleared row with its old date, and only the caller''s own watched rows'
);
select ok(
  (select bool_and(watched_at is null) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and episode_id in (930101, 930103, 930104)),
  'the listed episodes are unwatched afterwards'
);
select is(
  (select array_agg(rating order by episode_id) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and episode_id in (930101, 930103, 930104)),
  array[6, 4, null]::smallint[],
  'unmark keeps every rating'
);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930107),
  0::bigint,
  'unmark never inserts'
);
select is(
  (select count(*)::int from public.unmark_episodes_watched(900301, array[930101, 930103])),
  0,
  'unmarking unwatched episodes reports nothing'
);
select throws_ok(
  $$ select * from public.unmark_episodes_watched(900301, '{}'::integer[]) $$,
  '22023', null, 'unmark refuses an empty list'
);
select throws_ok(
  $$ select * from public.unmark_episodes_watched(900301, array(select 930000 + g from generate_series(1, 1001) g)) $$,
  '22023', null, 'unmark refuses more than 1000 ids'
);

-- restore_episodes_watched (AC-11)
select is(
  public.restore_episodes_watched(900301, jsonb_build_array(
    jsonb_build_object('episode_id', 930104, 'watched_at', '2021-05-05T10:00:00Z'),
    jsonb_build_object('episode_id', 930103, 'watched_at', '2022-02-02T02:00:00Z')
  )),
  2,
  'restore puts back the dates of recently unmarked rows'
);
select is(
  (select array_agg(watched_at order by episode_id) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id in (930103, 930104)),
  array['2022-02-02T02:00:00Z', '2021-05-05T10:00:00Z']::timestamptz[],
  'each restored row gets its own date back'
);
select is(
  (select array_agg(rating order by episode_id) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id in (930103, 930104)),
  array[4, null]::smallint[],
  'restore touches no rating'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[{"episode_id": 930104, "watched_at": "2019-01-01T00:00:00Z"}]') $$,
  'P0002', null, 'restore refuses a row that is already watched again'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, jsonb_build_array(
       jsonb_build_object('episode_id', 930101, 'watched_at', now() + interval '1 day'))) $$,
  'P0002', null, 'restore refuses a date in the future'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[{"episode_id": 930120, "watched_at": "2019-01-01T00:00:00Z"}]') $$,
  'P0002', null, 'restore refuses a row changed more than 10 minutes ago'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[{"episode_id": 930199, "watched_at": "2019-01-01T00:00:00Z"}]') $$,
  'P0002', null, 'restore never inserts a missing row'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[{"episode_id": "x", "watched_at": "2019-01-01T00:00:00Z"}]') $$,
  '22P02', null, 'a malformed entry fails the whole call'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[]') $$,
  '22023', null, 'restore refuses an empty list'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '{"episode_id": 930101}') $$,
  '22023', null, 'restore refuses a value that is not an array'
);

-- Cross user (AC-19): user A reaching for B's episode 930150 through every
-- function. A's creating calls land on A's own row; the removals find nothing.
select public.mark_episode_watched(900301, 1::smallint, 50::smallint, 930150);
select public.rate_episode(900301, 1::smallint, 50::smallint, 930150, 1::smallint);
select public.mark_season_watched(900301, 1::smallint, array[930150], array[50]::smallint[]);
select is(
  (select count(*)::int from public.unmark_episodes_watched(900301, array[930150])),
  1,
  'unmark on the shared id clears only A''s own row'
);
select is(
  public.restore_episodes_watched(900301, '[{"episode_id": 930150, "watched_at": "2000-01-01T00:00:00Z"}]'),
  1,
  'restore on the shared id restores only A''s own row'
);
select is(
  (select count(*) from public.user_episode_state where episode_id = 930150),
  1::bigint,
  'user A sees only A''s own row for the shared id'
);

reset role;

select ok(
  (select watched_at = '2020-01-01T00:00:00Z'::timestamptz and rating = 9
   from public.user_episode_state
   where user_id = '22222222-2222-2222-2222-222222222222' and episode_id = 930150),
  'user B''s row is untouched after user A calls every function on the same id'
);
select is(
  (select rating from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 930150),
  1::smallint,
  'user A''s calls landed on user A''s own row'
);

-- AC-24: no path touched user_show_state.
select set_eq(
  $$ select * from public.user_show_state $$,
  $$ select * from show_state_before $$,
  'user_show_state is unchanged after every write path'
);

-- anon cannot call any of them.
set local role anon;
select throws_ok(
  $$ select public.mark_episode_watched(900301, 1::smallint, 1::smallint, 930101) $$,
  '42501', null, 'anon is refused execute on mark_episode_watched'
);
select throws_ok(
  $$ select public.rate_episode(900301, 1::smallint, 1::smallint, 930101, 5::smallint) $$,
  '42501', null, 'anon is refused execute on rate_episode'
);
select throws_ok(
  $$ select public.mark_season_watched(900301, 1::smallint, array[930101], array[1]::smallint[]) $$,
  '42501', null, 'anon is refused execute on mark_season_watched'
);
select throws_ok(
  $$ select * from public.unmark_episodes_watched(900301, array[930101]) $$,
  '42501', null, 'anon is refused execute on unmark_episodes_watched'
);
select throws_ok(
  $$ select public.restore_episodes_watched(900301, '[{"episode_id": 930101, "watched_at": "2019-01-01T00:00:00Z"}]') $$,
  '42501', null, 'anon is refused execute on restore_episodes_watched'
);

select * from finish();
rollback;
