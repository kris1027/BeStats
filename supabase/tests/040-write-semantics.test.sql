-- Spec 0001 AC-6 to AC-13: what the database guarantees about writes,
-- independently of any application validation.
--
-- Run as user A throughout, except the cascade test, which needs the
-- privileged role to delete an account.

begin;
select plan(20);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- AC-6: repeated writes never duplicate. The primary key is the idempotency
-- mechanism, so writing the same state twice is a no-op plus an update.
insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at, rating)
values ('11111111-1111-1111-1111-111111111111', 550, true, now(), 7)
on conflict (user_id, movie_id) do update
  set in_watchlist = excluded.in_watchlist,
      watched_at = excluded.watched_at,
      rating = excluded.rating;

insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at, rating)
values ('11111111-1111-1111-1111-111111111111', 550, true, now(), 8)
on conflict (user_id, movie_id) do update
  set in_watchlist = excluded.in_watchlist,
      watched_at = excluded.watched_at,
      rating = excluded.rating;

select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 550),
  1::bigint,
  'writing the same movie twice leaves one row'
);
select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 550),
  8::smallint,
  'the second write wins on the columns it carried'
);

-- AC-6, the season shape: one array upsert, repeated. This is how marking a
-- whole season watched behaves, and it must stay idempotent.
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at)
values
  ('11111111-1111-1111-1111-111111111111', 62085, 1396, 1, 1, now()),
  ('11111111-1111-1111-1111-111111111111', 62086, 1396, 1, 2, now()),
  ('11111111-1111-1111-1111-111111111111', 62087, 1396, 1, 3, now())
on conflict (user_id, episode_id) do update set watched_at = excluded.watched_at;

select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 1396
     and season_number = 1),
  3::bigint,
  'marking a season watched twice still leaves one row per episode'
);
-- The payload carried watched_at and nothing else, so ratings survive by
-- omission. This is the mechanism spec 0001 calls the partial write rule, and
-- the most likely way to break it is to send the whole form state.
select is(
  (select rating from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 62085),
  10::smallint,
  'marking a season watched did not overwrite an existing episode rating'
);

-- AC-10: watched state and rating are independent in both directions.
update public.user_movie_state set watched_at = null
  where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 550;
select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 550),
  8::smallint,
  'clearing a watched mark leaves the rating untouched'
);
update public.user_movie_state set rating = null
  where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 27205;
select is(
  (select in_watchlist from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 27205),
  true,
  'clearing a rating leaves the rest of the row untouched'
);

-- AC-7: rating bounds are enforced by the database, not only by Zod.
select throws_ok(
  $$insert into public.user_movie_state (user_id, movie_id, rating)
    values ('11111111-1111-1111-1111-111111111111', 700, 0)$$,
  '23514', null, 'a rating of 0 is rejected'
);
select throws_ok(
  $$insert into public.user_movie_state (user_id, movie_id, rating)
    values ('11111111-1111-1111-1111-111111111111', 700, 11)$$,
  '23514', null, 'a rating of 11 is rejected'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number, rating)
    values ('11111111-1111-1111-1111-111111111111', 700, 1, 1, 1, -3)$$,
  '23514', null, 'a negative episode rating is rejected'
);
select lives_ok(
  $$insert into public.user_movie_state (user_id, movie_id, rating)
    values ('11111111-1111-1111-1111-111111111111', 701, null)$$,
  'a null rating is allowed, because not rated is not zero'
);

-- AC-8: only the five statuses and the two sources exist.
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id, status, status_source)
    values ('11111111-1111-1111-1111-111111111111', 700, 'binging', 'user')$$,
  '22P02', null, 'a status outside the five is rejected'
);
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id, status, status_source)
    values ('11111111-1111-1111-1111-111111111111', 701, 'watching', 'robot')$$,
  '22P02', null, 'a status_source outside user and system is rejected'
);

-- AC-9: season 0 is storable so specials can be tracked; episode 0 is not.
select lives_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 702, 1396, 0, 1)$$,
  'a season 0 special can be stored'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 703, 1396, -1, 1)$$,
  '23514', null, 'a negative season number is rejected'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 704, 1396, 1, 0)$$,
  '23514', null, 'an episode number of 0 is rejected'
);

-- AC-13: an episode row needs no show status row. Show 4242 has none.
select lives_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 705, 4242, 1, 1)$$,
  'an episode row can be written for a show with no status row'
);

-- AC-12: timestamps maintained by triggers, never by the write path. The
-- fixture rows are inserted with an old timestamp so the advance is visible
-- inside a single transaction, where now() is fixed at transaction start.
insert into public.user_show_state
  (user_id, show_id, status, status_source, status_changed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 4242, 'watching', 'user',
   '2020-01-01', '2020-01-01', '2020-01-01');

update public.user_show_state set status_source = 'system'
  where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242;

select ok(
  (select updated_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242)
  > '2020-06-01'::timestamptz,
  'updated_at advanced on update without the write path setting it'
);
select is(
  (select status_changed_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242),
  '2020-01-01'::timestamptz,
  'status_changed_at did not move when only another column changed'
);

update public.user_show_state set status = 'completed'
  where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242;

select ok(
  (select status_changed_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242)
  > '2020-06-01'::timestamptz,
  'status_changed_at advanced when the status actually changed'
);

-- AC-11: deleting an account takes every row it owned with it.
reset role;
reset request.jwt.claims;

delete from auth.users where id = '22222222-2222-2222-2222-222222222222';

select is(
  (
    select
      (select count(*) from public.user_movie_state
       where user_id = '22222222-2222-2222-2222-222222222222')
    + (select count(*) from public.user_show_state
       where user_id = '22222222-2222-2222-2222-222222222222')
    + (select count(*) from public.user_episode_state
       where user_id = '22222222-2222-2222-2222-222222222222')
  ),
  0::bigint,
  'deleting an account leaves no orphaned rows in any table'
);

select * from finish();
rollback;
