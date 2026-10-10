-- Spec 0001 AC-6 to AC-13: what the database guarantees about writes,
-- independently of any application validation.
--
-- Run as user A throughout, except the cascade test, which needs the
-- privileged role to delete an account.

begin;
select plan(27);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- AC-6: repeated writes never duplicate. The primary key is the idempotency
-- mechanism, so writing the same state twice is a no-op plus an update.
insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at, rating)
values ('11111111-1111-1111-1111-111111111111', 550, false, now(), 7)
on conflict (user_id, movie_id) do update
  set in_watchlist = excluded.in_watchlist,
      watched_at = excluded.watched_at,
      rating = excluded.rating;

insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at, rating)
values ('11111111-1111-1111-1111-111111111111', 550, false, now(), 8)
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
-- whole season watched behaves, and it must stay idempotent. The count names
-- the three episodes written here, not the whole season, so rows a manual check
-- in the running app left on the local stack cannot change the result.
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at)
values
  ('11111111-1111-1111-1111-111111111111', 62085, 1396, 1, 1, now()),
  ('11111111-1111-1111-1111-111111111111', 62086, 1396, 1, 2, now()),
  ('11111111-1111-1111-1111-111111111111', 62087, 1396, 1, 3, now())
on conflict (user_id, episode_id) do update set watched_at = excluded.watched_at;

select is(
  (select count(*) from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and episode_id in (62085, 62086, 62087)),
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

-- AC-6, the third shape. AC-6 names movies, shows and episodes; without this
-- the show table is the one whose idempotency nothing proves.
insert into public.user_show_state (user_id, show_id)
values ('11111111-1111-1111-1111-111111111111', 5555)
on conflict (user_id, show_id) do nothing;

insert into public.user_show_state (user_id, show_id)
values ('11111111-1111-1111-1111-111111111111', 5555)
on conflict (user_id, show_id) do nothing;

select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 5555),
  1::bigint,
  'writing the same show twice leaves one row'
);
select is(
  public.track_show(5555),
  false,
  'tracking the same show again through track_show is a no op'
);

-- AC-10, as prompts/movie-plan-watched-exclusive.md amends it for movies: a
-- movie score needs a watch mark, so clearing the mark alone is refused (the
-- app clears both through `unmark_movie_watched`). Clearing a score still
-- leaves the rest of the row alone.
select throws_ok(
  $$update public.user_movie_state set watched_at = null
    where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 550$$,
  '23514', null, 'clearing a scored movie''s watch mark alone is refused'
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
  $$insert into public.user_movie_state (user_id, movie_id, watched_at, rating)
    values ('11111111-1111-1111-1111-111111111111', 700, now(), 0)$$,
  '23514', null, 'a rating of 0 is rejected'
);
select throws_ok(
  $$insert into public.user_movie_state (user_id, movie_id, watched_at, rating)
    values ('11111111-1111-1111-1111-111111111111', 700, now(), 11)$$,
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
-- The two ends of the range, which AC-7 calls inclusive. Only the rejections
-- above are not enough: a check written as `between 2 and 10` would pass every
-- one of them while quietly making 1 unreachable.
select lives_ok(
  $$insert into public.user_movie_state (user_id, movie_id, watched_at, rating)
    values ('11111111-1111-1111-1111-111111111111', 706, now(), 1)$$,
  'a rating of 1 is accepted, so the lower bound is inclusive'
);
select lives_ok(
  $$insert into public.user_movie_state (user_id, movie_id, watched_at, rating)
    values ('11111111-1111-1111-1111-111111111111', 707, now(), 10)$$,
  'a rating of 10 is accepted, so the upper bound is inclusive'
);

-- AC-8, as spec 0020 (amended 2026-10-10) replaces it: a show is tracked
-- or not, so no status or hold can be stored at all.
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id, status)
    values ('11111111-1111-1111-1111-111111111111', 700, 'watching')$$,
  '42703', null, 'a show row has no status to store'
);
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id, hold_state)
    values ('11111111-1111-1111-1111-111111111111', 701, 'paused')$$,
  '42703', null, 'a show row has no hold to store'
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

-- A TMDB id is always positive, so a 0 or negative id is a bug upstream rather
-- than data. AC-1 counts these checks as part of the schema the migration must
-- create, and nothing else exercises them.
select throws_ok(
  $$insert into public.user_movie_state (user_id, movie_id)
    values ('11111111-1111-1111-1111-111111111111', 0)$$,
  '23514', null, 'a movie id of 0 is rejected'
);
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id)
    values ('11111111-1111-1111-1111-111111111111', -1)$$,
  '23514', null, 'a negative show id is rejected'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 0, 1396, 1, 1)$$,
  '23514', null, 'an episode id of 0 is rejected'
);

-- AC-13: an episode row needs no tracked show row. Show 4242 has none.
select lives_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 705, 4242, 1, 1)$$,
  'an episode row can be written for a show that is not tracked'
);

-- AC-12: timestamps maintained by triggers, never by the write path. The
-- fixture rows are inserted with an old timestamp so the advance is visible
-- inside a single transaction, where now() is fixed at transaction start.
insert into public.user_show_state (user_id, show_id, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', 4242, '2020-01-01', '2020-01-01');

update public.user_show_state set created_at = '2020-01-01'
  where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242;

select ok(
  (select updated_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242)
  > '2020-06-01'::timestamptz,
  'updated_at advanced on update without the write path setting it'
);
select is(
  (select tracked_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242),
  now(),
  'tracked_at was stamped on insert and did not move on update'
);

update public.user_show_state set tracked_at = '2020-01-01'
  where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242;

select is(
  (select tracked_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 4242),
  now(),
  'an update that sends tracked_at keeps the stored one'
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
