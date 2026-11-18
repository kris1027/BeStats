-- Spec 0033, child 0036 (Account deletion): before self serve deletion is
-- built, prove the one assumption it rests on. A `postgres` owned security
-- definer function, called by an ordinary authenticated user, can delete that
-- user's own row from auth.users, and the cascade removes every row of theirs
-- in the five user tables and none of anyone else's.
--
-- Nothing here survives: the proof function lives in a schema created inside
-- this transaction, which is rolled back. The real `delete_own_account()`
-- ships as a migration in spec 0033 Build plan step 5.

begin;
select plan(9);

-- User A and user B come from supabase/seed.sql. A profile row for A is added
-- here so all five tables hold something of A's to cascade.
insert into public.profiles (user_id, username)
values ('11111111-1111-1111-1111-111111111111', 'proof_user_a')
on conflict (user_id) do nothing;

create schema deletion_proof;

create function deletion_proof.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

alter function deletion_proof.delete_own_account() owner to postgres;
revoke all on function deletion_proof.delete_own_account() from public, anon;
grant usage on schema deletion_proof to authenticated;
grant execute on function deletion_proof.delete_own_account() to authenticated;

select is(
  (select pg_get_userbyid(proowner) from pg_proc
   where proname = 'delete_own_account'
     and pronamespace = 'deletion_proof'::regnamespace),
  'postgres',
  'the proof function is owned by postgres, as delete_own_account() will be'
);

select ok(
  (select count(*) from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222') > 0,
  'user B has rows before user A deletes their account'
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  'select deletion_proof.delete_own_account()',
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
  'select deletion_proof.delete_own_account()',
  '42501',
  null,
  'anon cannot execute it'
);

reset role;

-- An authenticated caller with no subject is refused by the body itself.
set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;

select throws_ok(
  'select deletion_proof.delete_own_account()',
  '42501',
  'not signed in',
  'a caller with no user id deletes nothing'
);

reset role;

select * from finish();
rollback;
