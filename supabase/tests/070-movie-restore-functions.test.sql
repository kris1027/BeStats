-- Spec 0008 AC-4, AC-6 and AC-7: the two Undo functions.
--
-- `restore_movie_watchlist` and `restore_movie_watched` are the only writes
-- that put back an earlier value, so this file pins what they may and may not
-- do: their shape (invoker rights, empty search_path, who may execute), the
-- restore itself, every refusal (already restored, no old time, a future time,
-- the 10 minute window, a missing row, another user's row), and that the
-- rating and the bookmark are never touched.
--
-- Rows are pinned as `postgres` with `session_replication_role = replica`, so
-- `updated_at` can be set in the past. Movies 900201 to 900299 are free in this
-- file; 900250 and 900251 belong to user B.

begin;
select plan(27);

-- Shape (AC-4)

select is(
  (select prosecdef from pg_proc where oid = 'public.restore_movie_watchlist(integer)'::regprocedure),
  false,
  'restore_movie_watchlist is security invoker'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.restore_movie_watched(integer, timestamptz)'::regprocedure),
  false,
  'restore_movie_watched is security invoker'
);
select is(
  (select proconfig from pg_proc where oid = 'public.restore_movie_watchlist(integer)'::regprocedure),
  array['search_path=""'],
  'restore_movie_watchlist pins an empty search_path'
);
select is(
  (select proconfig from pg_proc where oid = 'public.restore_movie_watched(integer, timestamptz)'::regprocedure),
  array['search_path=""'],
  'restore_movie_watched pins an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.restore_movie_watchlist(integer)', 'execute')
  and not has_function_privilege('anon', 'public.restore_movie_watched(integer, timestamptz)', 'execute'),
  'anon cannot execute either function'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.restore_movie_watchlist(integer)'::regprocedure,
      'public.restore_movie_watched(integer, timestamptz)'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on either function'
);
select ok(
  has_function_privilege('authenticated', 'public.restore_movie_watchlist(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_movie_watched(integer, timestamptz)', 'execute'),
  'authenticated can execute both functions'
);

-- Pinned rows. T is 2020-01-01, the old plan time; "recent" is now().
set local session_replication_role = replica;
insert into public.user_movie_state
  (user_id, movie_id, in_watchlist, watchlisted_at, watched_at, rating, updated_at)
values
  -- just unplanned, restorable
  ('11111111-1111-1111-1111-111111111111', 900201, false, '2020-01-01T00:00:00Z', null, 6, now()),
  -- unplanned, but never had a plan time
  ('11111111-1111-1111-1111-111111111111', 900202, false, null, null, null, now()),
  -- unplanned 11 minutes ago
  ('11111111-1111-1111-1111-111111111111', 900203, false, '2020-01-01T00:00:00Z', null, null, now() - interval '11 minutes'),
  -- just unmarked, planned for a rewatch and rated
  ('11111111-1111-1111-1111-111111111111', 900204, true, '2020-01-01T00:00:00Z', null, 7, now()),
  -- just unmarked, for the future time case
  ('11111111-1111-1111-1111-111111111111', 900205, false, null, null, null, now()),
  -- unmarked 11 minutes ago
  ('11111111-1111-1111-1111-111111111111', 900206, false, null, null, null, now() - interval '11 minutes'),
  -- user B, both restorable by B
  ('22222222-2222-2222-2222-222222222222', 900250, false, '2020-01-01T00:00:00Z', null, null, now()),
  ('22222222-2222-2222-2222-222222222222', 900251, false, null, null, null, now());
set local session_replication_role = origin;

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- AC-6: the watchlist restore puts the movie back at its old time.
select lives_ok(
  $$ select public.restore_movie_watchlist(900201) $$,
  'restoring a just unplanned movie succeeds'
);
select ok(
  (select in_watchlist and watchlisted_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900201),
  'the restored movie is planned again with its original watchlisted_at'
);
select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900201),
  6::smallint,
  'the watchlist restore leaves the rating alone'
);
select is(
  current_setting('bestats.restore_watchlist', true),
  'off',
  'the restore setting is switched off again after a restore'
);

select throws_ok(
  $$ select public.restore_movie_watchlist(900201) $$,
  'P0002',
  'undo_expired',
  'restoring an already planned movie is refused'
);
select is(
  current_setting('bestats.restore_watchlist', true),
  'off',
  'the restore setting is off after a refused restore too'
);
select throws_ok(
  $$ select public.restore_movie_watchlist(900202) $$,
  'P0002',
  'undo_expired',
  'restoring a row with no watchlisted_at is refused'
);
select throws_ok(
  $$ select public.restore_movie_watchlist(900203) $$,
  'P0002',
  'undo_expired',
  'restoring a row changed more than 10 minutes ago is refused'
);

-- AC-7: the watched restore puts back the original date, and only that.
select lives_ok(
  $$ select public.restore_movie_watched(900204, '2021-05-05T12:00:00Z') $$,
  'restoring a just unmarked movie succeeds'
);
select ok(
  (select watched_at = '2021-05-05T12:00:00Z'::timestamptz
      and rating = 7
      and in_watchlist
      and watchlisted_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900204),
  'the watched restore sets the original date and leaves the rating and bookmark alone'
);
select throws_ok(
  $$ select public.restore_movie_watched(900204, '2021-05-05T12:00:00Z') $$,
  'P0002',
  'undo_expired',
  'restoring a movie that is currently watched is refused'
);
select throws_ok(
  $$ select public.restore_movie_watched(900205, now() + interval '1 day') $$,
  'P0002',
  'undo_expired',
  'restoring with a future time is refused'
);
select throws_ok(
  $$ select public.restore_movie_watched(900206, '2021-05-05T12:00:00Z') $$,
  'P0002',
  'undo_expired',
  'restoring a row changed more than 10 minutes ago is refused'
);

-- Undo never creates a row.
select throws_ok(
  $$ select public.restore_movie_watchlist(900299) $$,
  'P0002',
  'undo_expired',
  'restoring the watchlist for an untracked movie is refused'
);
select throws_ok(
  $$ select public.restore_movie_watched(900299, '2021-05-05T12:00:00Z') $$,
  'P0002',
  'undo_expired',
  'restoring watched for an untracked movie is refused'
);
select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900299),
  0::bigint,
  'a refused restore creates no row'
);

-- AC-4: A cannot restore B's rows.
select throws_ok(
  $$ select public.restore_movie_watchlist(900250) $$,
  'P0002',
  'undo_expired',
  'user A restoring the watchlist on a movie only user B tracks matches no row'
);
select throws_ok(
  $$ select public.restore_movie_watched(900251, '2021-05-05T12:00:00Z') $$,
  'P0002',
  'undo_expired',
  'user A restoring watched on a movie only user B tracks matches no row'
);

reset role;
select ok(
  (select not in_watchlist and watched_at is null
   from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222' and movie_id = 900250),
  'user B''s watchlist row is unchanged'
);
select ok(
  (select watched_at is null
   from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222' and movie_id = 900251),
  'user B''s watched row is unchanged'
);

select * from finish();
rollback;
