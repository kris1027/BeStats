-- Game status and rating functions (spec 0026, AC-3 to AC-6, AC-13, AC-14):
-- `set_game_status`, `rate_game`, `remove_game`, `restore_game_status` and
-- `restore_removed_game`, their guards and refusals, and their grants.
--
-- Runs as user A from supabase/seed.sql, who owns games 1942 (Playing, 8) and
-- 119133 (Finished); user B owns 1942 (Want to play). New rows use ids the
-- seed does not, and the whole file is rolled back. `now()` is fixed for the
-- transaction, so a date equal to it was stamped here. Rows whose
-- `updated_at` must sit at a window boundary are pinned as `postgres` with
-- `session_replication_role = replica`, which skips the trigger that would
-- stamp it now, as 070 does.

begin;
select plan(49);

-- Shape (AC-13)

select is(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('set_game_status', 'rate_game', 'remove_game',
                     'restore_game_status', 'restore_removed_game')
     and not prosecdef
     and proconfig = array['search_path=""']),
  5::bigint,
  'all five functions are security invoker with an empty search_path'
);
select is(
  (select count(*) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('set_game_status', 'rate_game', 'remove_game',
                       'restore_game_status', 'restore_removed_game')
     and (has_function_privilege('anon', p.oid, 'execute')
          or exists (
            select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0))),
  0::bigint,
  'neither anon nor public may execute any of them'
);
select is(
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('set_game_status', 'rate_game', 'remove_game',
                     'restore_game_status', 'restore_removed_game')
     and has_function_privilege('authenticated', oid, 'execute')),
  5::bigint,
  'authenticated may execute all five'
);

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$select * from public.set_game_status(5201, 'want_to_play')$$,
  '42501', null,
  'anon cannot set a status'
);
select throws_ok(
  $$select * from public.remove_game(1942)$$,
  '42501', null,
  'anon cannot remove a game'
);
reset role;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- set_game_status (AC-3, AC-5)

select results_eq(
  $$select prev_status::text, prev_rating, prev_added_at from public.set_game_status(5201, 'want_to_play')$$,
  $$values (null::text, null::smallint, null::timestamptz)$$,
  'a first status returns exactly one row of nulls'
);
select ok(
  (select status = 'want_to_play' and rating is null and added_at = now()
   from public.user_game_state where game_id = 5201),
  'a first status inserts the row with the trigger''s dates'
);
select lives_ok(
  $$select * from public.set_game_status(5201, 'want_to_play')$$,
  'setting the same status again succeeds'
);
select is(
  (select count(*) from public.user_game_state where game_id = 5201),
  1::bigint,
  'the same status twice leaves one row'
);

select results_eq(
  $$select prev_status::text, prev_rating from public.set_game_status(1942, 'finished')$$,
  $$values ('playing'::text, 8::smallint)$$,
  'a move returns the previous status and score'
);
select ok(
  (select status = 'finished' and rating = 8
     and started_at = '2026-09-05T10:00:00Z' and finished_at = now()
   from public.user_game_state where game_id = 1942),
  'Playing to Finished keeps the score and the start, and stamps the finish'
);

select results_eq(
  $$select prev_status::text, prev_rating, prev_added_at, prev_started_at, prev_finished_at
    from public.set_game_status(1942, 'want_to_play')$$,
  $$values ('finished'::text, 8::smallint, '2026-09-01T10:00:00Z'::timestamptz,
            '2026-09-05T10:00:00Z'::timestamptz, now())$$,
  'a move to Want to play returns every previous value, the Undo payload'
);
select ok(
  (select status = 'want_to_play' and rating is null and added_at = now()
   from public.user_game_state where game_id = 1942),
  'a move to Want to play clears the score in the same statement'
);

select results_eq(
  $$select prev_status::text, prev_rating from public.set_game_status(119133, 'want_to_play')$$,
  $$values ('finished'::text, null::smallint)$$,
  'a move from unscored Finished returns a null previous score'
);

select ok(
  (select prosrc like '%for update%' from pg_proc
   where oid = 'public.set_game_status(integer, public.game_status)'::regprocedure),
  'set_game_status locks the row before it reads the previous values'
);

