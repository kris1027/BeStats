-- Game data model (spec 0024): the checks that hold the games rules on
-- `user_game_state`, and `set_game_timestamps`, which owns every date and
-- pins each row's identity, whatever a client sends.
--
-- Runs as user A from supabase/seed.sql, who owns games 1942 (Playing, 8) and
-- 119133 (Finished). Every new row uses an id the seed does not, and the whole
-- file is rolled back. `now()` is fixed for the whole transaction, so a date
-- equal to it was stamped here, and the fixture rows below carry earlier,
-- distinct dates so a kept date is told apart from a new one.

begin;
select plan(30);

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

-- Shape

reset role;

select ok(
  (select not prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.set_game_timestamps()'::regprocedure)
  and not has_function_privilege('authenticated', 'public.set_game_timestamps()', 'execute')
  and not has_function_privilege('anon', 'public.set_game_timestamps()', 'execute'),
  'the trigger function is security invoker, has an empty search_path, and nobody may call it'
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- Insert (AC-4): every insert sends 2000-01-01 for all five dates, and the
-- trigger replaces each one.

insert into public.user_game_state
  (user_id, game_id, status, added_at, started_at, finished_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 5101, 'want_to_play',
   '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01'),
  ('11111111-1111-1111-1111-111111111111', 5102, 'playing',
   '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01'),
  ('11111111-1111-1111-1111-111111111111', 5103, 'finished',
   '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01', '2000-01-01');

select ok(
  (select added_at = now() and started_at is null and finished_at is null
     and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5101),
  'adding as Want to play stamps added, created and updated now, and no start or finish'
);
select ok(
  (select added_at = now() and started_at = now() and finished_at is null
     and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5102),
  'adding as Playing stamps added and started now, and no finish'
);
select ok(
  (select added_at = now() and started_at is null and finished_at = now()
     and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5103),
  'adding as Finished stamps added and finished now, and no start'
);

-- Update fixtures: earlier, distinct dates, written under the escape.
select set_config('bestats.restore_game', 'on', true);
insert into public.user_game_state (user_id, game_id, status, rating, added_at, started_at, finished_at)
values
  ('11111111-1111-1111-1111-111111111111', 5201, 'want_to_play', null, '2026-01-01', null, null),
  ('11111111-1111-1111-1111-111111111111', 5202, 'want_to_play', null, '2026-01-01', null, null),
  ('11111111-1111-1111-1111-111111111111', 5203, 'playing', 6, '2026-01-01', '2026-02-01', null),
  ('11111111-1111-1111-1111-111111111111', 5204, 'finished', 7, '2026-01-01', null, '2026-03-01'),
  ('11111111-1111-1111-1111-111111111111', 5205, 'finished', 7, '2026-01-01', '2026-02-01', '2026-03-01'),
  ('11111111-1111-1111-1111-111111111111', 5206, 'playing', 9, '2026-01-01', '2026-02-01', '2025-12-01'),
  ('11111111-1111-1111-1111-111111111111', 5207, 'playing', 5, '2026-01-01', '2026-02-01', null),
  ('11111111-1111-1111-1111-111111111111', 5208, 'finished', 8, '2026-01-01', '2026-02-01', '2026-03-01');
select set_config('bestats.restore_game', 'off', true);

-- Update (AC-5): every update sends 1999-01-01 for all five dates, and the
-- trigger decides each one from the stored row.

update public.user_game_state
  set status = 'playing', added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01', updated_at = '1999-01-01'
  where game_id = 5201;
select ok(
  (select added_at = '2026-01-01' and started_at = now() and finished_at is null
     and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5201),
  'Want to play to Playing keeps added and stamps the first start'
);

update public.user_game_state
  set status = 'finished', added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01', updated_at = '1999-01-01'
  where game_id = 5202;
select ok(
  (select added_at = '2026-01-01' and started_at is null and finished_at = now()
   from public.user_game_state where game_id = 5202),
  'Want to play to Finished keeps added and the empty start, and stamps the finish'
);

update public.user_game_state
  set status = 'finished', added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01', updated_at = '1999-01-01'
  where game_id = 5203;
select ok(
  (select added_at = '2026-01-01' and started_at = '2026-02-01' and finished_at = now()
     and rating = 6
   from public.user_game_state where game_id = 5203),
  'Playing to Finished keeps added, the start and the score, and stamps the finish'
);

update public.user_game_state
  set status = 'playing', added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01', updated_at = '1999-01-01'
  where game_id = 5204;
select ok(
  (select added_at = '2026-01-01' and started_at = now() and finished_at = '2026-03-01'
     and rating = 7
   from public.user_game_state where game_id = 5204),
  'a game set straight to Finished, then replayed, gets its first start after its finish (AC-3)'
);

update public.user_game_state
  set status = 'playing', added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01', updated_at = '1999-01-01'
  where game_id = 5205;
select ok(
  (select added_at = '2026-01-01' and started_at = '2026-02-01' and finished_at = '2026-03-01'
     and rating = 7
   from public.user_game_state where game_id = 5205),
  'Finished to Playing keeps the first start, the finish and the score'
);

-- Back to Want to play (AC-2): the score is never cleared silently.
select throws_ok(
  $$update public.user_game_state set status = 'want_to_play' where game_id = 5206$$,
  '23514', null,
  'moving a scored game to Want to play without nulling the score is refused'
);
update public.user_game_state
  set status = 'want_to_play', rating = null, added_at = '1999-01-01',
      started_at = '1999-01-01', finished_at = '1999-01-01'
  where game_id = 5206;
select ok(
  (select added_at = now() and started_at = '2026-02-01' and finished_at = '2025-12-01'
     and rating is null and status = 'want_to_play'
   from public.user_game_state where game_id = 5206),
  'with the score nulled in the same write it moves, stamping added and keeping start and finish'
);

-- Same status (AC-5): a score change moves no date.
update public.user_game_state
  set rating = 3, added_at = '1999-01-01', started_at = '1999-01-01',
      finished_at = '1999-01-01', created_at = '1999-01-01'
  where game_id = 5207;
select ok(
  (select added_at = '2026-01-01' and started_at = '2026-02-01' and finished_at is null
     and rating = 3 and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5207),
  'a score only change moves no list date and stamps only updated'
);

-- created_at is pinned on a row made before this transaction.
update public.user_game_state set rating = 9, created_at = '1999-01-01'
  where game_id = 1942;
select ok(
  (select created_at < now() and created_at > '2026-01-01' and updated_at = now()
     and added_at = '2026-09-01T10:00:00Z' and started_at = '2026-09-05T10:00:00Z'
   from public.user_game_state where game_id = 1942),
  'an update keeps the stored created_at and the seeded dates, and stamps updated now'
);

-- Identity pin (AC-6). The user_id half is in 030, as the cross user case.
select lives_ok(
  $$update public.user_game_state set game_id = 9999 where game_id = 5207$$,
  'an update that sends another game id is not an error'
);
select ok(
  exists (select 1 from public.user_game_state where game_id = 5207)
  and not exists (select 1 from public.user_game_state where game_id = 9999),
  'the row keeps its game id'
);

-- Upsert shapes (AC-8).
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, rating)
    values ('11111111-1111-1111-1111-111111111111', 5208, 4)
    on conflict (user_id, game_id) do update set rating = excluded.rating$$,
  '23502', null,
  'an upsert without a status fails even when the row exists'
);
select throws_ok(
  $$insert into public.user_game_state (user_id, game_id, status)
    values ('11111111-1111-1111-1111-111111111111', 5208, 'want_to_play')
    on conflict (user_id, game_id) do update set status = excluded.status$$,
  '23514', null,
  'an upsert to Want to play that does not send a null score fails'
);
insert into public.user_game_state (user_id, game_id, status, rating)
  values ('11111111-1111-1111-1111-111111111111', 5208, 'finished', 8)
  on conflict (user_id, game_id) do update
    set status = excluded.status, rating = excluded.rating;
