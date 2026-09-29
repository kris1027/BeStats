-- Spec 0014 AC-3, AC-9 and AC-15: the `user_up_next_shows` view and the
-- `newly_marked` column of `mark_episode_watched`.
--
-- Pins that the view runs with the reader's rights, who may select it, that
-- it lists Watching shows only, how `last_activity_at` is worked out (regular
-- episodes only, falling back to the status change), the page's order, and
-- that one user never sees another's rows through it. Then that
-- `newly_marked` is true only for the call that set the mark.
--
-- Shows 980001 to 980049 and episodes 985001 to 985099 are free for user A in
-- this file; show 980050 and episode 985150 belong to user B.

begin;
select plan(14);

select ok(
  (select 'security_invoker=true' = any(reloptions)
   from pg_class where oid = 'public.user_up_next_shows'::regclass),
  'the view runs with the reader''s rights'
);
select ok(
  not has_table_privilege('anon', 'public.user_up_next_shows', 'select')
  and not has_table_privilege('anon', 'public.user_up_next_shows', 'insert'),
  'anon holds no privilege on the view'
);
select ok(
  has_table_privilege('authenticated', 'public.user_up_next_shows', 'select')
  and not has_table_privilege('authenticated', 'public.user_up_next_shows', 'insert')
  and not has_table_privilege('authenticated', 'public.user_up_next_shows', 'update')
  and not has_table_privilege('authenticated', 'public.user_up_next_shows', 'delete'),
  'authenticated can only select from the view'
);

-- Fixtures with known times, triggers off.
set local session_replication_role = replica;
delete from public.user_episode_state;
delete from public.user_show_state;
insert into public.user_show_state
  (user_id, show_id, status, status_source, status_changed_at, listed_at)
values
  -- Activity from a watched episode, later than the status change.
  ('11111111-1111-1111-1111-111111111111', 980001, 'watching', 'user', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  -- Nothing watched: the status change alone.
  ('11111111-1111-1111-1111-111111111111', 980002, 'watching', 'system', '2024-06-01T00:00:00Z', '2024-06-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 980003, 'watching', 'user', '2024-02-01T00:00:00Z', '2024-02-01T00:00:00Z'),
  -- A status change later than every watched episode wins.
  ('11111111-1111-1111-1111-111111111111', 980004, 'watching', 'user', '2024-07-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 980005, 'want_to_watch', 'user', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 980006, 'on_hold', 'user', '2024-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 980007, 'dropped', 'user', '2024-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 980008, 'completed', 'user', '2024-01-01T00:00:00Z', null),
  -- Ties with 980002, so the `show_id` tiebreak shows.
  ('11111111-1111-1111-1111-111111111111', 980009, 'watching', 'user', '2024-06-01T00:00:00Z', '2024-06-01T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 980050, 'watching', 'user', '2024-08-01T00:00:00Z', '2024-08-01T00:00:00Z');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 985001, 980001, 1, 1, '2024-05-01T00:00:00Z', null),
  -- A later special and an unmarked row with a rating never count.
  ('11111111-1111-1111-1111-111111111111', 985002, 980001, 0, 1, '2024-09-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 985003, 980001, 1, 2, null, 8),
  ('11111111-1111-1111-1111-111111111111', 985010, 980003, 1, 1, '2024-03-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 985040, 980004, 1, 1, '2024-04-01T00:00:00Z', null),
  -- Recent activity on shows that are not Watching.
  ('11111111-1111-1111-1111-111111111111', 985050, 980005, 1, 1, '2024-12-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 985060, 980006, 1, 1, '2024-12-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 985070, 980007, 1, 1, '2024-12-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 985080, 980008, 1, 1, '2024-12-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 985150, 980050, 1, 1, '2024-12-01T00:00:00Z', null);
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select show_id, last_activity_at from public.user_up_next_shows
     order by last_activity_at desc, show_id asc $$,
  $$ values (980004, '2024-07-01T00:00:00Z'::timestamptz),
            (980002, '2024-06-01T00:00:00Z'::timestamptz),
            (980009, '2024-06-01T00:00:00Z'::timestamptz),
            (980001, '2024-05-01T00:00:00Z'::timestamptz),
            (980003, '2024-03-01T00:00:00Z'::timestamptz) $$,
  'Watching shows only, by their latest regular episode or status change, then show id'
);
select is(
  (select count(*) from public.user_up_next_shows
   where show_id in (980005, 980006, 980007, 980008)),
  0::bigint,
  'Want to Watch, On Hold, Dropped and Completed shows never appear'
);
select is(
  (select count(*) from public.user_up_next_shows
   where show_id = 980050 or user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'A sees none of B''s shows'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq(
  $$ select show_id from public.user_up_next_shows $$,
  $$ values (980050) $$,
  'B sees only B''s show'
);

-- newly_marked (AC-9), as user A again.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select newly_marked from public.mark_episode_watched(980001, 1::smallint, 3::smallint, 985004)),
  true,
  'the call that creates the mark reports newly_marked'
);

-- Another transaction marked it earlier: its time is kept, so this call did
-- not set the mark.
update public.user_episode_state
set watched_at = '2020-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 985004;
select is(
  (select newly_marked from public.mark_episode_watched(980001, 1::smallint, 3::smallint, 985004)),
  false,
  'marking an episode an earlier transaction marked reports newly_marked false'
);

select is(
  (select newly_marked from public.mark_episode_watched(980001, 1::smallint, 2::smallint, 985003)),
  true,
  'marking a rated but unwatched episode reports newly_marked'
);
select is(
  (select rating from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 985003),
  8::smallint,
  'marking it keeps its rating'
);

-- Marking an id B already watched writes A's own row and leaves B's alone
-- (AC-15): the owner is `auth.uid()`, never an argument.
select is(
  (select newly_marked from public.mark_episode_watched(980050, 1::smallint, 1::smallint, 985150)),
  true,
  'A marking an episode id B watched sets A''s own mark'
);

reset role;
select is(
  (select watched_at from public.user_episode_state
   where user_id = '22222222-2222-2222-2222-222222222222' and episode_id = 985150),
  '2024-12-01T00:00:00Z'::timestamptz,
  'B''s mark on that episode is untouched'
);

set local role anon;
select throws_ok(
  $$ select * from public.user_up_next_shows $$,
  '42501', null, 'anon is refused select on the view'
);

select * from finish();
rollback;