-- rate_game (AC-6)

select * from public.set_game_status(5202, 'playing');
select lives_ok(
  $$select public.rate_game(5202, 7::smallint)$$,
  'a Playing game takes a score'
);
select is(
  (select rating from public.user_game_state where game_id = 5202),
  7::smallint,
  'the score is stored'
);
select ok(
  (select started_at = now() from public.user_game_state where game_id = 5202),
  'a score moves no date'
);
select throws_ok(
  $$select public.rate_game(5299, 7::smallint)$$,
  'BS004', 'game_not_started',
  'a score on a game with no row is refused with BS004'
);
select throws_ok(
  $$select public.rate_game(5201, 7::smallint)$$,
  'BS004', 'game_not_started',
  'a score on a Want to play game is refused with BS004'
);
select throws_ok(
  $$select public.rate_game(5202, null::smallint)$$,
  'BS004', 'game_not_started',
  'a null score is refused, so only the plain update clears'
);
select throws_ok(
  $$select public.rate_game(5202, 11::smallint)$$,
  'BS004', 'game_not_started',
  'a score out of range is refused'
);

-- The plain update the action sends to clear a score.
update public.user_game_state set rating = null where game_id = 5202;
select ok(
  (select rating is null and status = 'playing' and started_at = now()
   from public.user_game_state where game_id = 5202),
  'clearing a score keeps the status and moves no date'
);

-- remove_game (AC-4)

select * from public.set_game_status(5203, 'finished');
select public.rate_game(5203, 9::smallint);
select results_eq(
  $$select removed_status::text, removed_rating, removed_added_at, removed_started_at,
           removed_finished_at, removed_at
    from public.remove_game(5203)$$,
  $$values ('finished'::text, 9::smallint, now(), null::timestamptz, now(), now())$$,
  'removing returns what the row held and the time of removal'
);
select is_empty(
  $$select 1 from public.user_game_state where game_id = 5203$$,
  'removing deletes the row'
);
select is_empty(
  $$select * from public.remove_game(5203)$$,
  'removing a game that is already gone returns no row'
);

-- restore_removed_game (AC-4, AC-14)

select lives_ok(
  $$select public.restore_removed_game(5203, 'finished', '2026-07-01T10:00:00Z',
      now(), 9::smallint, null, '2026-07-10T10:00:00Z')$$,
  'a removal Undo inside the window succeeds'
);
select ok(
  (select status = 'finished' and rating = 9
     and added_at = '2026-07-01T10:00:00Z' and started_at is null
     and finished_at = '2026-07-10T10:00:00Z'
   from public.user_game_state where game_id = 5203),
  'a removal Undo puts back the status, the score and all three dates exactly'
);
select is(
  current_setting('bestats.restore_game', true),
  'off',
  'the restore escape reads off after a removal Undo'
);
select throws_ok(
  $$select public.restore_removed_game(5203, 'finished', '2026-07-01T10:00:00Z',
      now(), 9::smallint, null, '2026-07-10T10:00:00Z')$$,
  'P0002', 'undo_expired',
  'a removal Undo when the row already exists is refused'
);
select is(
  current_setting('bestats.restore_game', true),
  'off',
  'the restore escape reads off after a refused removal Undo'
);
select throws_ok(
  $$select public.restore_removed_game(5204, 'want_to_play', '2026-07-01T10:00:00Z',
      now() - interval '10 minutes')$$,
  'P0002', 'undo_expired',
  'a removal Undo exactly 10 minutes later is refused'
);
select lives_ok(
  $$select public.restore_removed_game(5204, 'want_to_play', '2026-07-01T10:00:00Z',
      now() - interval '9 minutes 59 seconds')$$,
  'a removal Undo just inside 10 minutes succeeds'
);
select throws_ok(
  $$select public.restore_removed_game(5205, 'want_to_play', '2026-07-01T10:00:00Z',
      now() + interval '1 second')$$,
  'P0002', 'undo_expired',
  'a removal time in the future is refused'
);
select throws_ok(
  $$select public.restore_removed_game(5205, 'want_to_play', now() + interval '1 day', now())$$,
  'P0002', 'undo_expired',
  'a future added date is refused'
);
select throws_ok(
  $$select public.restore_removed_game(5205, 'playing', '2026-07-01T10:00:00Z', now(),
      null, now() + interval '1 day')$$,
  'P0002', 'undo_expired',
  'a future start is refused'
);
select throws_ok(
  $$select public.restore_removed_game(5205, 'playing', '2026-07-01T10:00:00Z', now())$$,
  '23514', null,
  'a Playing state with no start still breaks the table check'
);
select is(
  current_setting('bestats.restore_game', true),
  'off',
  'the restore escape is off again after a refused statement'
);

