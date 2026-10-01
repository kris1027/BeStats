-- Spec 0013 AC-2 to AC-4, AC-14, AC-19 to AC-21: the three TV status functions
-- and the trigger that owns `listed_at`.
--
-- Pins their shape (invoker rights, empty search_path, who may execute), what
-- they write and report, the `listed_at` transitions, both Undo branches and
-- their guards, that no status write touches an episode row, and that user A
-- can never read or change user B's rows through them.
--
-- Shows 910001 to 910020 are free for user A in this file; show 910050 belongs
-- to user B. Rows that need a past `updated_at` or `listed_at` are pinned as
-- `postgres` with `session_replication_role = replica`, which skips the
-- triggers, as `070-movie-restore-functions.test.sql` does.

begin;
select plan(56);

-- Shape (AC-20)

select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.set_show_status(integer, public.tv_status, public.tv_status)'::regprocedure,
     'public.remove_show_status(integer, public.tv_status)'::regprocedure,
     'public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz)'::regprocedure,
     'public.start_watching_show(integer, boolean)'::regprocedure,
     'public.set_listed_at()'::regprocedure
   )
     and not prosecdef
     and proconfig = array['search_path=""']),
  5,
  'all five functions are security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.set_show_status(integer, public.tv_status, public.tv_status)', 'execute')
  and not has_function_privilege('anon', 'public.remove_show_status(integer, public.tv_status)', 'execute')
  and not has_function_privilege('anon', 'public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.start_watching_show(integer, boolean)', 'execute'),
  'anon cannot execute any status function'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.set_show_status(integer, public.tv_status, public.tv_status)'::regprocedure,
      'public.remove_show_status(integer, public.tv_status)'::regprocedure,
      'public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz)'::regprocedure,
      'public.start_watching_show(integer, boolean)'::regprocedure,
      'public.set_listed_at()'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on any of them'
);
select ok(
  has_function_privilege('authenticated', 'public.set_show_status(integer, public.tv_status, public.tv_status)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_show_status(integer, public.tv_status)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.start_watching_show(integer, boolean)', 'execute'),
  'authenticated can execute the four callable ones'
);
select ok(
  not has_function_privilege('authenticated', 'public.set_listed_at()', 'execute'),
  'authenticated holds no execute on the trigger function'
);
select has_index(
  'public', 'user_show_state', 'user_show_state_watchlist_idx',
  'the partial watchlist index exists'
);

-- Fixtures pinned as postgres, triggers off.
set local session_replication_role = replica;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', 910050, 'watching', 'user', '2020-01-01T00:00:00Z', now()),
  -- A: watching since long ago, for "moving between the two keeps listed_at".
  ('11111111-1111-1111-1111-111111111111', 910010, 'want_to_watch', 'user', '2020-02-02T00:00:00Z', now()),
  -- A: on hold, changed 11 minutes ago, for the expired Stop watching Undo.
  ('11111111-1111-1111-1111-111111111111', 910011, 'on_hold', 'user', '2020-03-03T00:00:00Z', now() - interval '11 minutes');
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 940001, 910001, 1, 1, '2021-01-01T00:00:00Z', 8),
  ('11111111-1111-1111-1111-111111111111', 940002, 910001, 0, 1, null, 3);
set local session_replication_role = origin;

-- The episode rows as they were, to prove no status write touches them (AC-3).
create temporary table episodes_before on commit drop as
  select * from public.user_episode_state;
grant select on episodes_before to authenticated;

-- The check itself, with the trigger out of the way: a listed row with no
-- listed_at cannot be stored by any path.
set local session_replication_role = replica;
select throws_ok(
  $$ insert into public.user_show_state (user_id, show_id, status, status_source, listed_at)
     values ('11111111-1111-1111-1111-111111111111', 910019, 'want_to_watch', 'user', null) $$,
  '23514', null, 'the check refuses a listed row with no listed_at'
);
set local session_replication_role = origin;

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- set_show_status (AC-2, AC-14)

select results_eq(
  $$ select status::text, status_source::text, listed_at = now(),
            previous_status::text, previous_source::text, previous_listed_at
     from public.set_show_status(910001, 'want_to_watch', null) $$,
  $$ values ('want_to_watch', 'user', true, null::text, null::text, null::timestamptz) $$,
  'a first status writes the row as the user''s, listed now, with no previous values'
);

select results_eq(
  $$ select status::text, listed_at, previous_status::text, previous_listed_at
     from public.set_show_status(910010, 'watching', 'want_to_watch') $$,
  $$ values ('watching', '2020-02-02T00:00:00Z'::timestamptz, 'want_to_watch', '2020-02-02T00:00:00Z'::timestamptz) $$,
  'moving from Want to Watch to Watching keeps listed_at and reports the previous values'
);

select results_eq(
  $$ select status::text, listed_at from public.set_show_status(910010, 'on_hold', 'watching') $$,
  $$ values ('on_hold', '2020-02-02T00:00:00Z'::timestamptz) $$,
  'leaving the watchlist keeps listed_at, for the Undo'
);

