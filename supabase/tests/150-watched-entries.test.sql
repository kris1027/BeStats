-- Spec 0019 AC-1, AC-2, AC-4 and AC-12: the `user_watched_entries` view.
--
-- Pins that it runs with the reader's rights, who may select it, which rows
-- it holds, the sort time of each half (specials included, the Completed time
-- as the fallback), the merged order the watched page asks for, that status
-- alone decides a show's presence, and that one user never sees another's
-- entries through it.
--
-- Movies 960101 to 960109 and shows 970101 to 970109 are free for user A in
-- this file; movie 960150 and show 970150 belong to user B.

begin;
select plan(13);

select ok(
  (select 'security_invoker=true' = any(reloptions)
   from pg_class where oid = 'public.user_watched_entries'::regclass),
  'the view runs with the reader''s rights'
);
select ok(
  not has_table_privilege('anon', 'public.user_watched_entries', 'select')
  and not has_table_privilege('anon', 'public.user_watched_entries', 'insert')
  and not has_table_privilege('anon', 'public.user_watched_entries', 'update')
  and not has_table_privilege('anon', 'public.user_watched_entries', 'delete'),
  'anon holds no privilege on the view'
);
select ok(
  has_table_privilege('authenticated', 'public.user_watched_entries', 'select')
  and not has_table_privilege('authenticated', 'public.user_watched_entries', 'insert')
  and not has_table_privilege('authenticated', 'public.user_watched_entries', 'update')
  and not has_table_privilege('authenticated', 'public.user_watched_entries', 'delete'),
  'authenticated can only select from the view'
);

-- Fixtures with known times, triggers off. A movie and a show share one
-- instant, so the tiebreak shows.
set local session_replication_role = replica;
delete from public.user_movie_state;
delete from public.user_show_state;
delete from public.user_episode_state;
insert into public.user_movie_state
  (user_id, movie_id, in_watchlist, watchlisted_at, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 960101, false, null, '2024-05-01T00:00:00Z', 8),
  ('11111111-1111-1111-1111-111111111111', 960102, false, null, '2024-03-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 960103, true, '2024-02-01T00:00:00Z', null, 7),
  ('22222222-2222-2222-2222-222222222222', 960150, false, null, '2024-09-01T00:00:00Z', 9);
insert into public.user_show_state
  (user_id, show_id, status, status_source, status_changed_at, listed_at)
values
  -- A special watched last moves the show to its time.
  ('11111111-1111-1111-1111-111111111111', 970101, 'completed', 'user', '2024-01-01T00:00:00Z', null),
  -- Completed by hand with nothing watched: the Completed time.
  ('11111111-1111-1111-1111-111111111111', 970102, 'completed', 'user', '2024-04-01T00:00:00Z', null),
  -- Every episode watched, but Watching: absent.
  ('11111111-1111-1111-1111-111111111111', 970103, 'watching', 'system', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  -- Its newest watched episode ties with movie 960102.
  ('11111111-1111-1111-1111-111111111111', 970104, 'completed', 'system', '2024-01-15T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970105, 'on_hold', 'user', '2024-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 970106, 'dropped', 'user', '2024-01-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 970150, 'completed', 'user', '2024-09-01T00:00:00Z', null);
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 980101, 970101, 1, 1, '2024-02-01T00:00:00Z', 8),
  ('11111111-1111-1111-1111-111111111111', 980102, 970101, 0, 1, '2024-06-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 980103, 970103, 1, 1, '2024-07-01T00:00:00Z', 9),
  ('11111111-1111-1111-1111-111111111111', 980104, 970104, 1, 1, '2024-03-01T00:00:00Z', null),
  -- Rated but no longer watched: never a sort time.
  ('11111111-1111-1111-1111-111111111111', 980105, 970104, 1, 2, null, 6),
  ('11111111-1111-1111-1111-111111111111', 980106, 970105, 1, 1, '2024-08-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 980150, 970150, 1, 1, '2024-10-01T00:00:00Z', 9);
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select kind, tmdb_id, last_watched_at, rating from public.user_watched_entries
     order by last_watched_at desc, kind, tmdb_id $$,
  $$ values
       ('tv', 970101, '2024-06-01T00:00:00Z'::timestamptz, null::smallint),
       ('movie', 960101, '2024-05-01T00:00:00Z'::timestamptz, 8::smallint),
       ('tv', 970102, '2024-04-01T00:00:00Z'::timestamptz, null::smallint),
       ('movie', 960102, '2024-03-01T00:00:00Z'::timestamptz, null::smallint),
       ('tv', 970104, '2024-03-01T00:00:00Z'::timestamptz, null::smallint) $$,
  'watched movies and Completed shows, newest first, movies first on a tie'
);
select is(
  (select last_watched_at from public.user_watched_entries where kind = 'tv' and tmdb_id = 970101),
  '2024-06-01T00:00:00Z'::timestamptz,
  'a watched special counts toward the show''s time'
);
select is(
  (select last_watched_at from public.user_watched_entries where kind = 'tv' and tmdb_id = 970102),
  '2024-04-01T00:00:00Z'::timestamptz,
  'a Completed show with nothing watched sorts by when it became Completed'
);
select is(
  (select count(*) from public.user_watched_entries
   where tmdb_id in (960103, 970103, 970105, 970106)),
  0::bigint,
  'unwatched movies and shows in any other status never appear'
);
select is(
  (select count(*) from public.user_watched_entries
   where tmdb_id in (960150, 970150)
      or user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'A sees none of B''s entries'
);
select is(
  (select count(*) from public.user_watched_entries),
  5::bigint,
  'the exact count is A''s five entries'
);

-- Status alone decides presence, and moving it keeps the episodes (AC-4).
select public.set_show_status(970103, 'completed', 'watching');
select is(
  (select last_watched_at from public.user_watched_entries where kind = 'tv' and tmdb_id = 970103),
  '2024-07-01T00:00:00Z'::timestamptz,
  'a show set to Completed appears, at its newest watched episode'
);
select public.set_show_status(970103, 'on_hold', 'completed');
select ok(
  not exists (select 1 from public.user_watched_entries where kind = 'tv' and tmdb_id = 970103)
  and (select watched_at = '2024-07-01T00:00:00Z' and rating = 9
       from public.user_episode_state where episode_id = 980103),
  'a show leaving Completed disappears, its episode history and rating intact'
);

select throws_ok(
  $$ insert into public.user_watched_entries (user_id, kind, tmdb_id)
     values ('11111111-1111-1111-1111-111111111111', 'movie', 960109) $$,
  null, null, 'nothing writes through the view'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.user_watched_entries $$,
  '42501', null, 'anon is refused select on the view'
);

select * from finish();
rollback;
