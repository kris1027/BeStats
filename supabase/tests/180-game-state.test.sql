-- Game data model (spec 0024): the checks that hold the games rules on
-- `user_game_state`, whatever a client sends.
--
-- Runs as user A from supabase/seed.sql, who owns games 1942 (Playing, 8) and
-- 119133 (Finished). Every new row uses an id the seed does not, and the whole
-- file is rolled back.

begin;
select plan(7);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- Checks (AC-1, AC-2, AC-3)

select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status, rating)
    values ('11111111-1111-1111-1111-111111111111', 5001, 'playing', 0)$$,
  '23514', null,
  'a score of 0 is refused'
);
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status, rating)
    values ('11111111-1111-1111-1111-111111111111', 5001, 'playing', 11)$$,
  '23514', null,
  'a score of 11 is refused'
);
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status)
    values ('11111111-1111-1111-1111-111111111111', 0, 'want_to_play')$$,
  '23514', null,
  'a game id of 0 is refused'
);
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status, rating)
    values ('11111111-1111-1111-1111-111111111111', 5001, 'want_to_play', 7)$$,
  '23514', null,
  'a score on a Want to play game is refused'
);

-- The trigger would stamp the missing dates, so these go in under the restore
-- escape, the one path that keeps the dates it is given.
select set_config('bestats.restore_game', 'on', true);

select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status, started_at)
    values ('11111111-1111-1111-1111-111111111111', 5001, 'playing', null)$$,
  '23514', null,
  'a Playing game with no start is refused, even under the restore escape'
);
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status, finished_at)
    values ('11111111-1111-1111-1111-111111111111', 5001, 'finished', null)$$,
  '23514', null,
  'a Finished game with no finish is refused, even under the restore escape'
);
select lives_ok(
  $$insert into public.user_game_state (user_id, game_id, status, started_at, finished_at)
    values ('11111111-1111-1111-1111-111111111111', 5002, 'playing',
            '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z')$$,
  'a start after the finish is allowed: a replayed game has one'
);

select set_config('bestats.restore_game', 'off', true);

reset role;
select * from finish();
rollback;
