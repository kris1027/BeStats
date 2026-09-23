-- Spec 0008 AC-8: `watchlisted_at` is owned by the database.
--
-- The watchlist page sorts on this column, and Undo puts a movie back in its
-- old place by keeping it, so the file pins it from every write path: an
-- insert, a plan, a replan, an unplan, the first watch, an upsert, a client
-- that sends its own value, and the restore branch. It also replays the
-- migration's hand written backfill and proves the check constraint.
--
-- Inside one transaction `now()` never moves, so "kept" is only provable
-- against a value pinned in the past. Rows are pinned as `postgres` with
-- `session_replication_role = replica`, which skips every trigger, then the
-- writes under test run as user A. Movies 900101 to 900110 are free for A in
-- this file.

begin;
select plan(23);

-- Shape

select has_column(
  'public', 'user_movie_state', 'watchlisted_at',
  'user_movie_state has a watchlisted_at column'
);
select col_type_is(
  'public', 'user_movie_state', 'watchlisted_at', 'timestamp with time zone',
  'watchlisted_at is a timestamptz'
);
select has_index(
  'public', 'user_movie_state', 'user_movie_state_watchlist_idx',
  'the watchlist page index exists'
);
select has_index(
  'public', 'user_movie_state', 'user_movie_state_watched_idx',
  'the watched page index exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.set_watchlisted_at()'::regprocedure),
  false,
  'set_watchlisted_at is security invoker'
);
select is(
  (select proconfig from pg_proc where oid = 'public.set_watchlisted_at()'::regprocedure),
  array['search_path=""'],
  'set_watchlisted_at pins an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.set_watchlisted_at()', 'execute')
  and not has_function_privilege('authenticated', 'public.set_watchlisted_at()', 'execute'),
  'neither anon nor authenticated holds execute on the trigger function'
);

-- The check: a planned row with no time is refused. The trigger would fill
-- it in, so it is paused to reach the constraint itself.
set local session_replication_role = replica;
select throws_ok(
  $$ insert into public.user_movie_state (user_id, movie_id, in_watchlist, watchlisted_at)
     values ('11111111-1111-1111-1111-111111111111', 900110, true, null) $$,
  '23514',
  null,
  'a planned row with no watchlisted_at breaks the check constraint'
);

-- Pinned rows for the cases below, all at a known past time T.
insert into public.user_movie_state (user_id, movie_id, in_watchlist, watchlisted_at, watched_at)
values
  ('11111111-1111-1111-1111-111111111111', 900102, true, '2020-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 900103, true, '2020-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 900104, true, '2020-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 900105, false, '2020-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 900106, false, '2020-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 900107, false, null, null);
set local session_replication_role = origin;

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- Inserts
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900101, true);
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900101),
  now(),
  'inserting a planned row stamps now()'
);

insert into public.user_movie_state (user_id, movie_id, in_watchlist, watchlisted_at)
values ('11111111-1111-1111-1111-111111111111', 900108, false, '2001-01-01T00:00:00Z');
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900108),
  null,
  'inserting an unplanned row leaves it null, whatever the client sent'
);

insert into public.user_movie_state (user_id, movie_id, in_watchlist, watchlisted_at)
values ('11111111-1111-1111-1111-111111111111', 900109, true, '2001-01-01T00:00:00Z');
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900109),
  now(),
  'inserting a planned row ignores a client supplied time'
);

-- Unplan keeps, replan restamps
update public.user_movie_state set in_watchlist = false
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900102;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900102),
  '2020-01-01T00:00:00Z'::timestamptz,
  'unplanning keeps the old time'
);

update public.user_movie_state set in_watchlist = true
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900102;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900102),
  now(),
  'planning again stamps now()'
);

-- Any other update keeps the stored value, including a direct write to it,
-- the PostgREST PATCH case.
update public.user_movie_state set watchlisted_at = '2001-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900103;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900103),
  '2020-01-01T00:00:00Z'::timestamptz,
  'a direct write to watchlisted_at on a planned row is ignored'
);

update public.user_movie_state set rating = 5, watchlisted_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900103;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900103),
  '2020-01-01T00:00:00Z'::timestamptz,
  'an unrelated update that also sends null keeps the stored time'
);

-- The spec 0007 first watch rule still holds, and keeps the time.
select public.mark_movie_watched(900104);
select ok(
  (select not in_watchlist and watchlisted_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900104),
  'the first watch clears the bookmark and keeps the old time'
);

-- An upsert that plans an unplanned row takes the update branch: now().
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900105, true)
on conflict (user_id, movie_id) do update set in_watchlist = true;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900105),
  now(),
  'planning through an upsert stamps now()'
);

-- The restore branch keeps the old time only while the setting is on.
select set_config('bestats.restore_watchlist', 'on', true);
update public.user_movie_state set in_watchlist = true
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900106;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900106),
  '2020-01-01T00:00:00Z'::timestamptz,
  'with the restore setting on, re-planning keeps the old time'
);

update public.user_movie_state set in_watchlist = true
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900107;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900107),
  now(),
  'with the restore setting on but no old time, re-planning stamps now()'
);
select set_config('bestats.restore_watchlist', 'off', true);

-- The seeded fixture went through the trigger, so every planned row has a time.
reset role;
select is(
  (select count(*) from public.user_movie_state
   where in_watchlist and watchlisted_at is null),
  0::bigint,
  'no planned row anywhere lacks a watchlisted_at'
);

-- The backfill, replayed. The check is dropped inside this transaction so a
-- pre-migration row (planned, no time) can exist, then the migration's exact
-- statement runs with every trigger skipped, as in the migration.
alter table public.user_movie_state drop constraint user_movie_state_watchlisted_at_check;
set local session_replication_role = replica;
update public.user_movie_state
set watchlisted_at = null, updated_at = '2019-06-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900101;
update public.user_movie_state set watchlisted_at = updated_at where in_watchlist;
set local session_replication_role = origin;
select is(
  (select watchlisted_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900101),
  '2019-06-01T00:00:00Z'::timestamptz,
  'the backfill copies updated_at into a planned row'
);
select is(
  (select updated_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900101),
  '2019-06-01T00:00:00Z'::timestamptz,
  'the backfill leaves updated_at alone'
);
select lives_ok(
  $$ alter table public.user_movie_state
     add constraint user_movie_state_watchlisted_at_check
     check (not in_watchlist or watchlisted_at is not null) $$,
  'after the backfill every row satisfies the check constraint'
);

select * from finish();
rollback;
