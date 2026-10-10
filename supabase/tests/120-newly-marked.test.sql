-- Spec 0014 AC-9 and AC-15, carried into spec 0020 AC-9: the `newly_marked`
-- column of `mark_episode_watched`.
--
-- The Watchlist card offers Undo only for a mark it made, so `newly_marked`
-- must be true only for the call that set the mark, and marking an episode id
-- another user watched must write the caller's own row and leave theirs
-- alone. The Up Next view this file once pinned went with the spec 0020
-- contract migration.
--
-- Show 980001 and episodes 985001 to 985099 are free for user A in this
-- file; show 980050 and episode 985150 belong to user B.

begin;
select plan(6);

-- Fixtures with known times, triggers off.
set local session_replication_role = replica;
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  -- Rated but unwatched.
  ('11111111-1111-1111-1111-111111111111', 985003, 980001, 1, 2, null, 8),
  ('22222222-2222-2222-2222-222222222222', 985150, 980050, 1, 1, '2024-12-01T00:00:00Z', null);
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

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

select * from finish();
rollback;
