-- Account username (prompts/account-username.md, R1 to R4).
--
-- Pins `profiles`: the format and reserved checks, uniqueness ignoring case,
-- the trigger that owns `username_changed_at` and the weekly lock, the owner
-- only policies with no delete, and `username_available`, the one definer
-- function anon may call. Past times are pinned as `postgres` with
-- `session_replication_role = replica`, which skips the triggers.

begin;
select plan(31);

-- Shape

select ok(
  (select prosecdef and proconfig = array['search_path=""']
     and prorettype = 'boolean'::regtype
   from pg_proc where oid = 'public.username_available(text)'::regprocedure),
  'username_available is security definer, returns boolean, with an empty search_path'
);
select ok(
  has_function_privilege('anon', 'public.username_available(text)', 'execute')
  and has_function_privilege('authenticated', 'public.username_available(text)', 'execute'),
  'anon and authenticated can ask whether a name is free'
);
select ok(
  (select not prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.guard_username_change()'::regprocedure)
  and not has_function_privilege('authenticated', 'public.guard_username_change()', 'execute'),
  'the trigger function is security invoker and not executable by authenticated'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'delete')
  and has_table_privilege('authenticated', 'public.profiles', 'select')
  and has_table_privilege('authenticated', 'public.profiles', 'insert')
  and has_table_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated may select, insert and update, but never delete'
);

-- User B already has a name.
set local session_replication_role = replica;
insert into public.profiles (user_id, username, username_changed_at)
values ('22222222-2222-2222-2222-222222222222', 'Bee_Two', now() - interval '30 days');
set local session_replication_role = origin;

-- As user A

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is_empty(
  $$select 1 from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'A cannot read B''s profile'
);
select is(public.username_available('bee_two'), false, 'a taken name is unavailable, ignoring case');
select is(public.username_available('free_name'), true, 'a free name is available');

-- Format and reserved names (R1)
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'a')$$,
  '23514', null, 'one character is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'has space')$$,
  '23514', null, 'a space is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', '-dash')$$,
  '23514', null, 'a leading dash is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'dot.')$$,
  '23514', null, 'a trailing dot is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'émile')$$,
  '23514', null, 'a non ASCII letter is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', repeat('a', 31))$$,
  '23514', null, '31 characters is refused'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'Admin')$$,
  '23514', null, 'a reserved name is refused, ignoring case'
);
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'BEE_TWO')$$,
  '23505', null, 'a name taken in another case is refused'
);

-- Ownership (R3)
select throws_ok(
  $$insert into public.profiles (user_id, username) values ('22222222-2222-2222-2222-222222222222', 'stolen')$$,
  '42501', null, 'A cannot insert a row for B'
);

select lives_ok(
  $$insert into public.profiles (user_id, username, username_changed_at)
    values ('11111111-1111-1111-1111-111111111111', 'Ay_One', now() - interval '1 year')$$,
  'A sets a valid name'
);
select is(
  (select username_changed_at from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  now(),
  'the first set stamps the current time, whatever the client sent'
);

-- The weekly lock (R2)
select throws_ok(
  $$update public.profiles set username = 'Ay_Two' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'BS002', 'username_locked', 'a change straight after the first set is locked'
);
select throws_ok(
  $$update public.profiles set username = 'ay_one' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'BS002', 'username_locked', 'a change of case counts as a change'
);
select lives_ok(
  $$update public.profiles set username = 'Ay_One', username_changed_at = now() - interval '1 year'
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'saving the identical name is allowed while locked'
);
select is(
  (select username_changed_at from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  now(),
  'and it neither moves the clock nor lets the client rewind it'
);

-- Eight days later
reset role;
set local session_replication_role = replica;
update public.profiles set username_changed_at = now() - interval '8 days'
where user_id = '11111111-1111-1111-1111-111111111111';
set local session_replication_role = origin;
set local role authenticated;

select lives_ok(
  $$insert into public.profiles (user_id, username) values ('11111111-1111-1111-1111-111111111111', 'Ay_Two')
    on conflict (user_id) do update set username = excluded.username$$,
  'an upsert changes the name once the week is over'
);
select is(
  (select username_changed_at from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  now(),
  'and restarts the clock'
);
select throws_ok(
  $$update public.profiles set username = 'Ay_Three' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'BS002', 'username_locked', 'so a second change is locked again'
);
select is(public.username_available('ay_one'), true, 'the old name is free again');

select lives_ok(
  $$update public.profiles set username = 'x_x' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'an update aimed at B''s row runs'
);
reset role;
select is(
  (select username from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  'Bee_Two',
  'but changes nothing'
);
set local role authenticated;

select throws_ok(
  $$delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'A cannot delete their own row, which would reset the lock'
);

-- Signed out
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$select 1 from public.profiles$$,
  '42501', null, 'anon cannot read profiles'
);
select is(public.username_available('Ay_Two'), false, 'anon learns only that a name is in use');

reset role;
select * from finish();
rollback;