select results_eq(
  $$ select status::text, listed_at = now() from public.set_show_status(910010, 'want_to_watch', 'on_hold') $$,
  $$ values ('want_to_watch', true) $$,
  'coming back to the watchlist from another status stamps listed_at now'
);

select is(
  (select listed_at from public.set_show_status(910002, 'completed', null)),
  null::timestamptz,
  'a first status outside the watchlist has no listed_at'
);

-- The client cannot choose listed_at, on insert or update.
insert into public.user_show_state (user_id, show_id, status, status_source, listed_at)
values ('11111111-1111-1111-1111-111111111111', 910003, 'watching', 'user', '1999-01-01T00:00:00Z');
select is(
  (select listed_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910003),
  now(),
  'an insert that sends listed_at gets now() instead'
);
update public.user_show_state set listed_at = '1999-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910003;
select is(
  (select listed_at from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910003),
  now(),
  'an update that sends listed_at keeps the stored value'
);

-- A system status turns into the user's once the user picks one.
update public.user_show_state set status_source = 'system'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910003;
select is(
  (select status_source::text from public.set_show_status(910003, 'dropped', 'watching')),
  'user',
  'every status chosen by hand is written with status_source user'
);

-- Choosing the status the row already holds (spec 0015, AC-19, which
-- replaces the last sentence of AC-2): a system source becomes the user's,
-- reporting what it replaced; a user source writes nothing and reports none.
update public.user_show_state set status_source = 'system'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910003;
select results_eq(
  $$ select status::text, status_source::text, previous_status::text, previous_source::text
     from public.set_show_status(910003, 'dropped', 'dropped') $$,
  $$ values ('dropped', 'user', 'dropped', 'system') $$,
  'the same status pins a system source as the user''s and reports it'
);
select results_eq(
  $$ select status::text, status_source::text, previous_status::text
     from public.set_show_status(910003, 'dropped', 'dropped') $$,
  $$ values ('dropped', 'user', null::text) $$,
  'the same status with a user source writes nothing and reports no previous value'
);

-- Any status from any status (AC-3).
select lives_ok(
  $$ select public.set_show_status(910004, 'completed', null);
     select public.set_show_status(910004, 'want_to_watch', 'completed');
     select public.set_show_status(910004, 'dropped', 'want_to_watch');
     select public.set_show_status(910004, 'watching', 'dropped');
     select public.set_show_status(910004, 'on_hold', 'watching') $$,
  'every status can follow every other'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910004),
  1::bigint,
  'repeated status writes keep one row'
);

select throws_ok(
  $$ select public.set_show_status(0, 'watching', null) $$,
  '23514', null, 'a show id below 1 is refused'
);

-- Writes apply only over the status the caller saw (review fix): a stale
-- card must never overwrite or delete a status set elsewhere.

select throws_ok(
  $$ select public.set_show_status(910004, 'want_to_watch', 'watching') $$,
  'BS409', null, 'a set over a status that has since changed is refused'
);
select throws_ok(
  $$ select public.set_show_status(910004, 'want_to_watch', null) $$,
  'BS409', null, 'a set that expected no row is refused when a row exists'
);
select throws_ok(
  $$ select public.set_show_status(910014, 'on_hold', 'watching') $$,
  'BS409', null, 'a set that expected a row never inserts one'
);
select throws_ok(
  $$ select public.remove_show_status(910004, 'want_to_watch') $$,
  'BS409', null, 'a removal of a status that has since changed is refused'
);
select throws_ok(
  $$ select public.remove_show_status(910004, null) $$,
  '22023', null, 'a removal must name the status it removes'
);
select ok(
  (select status = 'on_hold' from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910004)
  and not exists (
    select 1 from public.user_show_state
    where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910014),
  'refused writes leave the row as it was and insert nothing'
);

-- Completed never touches an episode.
select public.set_show_status(910001, 'completed', 'want_to_watch');

-- remove_show_status (AC-4)

select results_eq(
  $$ select status::text, status_source::text, removed_at = now()
     from public.remove_show_status(910001, 'completed') $$,
  $$ values ('completed', 'user', true) $$,
  'removing reports the deleted status, source and time'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910001),
  0::bigint,
  'the row is gone'
);
select is(
  (select count(*)::int from public.remove_show_status(910001, 'completed')),
  0,
  'removing a show with no status reports nothing'
);

-- Every status write left the episode rows as they were (AC-3).
select set_eq(
  $$ select * from public.user_episode_state $$,
  $$ select * from episodes_before
     where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'no status change, removal or restore touches user_episode_state'
);

-- restore_show_status after a removal (AC-19)

