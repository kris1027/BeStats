-- Spec 0001 AC-3, AC-4 and AC-5: the behavioural half of the security
-- boundary. 020 proves the lock is shaped right; this one tries the door.
--
-- Acting as a user means two settings together: the Postgres role, which is
-- what `to authenticated` matches, and the JWT claim, which is what
-- auth.uid() reads. Setting only one of them would prove nothing.
--
-- `set local` confines both to this transaction, which is rolled back.

begin;
select plan(17);

-- User A and user B come from supabase/seed.sql.
-- A owns: movie 603 and 27205, show 1396 and 1399, episodes 62085 to 62119.
-- B owns: movie 603, show 1396, episode 63056.

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- Reading: user A sees their own rows and none of user B's. Row level
-- security filters rather than errors, so the proof is a count of zero.
select is(
  (select count(*) from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'user A reads none of user B movie rows'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'user A reads none of user B show rows'
);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'user A reads none of user B episode rows'
);

-- An unqualified read must not leak either: every row A can see is A's own.
-- This catches a policy that filters on the wrong column.
select is(
  (select count(*) from public.user_movie_state
   where user_id <> '11111111-1111-1111-1111-111111111111'),
  0::bigint,
  'every movie row visible to user A belongs to user A'
);
select ok(
  (select count(*) from public.user_movie_state) > 0,
  'user A can still see their own movie rows, so the zero counts above are not an empty table'
);

-- Writing into someone else's space. An insert carrying user B's id is
-- refused outright by the insert policy's with check clause.
select throws_ok(
  $$insert into public.user_movie_state (user_id, movie_id)
    values ('22222222-2222-2222-2222-222222222222', 999)$$,
  '42501',
  null,
  'user A cannot insert a movie row owned by user B'
);
select throws_ok(
  $$insert into public.user_show_state (user_id, show_id, status, status_source)
    values ('22222222-2222-2222-2222-222222222222', 999, 'watching', 'user')$$,
  '42501',
  null,
  'user A cannot insert a show row owned by user B'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('22222222-2222-2222-2222-222222222222', 999, 999, 1, 1)$$,
  '42501',
  null,
  'user A cannot insert an episode row owned by user B'
);

-- Updating and deleting someone else's rows affects nothing. These do not
-- raise: the rows are invisible, so each statement simply matches zero rows.
--
-- Note that the proof has to come after `reset role` below. Asserting from
-- inside user A's session that user B's row is unchanged would be a tautology,
-- because user A cannot see that row either way, so the query would return
-- nothing whether the update had worked or not.
update public.user_movie_state set rating = 1
  where user_id = '22222222-2222-2222-2222-222222222222';

update public.user_show_state set status = 'dropped'
  where user_id = '22222222-2222-2222-2222-222222222222';
delete from public.user_show_state
  where user_id = '22222222-2222-2222-2222-222222222222';
delete from public.user_episode_state
  where user_id = '22222222-2222-2222-2222-222222222222';
delete from public.user_movie_state
  where user_id = '22222222-2222-2222-2222-222222222222';

-- Back to the privileged role to confirm user B's rows are all still there.
reset role;
reset request.jwt.claims;

select is(
  (select count(*) from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'user B movie row survived user A delete attempt'
);
select is(
  (select rating from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222' and movie_id = 603),
  null::smallint,
  'user B movie rating was not changed by user A update attempt'
);
select is(
  (select count(*) from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'user B show row survived user A delete and update attempts'
);
select is(
  (select status from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 1396),
  'completed'::public.tv_status,
  'user B show status was not changed by user A'
);
select is(
  (select count(*) from public.user_episode_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'user B episode row survived user A delete attempt'
);

-- AC-5: a user cannot hand their own row to somebody else. This is what the
-- update policy's with check clause exists for; without it the row would
-- simply move.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$update public.user_movie_state
      set user_id = '22222222-2222-2222-2222-222222222222'
    where movie_id = 603$$,
  '42501',
  null,
  'user A cannot reassign their own movie row to user B'
);
select throws_ok(
  $$update public.user_episode_state
      set user_id = '22222222-2222-2222-2222-222222222222'
    where episode_id = 62085$$,
  '42501',
  null,
  'user A cannot reassign their own episode row to user B'
);

-- AC-4, behavioural half. A signed out visitor arrives as `anon`, which holds
-- no privilege at all, so the refusal is a permission error rather than an
-- empty result. It therefore survives row level security being switched off.
reset role;
reset request.jwt.claims;
set local role anon;

select throws_ok(
  $$select * from public.user_movie_state$$,
  '42501',
  null,
  'anon cannot read movie state at all'
);
select throws_ok(
  $$insert into public.user_episode_state
      (user_id, episode_id, show_id, season_number, episode_number)
    values ('11111111-1111-1111-1111-111111111111', 1, 1, 1, 1)$$,
  '42501',
  null,
  'anon cannot write episode state at all'
);

reset role;
select * from finish();
rollback;