-- restore_game_status (AC-5, AC-14)

select * from public.set_game_status(5206, 'playing');
update public.user_game_state set rating = 6 where game_id = 5206;
select * from public.set_game_status(5206, 'want_to_play');

select throws_ok(
  $$select public.restore_game_status(5206, 'want_to_play', '2026-07-01T10:00:00Z')$$,
  'P0002', 'undo_expired',
  'a status Undo to Want to play is refused'
);
select throws_ok(
  $$select public.restore_game_status(5206, 'playing', now() + interval '1 day',
      6::smallint, '2026-07-02T10:00:00Z')$$,
  'P0002', 'undo_expired',
  'a status Undo with a future date is refused'
);
select lives_ok(
  $$select public.restore_game_status(5206, 'playing', '2026-07-01T10:00:00Z',
      6::smallint, '2026-07-02T10:00:00Z')$$,
  'a status Undo inside the window succeeds'
);
select ok(
  (select status = 'playing' and rating = 6
     and added_at = '2026-07-01T10:00:00Z' and started_at = '2026-07-02T10:00:00Z'
     and finished_at is null
   from public.user_game_state where game_id = 5206),
  'a status Undo puts back the status, the score and all three dates exactly'
);
select is(
  current_setting('bestats.restore_game', true),
  'off',
  'the restore escape reads off after a status Undo'
);
select throws_ok(
  $$select public.restore_game_status(5206, 'playing', '2026-07-01T10:00:00Z',
      6::smallint, '2026-07-02T10:00:00Z')$$,
  'P0002', 'undo_expired',
  'a second status Undo, on a row no longer Want to play, is refused'
);
select is(
  current_setting('bestats.restore_game', true),
  'off',
  'the restore escape reads off after a refused status Undo'
);

-- The window boundary, measured from `updated_at`.
select * from public.set_game_status(5207, 'want_to_play');
select * from public.set_game_status(5208, 'want_to_play');
reset role;
set local session_replication_role = replica;
update public.user_game_state set updated_at = now() - interval '10 minutes'
where user_id = '11111111-1111-1111-1111-111111111111' and game_id = 5207;
update public.user_game_state set updated_at = now() - interval '9 minutes 59 seconds'
where user_id = '11111111-1111-1111-1111-111111111111' and game_id = 5208;
set local session_replication_role = origin;
set local role authenticated;

select throws_ok(
  $$select public.restore_game_status(5207, 'finished', '2026-07-01T10:00:00Z',
      null, null, '2026-07-03T10:00:00Z')$$,
  'P0002', 'undo_expired',
  'a status Undo on a row changed exactly 10 minutes ago is refused'
);
select lives_ok(
  $$select public.restore_game_status(5208, 'finished', '2026-07-01T10:00:00Z',
      null, null, '2026-07-03T10:00:00Z')$$,
  'a status Undo on a row changed just inside 10 minutes succeeds'
);

-- Isolation: user A's calls never reach user B's row for the same game.

select * from public.remove_game(1942);
select throws_ok(
  $$select public.rate_game(1942, 5::smallint)$$,
  'BS004', 'game_not_started',
  'user A cannot score a game only user B has'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select ok(
  (select status = 'want_to_play' and added_at = '2026-09-10T10:00:00Z'
   from public.user_game_state where game_id = 1942),
  'user B''s row is untouched by every call user A made'
);

select * from finish();
rollback;
