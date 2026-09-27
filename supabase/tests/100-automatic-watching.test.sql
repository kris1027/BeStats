-- Spec 0013 AC-6 to AC-8: the automatic move to Watching.
--
-- Every row of AC-6 and AC-7: which episode writes start a show, which never
-- do, which statuses they may move, and what `show_started` reports. The
-- automatic move is the only write an episode function makes to
-- `user_show_state`, so each case reads the status row back.
--
-- Shows 920001 to 920020 and episodes 950001 to 950099 are free for user A in
-- this file; show 920050 belongs to user B.

begin;
select plan(30);

set local session_replication_role = replica;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at)
values
  ('22222222-2222-2222-2222-222222222222', 920050, 'want_to_watch', 'user', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 920003, 'want_to_watch', 'user', '2020-02-02T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 920004, 'on_hold', 'user', '2020-02-02T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 920005, 'dropped', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 920006, 'completed', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 920007, 'watching', 'user', '2020-03-03T00:00:00Z');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at)
values
  -- A: already watched, on an untracked show.
  ('11111111-1111-1111-1111-111111111111', 950080, 920008, 1, 1, '2021-01-01T00:00:00Z');
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- AC-6: an untracked show starts on its first regular episode.
select is(
  (select show_started from public.mark_episode_watched(920001, 1::smallint, 1::smallint, 950001)),
  true,
  'marking a regular episode of an untracked show reports show_started'
);
select is(
  (select status::text || '/' || status_source::text || '/' || (listed_at = now())::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920001),
  'watching/system/true',
  'the show is Watching, set by the system, and listed now'
);
select is(
  (select show_started from public.mark_episode_watched(920001, 1::smallint, 2::smallint, 950002)),
  false,
  'a second episode on a show already Watching reports nothing'
);

-- AC-6 through rate_episode and mark_season_watched.
select is(
  (select show_started from public.rate_episode(920002, 2::smallint, 1::smallint, 950010, 7::smallint)),
  true,
  'rating an unwatched regular episode starts an untracked show'
);
select is(
  (select show_started from public.mark_season_watched(
     920010, 1::smallint, array[950020, 950021], array[1, 2]::smallint[])),
  true,
  'marking a season starts an untracked show'
);
select is(
  (select status::text from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920010),
  'watching',
  'the season mark wrote Watching'
);

-- AC-6: Want to Watch moves, and keeps its place on the watchlist.
select is(
  (select show_started from public.mark_episode_watched(920003, 1::smallint, 1::smallint, 950030)),
  true,
  'a Want to Watch show moves to Watching'
);
select is(
  (select status::text || '/' || status_source::text || '/' || listed_at::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920003),
  'watching/system/' || '2020-02-02T00:00:00Z'::timestamptz::text,
  'the moved show keeps its listed_at'
);

-- AC-6: On Hold, Dropped, Completed and Watching never move.
select is(
  (select show_started from public.mark_episode_watched(920004, 1::smallint, 1::smallint, 950040)),
  false,
  'an On Hold show is not resumed'
);
select is(
  (select show_started from public.rate_episode(920005, 1::smallint, 1::smallint, 950050, 5::smallint)),
  false,
  'a Dropped show is not resumed, even when the system set it'
);
select is(
  (select show_started from public.mark_season_watched(
     920006, 1::smallint, array[950060], array[1]::smallint[])),
  false,
  'a Completed show is not touched by a season mark'
);
select is(
  (select show_started from public.mark_episode_watched(920007, 1::smallint, 1::smallint, 950070)),
  false,
  'a Watching show set by the user stays the user''s'
);
select results_eq(
  $$ select show_id, status::text, status_source::text from public.user_show_state
     where user_id = '11111111-1111-1111-1111-111111111111'
       and show_id in (920004, 920005, 920006, 920007)
     order by show_id $$,
  $$ values (920004, 'on_hold', 'user'), (920005, 'dropped', 'system'),
            (920006, 'completed', 'system'), (920007, 'watching', 'user') $$,
  'those four rows are exactly as they were'
);

-- AC-7: specials alone never start a show.
select is(
  (select show_started from public.mark_episode_watched(920011, 0::smallint, 1::smallint, 950090)),
  false,
  'marking a special reports nothing'
);
select is(
  (select show_started from public.rate_episode(920011, 0::smallint, 2::smallint, 950091, 9::smallint)),
  false,
  'rating a special reports nothing'
);
select is(
  (select show_started from public.mark_season_watched(
     920011, 0::smallint, array[950092, 950093], array[3, 4]::smallint[])),
  false,
  'marking the Specials season reports nothing'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920011),
  0::bigint,
  'specials created no status row'
);

-- AC-7: re-marking or rating an episode already watched never starts a show.
select is(
  (select show_started from public.mark_episode_watched(920008, 1::smallint, 1::smallint, 950080)),
  false,
  're-marking an already watched episode reports nothing'
);
select is(
  (select show_started from public.rate_episode(920008, 1::smallint, 1::smallint, 950080, 6::smallint)),
  false,
  'rating an already watched episode reports nothing'
);
select is(
  (select show_started from public.mark_season_watched(
     920008, 1::smallint, array[950080], array[1]::smallint[])),
  false,
  'a season mark that newly marks nothing reports nothing'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920008),
  0::bigint,
  'those writes created no status row'
);

-- AC-7: an unwatched row that is marked again does count as a new watch.
update public.user_episode_state set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 950080;
select is(
  (select show_started from public.mark_episode_watched(920008, 1::smallint, 1::smallint, 950080)),
  true,
  'marking a row whose watched_at is null counts as a new watch'
);

-- AC-7: unmarking, restoring and clearing never change the status row.
select is(
  (select count(*)::int from public.unmark_episodes_watched(920001, array[950001, 950002])),
  2,
  'unmarking the episodes that started the show'
);
update public.user_episode_state set rating = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 950010;
select is(
  (select status::text || '/' || status_source::text from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920001),
  'watching/system',
  'unmarking the episode that started a show leaves it Watching'
);
select is(
  public.restore_episodes_watched(920001, jsonb_build_array(
    jsonb_build_object('episode_id', 950001, 'watched_at', '2022-01-01T00:00:00Z'))),
  1,
  'restoring a date'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920001),
  1::bigint,
  'restoring never adds a second row'
);

-- The helper on its own: false does nothing, and it only reaches the caller.
select is(
  public.start_watching_show(920012, false),
  false,
  'start_watching_show with false writes nothing'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 920012),
  0::bigint,
  'no row was created'
);
select is(
  public.start_watching_show(920050, true),
  true,
  'calling it for B''s show starts A''s own row'
);

reset role;

select ok(
  (select status = 'want_to_watch' and status_source = 'user'
   from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 920050),
  'B''s Want to Watch row is untouched'
);

select * from finish();
rollback;
