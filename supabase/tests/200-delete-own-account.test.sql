-- Spec 0033, child 0036 (Account deletion; AC-12): `delete_own_account()`, a
-- `postgres` owned security definer function, deletes only the caller's row
-- from auth.users, and the cascade removes every row of theirs in the five
-- user tables and none of anyone else's. `anon` cannot execute it, and it
-- takes no argument, so no caller can name another account.
--
-- Everything runs inside a transaction that is rolled back.

begin;
select plan(11);

-- User A and user B come from supabase/seed.sql. A profile row for A is added
-- here so all five tables hold something of A's to cascade.
insert into public.profiles (user_id, username)
values ('11111111-1111-1111-1111-111111111111', 'proof_user_a')
on conflict (user_id) do nothing;

select is(
  (select pg_get_userbyid(proowner) from pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  'postgres',
  'delete_own_account() is owned by postgres'
);

select is(
  (select pronargs::int from pg_proc
   where oid = 'public.delete_own_account()'::regprocedure),
  0,
  'it takes no argument, so its effect is fixed to the caller'
);

select ok(
  has_function_privilege('authenticated', 'public.delete_own_account()', 'execute')
  and not has_function_privilege('anon', 'public.delete_own_account()', 'execute'),
  'authenticated may execute it and anon may not'
);

select ok(
  (select count(*) from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222') > 0,
  'user B has rows before user A deletes their account'
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  'select public.delete_own_account()',
  'an authenticated user can run the security definer delete on themselves'
);

reset role;

select is(
  (select count(*) from auth.users
   where id = '11111111-1111-1111-1111-111111111111'),
  0::bigint,
  'user A is gone from auth.users'
);

select is(
  (select
     (select count(*) from public.user_movie_state
      where user_id = '11111111-1111-1111-1111-111111111111')
   + (select count(*) from public.user_show_state
      where user_id = '11111111-1111-1111-1111-111111111111')
   + (select count(*) from public.user_episode_state
      where user_id = '11111111-1111-1111-1111-111111111111')
   + (select count(*) from public.profiles
      where user_id = '11111111-1111-1111-1111-111111111111')
   + (select count(*) from public.user_game_state
      where user_id = '11111111-1111-1111-1111-111111111111')),
  0::bigint,
  'the cascade removed every row of user A in all five tables'
);

select is(
  (select count(*) from auth.users
   where id = '22222222-2222-2222-2222-222222222222'),
  1::bigint,
  'user B still exists'
);

select ok(
  (select count(*) from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222') > 0
  and (select count(*) from public.user_episode_state
   where user_id = '22222222-2222-2222-2222-222222222222') > 0,
  'user B keeps their rows'
);

-- anon has no execute grant, so the call fails before the body runs.
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'anon cannot execute it'
);

reset role;

-- An authenticated caller with no subject is refused by the body itself.
set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  'not signed in',
  'a caller with no user id deletes nothing'
);

reset role;

select * from finish();
rollback;