select results_eq(
  $$ select status::text, status_source::text, listed_at
     from public.restore_show_status(
       910001, 'watching', 'system', null, '2021-06-06T00:00:00Z', now() - interval '1 minute') $$,
  $$ values ('watching', 'system', '2021-06-06T00:00:00Z'::timestamptz) $$,
  'Undo of a removal puts back the status, the source and the given listed_at'
);
select throws_ok(
  $$ select public.restore_show_status(
       910001, 'watching', 'user', null, '2021-06-06T00:00:00Z', now() - interval '1 minute') $$,
  'P0002', null, 'Undo of a removal refuses when the row exists again'
);
select throws_ok(
  $$ select public.restore_show_status(
       910005, 'watching', 'user', null, '2021-06-06T00:00:00Z', now() - interval '11 minutes') $$,
  'P0002', null, 'Undo of a removal refuses after 10 minutes'
);
select throws_ok(
  $$ select public.restore_show_status(
       910005, 'watching', 'user', null, '2021-06-06T00:00:00Z', null) $$,
  'P0002', null, 'Undo of a removal refuses without removed_at'
);
select throws_ok(
  $$ select public.restore_show_status(
       910005, 'watching', 'user', null, '2021-06-06T00:00:00Z', now() + interval '1 hour') $$,
  'P0002', null, 'Undo of a removal refuses a removed_at in the future'
);
select throws_ok(
  $$ select public.restore_show_status(
       910005, 'watching', 'user', null, now() + interval '1 day', now()) $$,
  'P0002', null, 'Undo refuses a listed_at in the future'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910005),
  0::bigint,
  'a refused Undo writes no row'
);
select is(
  current_setting('bestats.restore_listed_at', true),
  'off',
  'the restore switch is off again after the call'
);

-- restore_show_status after Stop watching (AC-16, AC-19)

select public.set_show_status(910006, 'want_to_watch', null);
select public.set_show_status(910006, 'watching', 'want_to_watch');
update public.user_show_state set status_source = 'system'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910006;
select results_eq(
  $$ select status::text, previous_status::text, previous_source::text
     from public.set_show_status(910006, 'on_hold', 'watching') $$,
  $$ values ('on_hold', 'watching', 'system') $$,
  'Stop watching reports the status and source it replaced'
);
select results_eq(
  $$ select status::text, status_source::text, listed_at = now()
     from public.restore_show_status(910006, 'watching', 'system', 'on_hold', '1999-01-01T00:00:00Z', null) $$,
  $$ values ('watching', 'system', true) $$,
  'Undo of Stop watching puts back status and source, and keeps the stored listed_at'
);
select throws_ok(
  $$ select public.restore_show_status(910006, 'want_to_watch', 'user', 'on_hold', null, null) $$,
  'P0002', null, 'Undo of Stop watching refuses when the row is no longer On Hold'
);
select throws_ok(
  $$ select public.restore_show_status(910011, 'watching', 'user', 'on_hold', null, null) $$,
  'P0002', null, 'Undo of Stop watching refuses after 10 minutes'
);
select throws_ok(
  $$ select public.restore_show_status(910012, 'watching', 'user', 'on_hold', null, null) $$,
  'P0002', null, 'Undo of Stop watching never inserts a missing row'
);
select is(
  (select status::text from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910011),
  'on_hold',
  'a refused Undo leaves the row as it was'
);

-- Cross user (AC-20): A reaching for B's show 910050.

select is(
  (select count(*) from public.user_show_state where show_id = 910050),
  0::bigint,
  'A cannot read B''s status row'
);
select throws_ok(
  $$ select public.set_show_status(910050, 'dropped', 'watching') $$,
  'BS409', null, 'A naming B''s status as expected reaches no row of B''s'
);
select is(
  (select previous_status from public.set_show_status(910050, 'dropped', null)),
  null::public.tv_status,
  'A setting a status on B''s show writes A''s own row and reports no previous'
);
select is(
  (select status::text from public.remove_show_status(910050, 'dropped')),
  'dropped',
  'A removing B''s show deletes only A''s own row'
);
select throws_ok(
  $$ select public.restore_show_status(910050, 'watching', 'user', 'watching', null, null) $$,
  'P0002', null, 'A cannot restore over B''s row'
);
select is(
  (select count(*)::int from public.remove_show_status(910050, 'dropped')),
  0,
  'A finds nothing more to remove on B''s show'
);

reset role;

select ok(
  (select status = 'watching' and status_source = 'user'
     and listed_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 910050),
  'B''s row is untouched after A calls every function on the same show'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 910050),
  0::bigint,
  'A''s own row for that show was written and removed again'
);

-- anon cannot call any of them.
set local role anon;
select throws_ok(
  $$ select public.set_show_status(910001, 'watching', null) $$,
  '42501', null, 'anon is refused execute on set_show_status'
);
select throws_ok(
  $$ select public.remove_show_status(910001, 'completed') $$,
  '42501', null, 'anon is refused execute on remove_show_status'
);
select throws_ok(
  $$ select public.restore_show_status(910001, 'watching', 'user', null, null, now()) $$,
  '42501', null, 'anon is refused execute on restore_show_status'
);
select throws_ok(
  $$ select public.start_watching_show(910001, true) $$,
  '42501', null, 'anon is refused execute on start_watching_show'
);

select * from finish();
rollback;