insert into public.user_game_state (user_id, game_id, status, rating)
  values ('11111111-1111-1111-1111-111111111111', 5208, 'finished', 8)
  on conflict (user_id, game_id) do update
    set status = excluded.status, rating = excluded.rating;
select ok(
  (select count(*) = 1 from public.user_game_state where game_id = 5208)
  and (select added_at = '2026-01-01' and started_at = '2026-02-01'
         and finished_at = '2026-03-01' and created_at = now()
       from public.user_game_state where game_id = 5208),
  'the same upsert twice leaves one row and moves no date'
);
select lives_ok(
  $$update public.user_game_state set rating = 2 where game_id = 5208$$,
  'a score only PATCH succeeds'
);

-- Restore escape (AC-7).
select set_config('bestats.restore_game', 'on', true);

insert into public.user_game_state
  (user_id, game_id, status, rating, added_at, started_at, finished_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 5301, 'playing', 6,
   '2026-01-05', '2026-01-06', '2026-01-07', '2000-01-01', '2000-01-01');
select ok(
  (select added_at = '2026-01-05' and started_at = '2026-01-06' and finished_at = '2026-01-07'
     and created_at = now() and updated_at = now()
   from public.user_game_state where game_id = 5301),
  'under the escape an insert keeps its list dates, and still owns created and updated'
);

update public.user_game_state
  set game_id = 9998, status = 'want_to_play', rating = null,
      added_at = '2026-01-02', created_at = '2000-01-01'
  where game_id = 5301;
select ok(
  (select added_at = '2026-01-02' and started_at = '2026-01-06' and created_at = now()
     and updated_at = now()
   from public.user_game_state where game_id = 5301)
  and not exists (select 1 from public.user_game_state where game_id = 9998),
  'under the escape an update keeps the dates it is given, but not a new identity or created'
);

select set_config('bestats.restore_game', 'off', true);

insert into public.user_game_state (user_id, game_id, status, added_at, started_at)
values ('11111111-1111-1111-1111-111111111111', 5302, 'playing', '2026-01-05', '2026-01-06');
select ok(
  (select added_at = now() and started_at = now()
   from public.user_game_state where game_id = 5302),
  'with the escape set back to off the same insert gets now'
);

-- Cascade (AC-11): deleting an account takes its games with it.
reset role;
reset request.jwt.claims;

delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.user_game_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'deleting user B leaves none of their game rows'
);

select * from finish();
rollback;
