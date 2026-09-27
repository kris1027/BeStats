-- Spec 0013 AC-13, AC-14 and AC-20: the `user_watchlist_entries` view.
--
-- Pins that it runs with the reader's rights, who may select it, which rows
-- it holds, the merged order the watchlist page asks for, and that one user
-- never sees another's entries through it.
--
-- Movies 960001 to 960009 and shows 970001 to 970009 are free for user A in
-- this file; movie 960050 and show 970050 belong to user B.

begin;
select plan(9);

select ok(
  (select 'security_invoker=true' = any(reloptions)
   from pg_class where oid = 'public.user_watchlist_entries'::regclass),
  'the view runs with the reader''s rights'
);
select ok(
  not has_table_privilege('anon', 'public.user_watchlist_entries', 'select')
  and not has_table_privilege('anon', 'public.user_watchlist_entries', 'insert'),
  'anon holds no privilege on the view'
);
select ok(
  has_table_privilege('authenticated', 'public.user_watchlist_entries', 'select')
  and not has_table_privilege('authenticated', 'public.user_watchlist_entries', 'insert')
  and not has_table_privilege('authenticated', 'public.user_watchlist_entries', 'update')
  and not has_table_privilege('authenticated', 'public.user_watchlist_entries', 'delete'),
  'authenticated can only select from the view'
);

-- Fixtures with known times, triggers off. Two entries share one instant, so
-- the tiebreaks show.
set local session_replication_role = replica;
delete from public.user_movie_state;
delete from public.user_show_state;
insert into public.user_movie_state
  (user_id, movie_id, in_watchlist, watchlisted_at)
values
  ('11111111-1111-1111-1111-111111111111', 960001, true, '2024-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 960002, true, '2024-03-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 960003, false, '2024-05-01T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 960050, true, '2024-06-01T00:00:00Z');
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at)
values
  ('11111111-1111-1111-1111-111111111111', 970001, 'want_to_watch', 'user', '2024-02-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 970002, 'watching', 'system', '2024-03-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 970003, 'on_hold', 'user', '2024-04-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 970004, 'dropped', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 970005, 'completed', 'user', null),
  ('22222222-2222-2222-2222-222222222222', 970050, 'watching', 'user', '2024-06-01T00:00:00Z');
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select kind, tmdb_id, status::text from public.user_watchlist_entries
     order by listed_at desc, kind, tmdb_id $$,
  $$ values ('movie', 960002, null::text), ('tv', 970002, 'watching'),
            ('tv', 970001, 'want_to_watch'), ('movie', 960001, null::text) $$,
  'planned movies and Want to Watch or Watching shows, newest first, movies first on a tie'
);
select is(
  (select count(*) from public.user_watchlist_entries where kind = 'tv' and tmdb_id in (970003, 970004, 970005)),
  0::bigint,
  'On Hold, Dropped and Completed shows never appear'
);
select is(
  (select count(*) from public.user_watchlist_entries
   where tmdb_id in (960050, 970050)
      or user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'A sees none of B''s entries'
);
select is(
  (select count(*) from public.user_watchlist_entries),
  4::bigint,
  'the exact count is A''s four entries'
);

-- Starting a planned show keeps its place (AC-14).
select public.set_show_status(970001, 'watching', 'want_to_watch');
select is(
  (select listed_at from public.user_watchlist_entries where kind = 'tv' and tmdb_id = 970001),
  '2024-02-01T00:00:00Z'::timestamptz,
  'Want to Watch to Watching keeps the card where it was'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.user_watchlist_entries $$,
  '42501', null, 'anon is refused select on the view'
);

select * from finish();
rollback;
