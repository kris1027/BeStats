-- Spec 0015 AC-3, AC-8 to AC-10, AC-14 to AC-17 and AC-19: automatic
-- completion.
--
-- `complete_show_automatically` is the one path that writes Completed with
-- `status_source = 'system'`, so its guards are pinned from every side: the
-- row must still be Watching, the source rule, every id watched by the caller
-- on this show, the id limits, no insert, no episode row touched, and a second
-- call writing nothing. Then the way back: `reopen_show_automatically` for a
-- visit and the `reopen_completed_show` trigger for an unmark, the pin of
-- AC-19, the status Undo window, and a user delete in every order.
--
-- Shows 990001 to 990049 and episodes 995001 to 995499 are free for user A in
-- this file; show 990050 and episode 995501 belong to user B. Rows that need a
-- known time are pinned as `postgres` with `session_replication_role =
-- replica`, as `070-movie-restore-functions.test.sql` does. Inside one
-- transaction `now()` never moves, so "unchanged" is proven against a time
-- pinned in the past.

begin;
select plan(64);

-- Shape (AC-17)

select is(
  (select count(*)::int from pg_proc
   where oid = 'public.complete_show_automatically(integer, integer[], boolean)'::regprocedure
     and not prosecdef
     and proconfig = array['search_path=""']),
  1,
  'complete_show_automatically is security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.complete_show_automatically(integer, integer[], boolean)', 'execute')
  and not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.complete_show_automatically(integer, integer[], boolean)'::regprocedure
      and a.grantee = 0
  ),
  'neither anon nor PUBLIC can execute complete_show_automatically'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_show_automatically(integer, integer[], boolean)', 'execute'),
  'authenticated can execute complete_show_automatically'
);

-- Fixtures
set local session_replication_role = replica;
delete from public.user_episode_state where show_id between 990001 and 990050;
delete from public.user_show_state where show_id between 990001 and 990050;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at)
values
  ('11111111-1111-1111-1111-111111111111', 990001, 'watching', 'system', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 990002, 'watching', 'user', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 990003, 'on_hold', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 990004, 'completed', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 990005, 'watching', 'system', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 990006, 'watching', 'system', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 990007, 'want_to_watch', 'system', '2020-01-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 990008, 'dropped', 'system', null),
  -- The reopen trigger (AC-8, AC-9).
  ('11111111-1111-1111-1111-111111111111', 990010, 'completed', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 990011, 'completed', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 990012, 'on_hold', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 990013, 'completed', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 990014, 'completed', 'system', null),
  -- reopen_show_automatically (AC-10, AC-16).
  ('11111111-1111-1111-1111-111111111111', 990020, 'completed', 'system', null),
  ('11111111-1111-1111-1111-111111111111', 990021, 'completed', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 990022, 'watching', 'system', '2020-01-01T00:00:00Z'),
  -- The status Undo window (Consequences) and the pin (AC-19).
  ('11111111-1111-1111-1111-111111111111', 990030, 'on_hold', 'user', null),
  ('11111111-1111-1111-1111-111111111111', 990031, 'completed', 'system', null),
  ('22222222-2222-2222-2222-222222222222', 990050, 'watching', 'system', '2020-01-01T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 990051, 'completed', 'system', null),
  ('22222222-2222-2222-2222-222222222222', 990052, 'completed', 'system', null);
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 995001, 990001, 1, 1, '2021-01-01T00:00:00Z', 8),
  ('11111111-1111-1111-1111-111111111111', 995002, 990001, 1, 2, '2021-01-02T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995003, 990001, 0, 1, '2021-01-03T00:00:00Z', 9),
  ('11111111-1111-1111-1111-111111111111', 995011, 990002, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995021, 990003, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995031, 990004, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995041, 990005, 1, 1, '2021-01-01T00:00:00Z', null),
  -- Unwatched, but rated: a row is not a watch.
  ('11111111-1111-1111-1111-111111111111', 995042, 990005, 1, 2, null, 7),
  ('11111111-1111-1111-1111-111111111111', 995061, 990006, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995071, 990007, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995081, 990008, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995101, 990010, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995102, 990010, 1, 2, '2021-01-02T00:00:00Z', 6),
  ('11111111-1111-1111-1111-111111111111', 995103, 990010, 0, 1, '2021-01-03T00:00:00Z', 5),
  ('11111111-1111-1111-1111-111111111111', 995104, 990010, 1, 3, '2021-01-04T00:00:00Z', 8),
  ('11111111-1111-1111-1111-111111111111', 995111, 990011, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995121, 990012, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995131, 990013, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995301, 990030, 1, 1, '2021-01-01T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 995311, 990031, 1, 1, '2021-01-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 995501, 990050, 1, 1, '2021-01-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 995511, 990051, 1, 1, '2021-01-01T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 995521, 990052, 1, 1, '2021-01-01T00:00:00Z', null);
-- A season of 40 watched episodes, unmarked at once below (AC-9).
insert into public.user_episode_state
  (user_id, episode_id, show_id, season_number, episode_number, watched_at)
select '11111111-1111-1111-1111-111111111111', 995200 + n, 990014, 1, n, '2021-01-01T00:00:00Z'
from generate_series(1, 40) as n;
set local session_replication_role = origin;

-- A fingerprint of every episode row of user A, taken before any automatic
-- change and compared after each path (AC-15).
select set_config(
  'bestats_test.episodes_before',
  (select md5(string_agg(
     episode_id || ':' || show_id || ':' || season_number || ':' || episode_number
       || ':' || coalesce(watched_at::text, '-') || ':' || coalesce(rating::text, '-')
       || ':' || updated_at::text,
     ',' order by episode_id))
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'),
  true
);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- complete_show_automatically (AC-3)

select is(
  public.complete_show_automatically(990001, array[995001, 995002], false),
  true,
  'a Watching row set by the system completes once every id is watched'
);
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990001),
  'completed/system',
  'the row is Completed, set by the system'
);

-- AC-16: pin the times in the past, then call again.
reset role;
set local session_replication_role = replica;
update public.user_show_state
set updated_at = '2020-06-01T00:00:00Z', status_changed_at = '2020-06-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990001;
set local session_replication_role = origin;
set local role authenticated;

select is(
  public.complete_show_automatically(990001, array[995001, 995002], false),
  false,
  'a second call on a row it already completed reports false'
);
select is(
  (select updated_at = '2020-06-01T00:00:00Z' and status_changed_at = '2020-06-01T00:00:00Z'
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990001),
  true,
  'and writes nothing: updated_at and status_changed_at are unchanged'
);

-- The source rule (AC-3, AC-14)
select is(
  public.complete_show_automatically(990002, array[995011], false),
  false,
  'a Watching the user chose does not complete without p_allow_user_source'
);
select is(
  public.complete_show_automatically(990002, array[995011], null),
  false,
  'a null p_allow_user_source reads as false'
);
select is(
  public.complete_show_automatically(990002, array[995011], true),
  true,
  'with p_allow_user_source a Watching the user chose completes'
);
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990002),
  'completed/system',
  'and it is stored as an automatic completion'
);
select is(
  (select count(*)::int from (values
     (public.complete_show_automatically(990003, array[995021], true)),
     (public.complete_show_automatically(990004, array[995031], true)),
     (public.complete_show_automatically(990007, array[995071], true)),
     (public.complete_show_automatically(990008, array[995081], true))
   ) as calls(completed) where completed),
  0,
  'On Hold, Completed by the user, Want to Watch and Dropped never complete'
);
select is(
  (select string_agg(status::text || '/' || status_source::text, ',' order by show_id)
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and show_id in (990003, 990004, 990007, 990008)),
  'on_hold/user,completed/user,want_to_watch/system,dropped/system',
  'and each keeps its status and source'
);

-- The watched check (AC-3)
select is(
  public.complete_show_automatically(990005, array[995041, 995042], false),
  false,
  'one unwatched id (a row with only a rating) writes nothing'
);
select is(
  public.complete_show_automatically(990005, array[995041, 995049], false),
  false,
  'an id with no row writes nothing'
);
select is(
  public.complete_show_automatically(990006, array[995061, 995001], false),
  false,
  'an id watched on another of the caller''s shows does not count'
);
select is(
  public.complete_show_automatically(990006, array[995061, 995501], false),
  false,
  'another user''s watched id does not count'
);
select is(
  public.complete_show_automatically(990005, array[995041, 995041], false),
  true,
  'a repeated id counts once'
);
select is(
  public.complete_show_automatically(990049, array[995001], false),
  false,
  'no row: nothing to complete'
);
select is(
  (select count(*)::int from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990049),
  0,
  'and it never inserts one'
);

-- The limits (AC-3)
select throws_ok(
  $$ select public.complete_show_automatically(990006, null, false) $$,
  '22023', null, 'a null id list is refused'
);
select throws_ok(
  $$ select public.complete_show_automatically(990006, array[]::integer[], false) $$,
  '22023', null, 'an empty id list is refused'
);
select throws_ok(
  $$ select public.complete_show_automatically(990006, array[995061, null], false) $$,
  '22023', null, 'a null id is refused'
);
select throws_ok(
  $$ select public.complete_show_automatically(
       990006, (select array_agg(g) from generate_series(1, 20001) as g), false) $$,
  '22023', null, 'more than 20000 ids are refused'
);
select is(
  public.complete_show_automatically(
    990006, (select array_agg(g) from generate_series(1, 20000) as g), false),
  false,
  'exactly 20000 ids are accepted, and answer false when they are not all watched'
);
select throws_ok(
  $$ select public.complete_show_automatically(0, array[995061], false) $$,
  '23514', null, 'a show id that is not positive is refused'
);

-- Cross user (AC-17)
select is(
  public.complete_show_automatically(990050, array[995501], true),
  false,
  'user A cannot complete user B''s show, even with B''s own ids'
);

-- reopen_show_automatically (AC-10, AC-14, AC-16)

select is(
  public.reopen_show_automatically(990020),
  true,
  'an automatic Completed reopens on a visit'
);
select is(
  (select status::text || '/' || status_source::text || '/' || (listed_at = now())::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990020),
  'watching/system/true',
  'as Watching set by the system, listed again now'
);
select is(
  (select count(*)::int from (values
     (public.reopen_show_automatically(990021)),
     (public.reopen_show_automatically(990022)),
     (public.reopen_show_automatically(990012)),
     (public.reopen_show_automatically(990048))
   ) as calls(reopened) where reopened),
  0,
  'a Completed the user chose, a Watching, an On Hold and no row never reopen'
);
select is(
  (select string_agg(status::text || '/' || status_source::text, ',' order by show_id)
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111'
     and show_id in (990012, 990021, 990022, 990048)),
  'on_hold/system,completed/user,watching/system',
  'each keeps its status, and no row is inserted'
);
select throws_ok(
  $$ select public.reopen_show_automatically(-1) $$,
  '23514', null, 'reopen refuses a show id that is not positive'
);
select is(
  public.reopen_show_automatically(990051),
  false,
  'user A cannot reopen user B''s show'
);

-- AC-16: a second reopen writes nothing.
reset role;
set local session_replication_role = replica;
update public.user_show_state
set updated_at = '2020-06-01T00:00:00Z', status_changed_at = '2020-06-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990020;
set local session_replication_role = origin;
set local role authenticated;
select is(
  public.reopen_show_automatically(990020),
  false,
  'a second reopen reports false'
);
select is(
  (select updated_at = '2020-06-01T00:00:00Z' and status_changed_at = '2020-06-01T00:00:00Z'
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990020),
  true,
  'and writes nothing: updated_at and status_changed_at are unchanged'
);

-- Episode rows (AC-15), after both automatic directions ran.
select is(
  (select md5(string_agg(
     episode_id || ':' || show_id || ':' || season_number || ':' || episode_number
       || ':' || coalesce(watched_at::text, '-') || ':' || coalesce(rating::text, '-')
       || ':' || updated_at::text,
     ',' order by episode_id))
   from public.user_episode_state
   where user_id = '11111111-1111-1111-1111-111111111111'),
  current_setting('bestats_test.episodes_before'),
  'no completion touched an episode row: dates and ratings are identical'
);

reset role;
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222' and show_id = 990050),
  'watching/system',
  'user B''s row is unchanged'
);

set local role anon;
select throws_ok(
  $$ select public.complete_show_automatically(990001, array[995001], false) $$,
  '42501', null, 'anon cannot call complete_show_automatically'
);
select throws_ok(
  $$ select public.reopen_show_automatically(990020) $$,
  '42501', null, 'anon cannot call reopen_show_automatically'
);
reset role;

-- The reopen trigger (AC-8, AC-9, AC-15)
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

update public.user_episode_state set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 995103;
update public.user_episode_state set rating = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 995104;
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990010),
  'completed/system',
  'unwatching a special or clearing a rating alone reopens nothing'
);

update public.user_episode_state set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 995101;
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990010),
  'watching/system',
  'unwatching a regular episode reopens an automatic Completed as Watching'
);
select results_eq(
  $$ select episode_id, watched_at, rating from public.user_episode_state
     where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990010
       and episode_id <> 995101
     order by episode_id $$,
  $$ values (995102, '2021-01-02T00:00:00Z'::timestamptz, 6::smallint),
            (995103, null::timestamptz, 5::smallint),
            (995104, '2021-01-04T00:00:00Z'::timestamptz, null::smallint) $$,
  'the reopen leaves every other episode row as it was'
);

update public.user_episode_state set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id in (995111, 995121);
select is(
  (select string_agg(status::text || '/' || status_source::text, ',' order by show_id)
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id in (990011, 990012)),
  'completed/user,on_hold/system',
  'a Completed the user chose and any other status stay put'
);

delete from public.user_episode_state
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 995131;
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990013),
  'watching/system',
  'deleting a watched regular episode reopens too'
);

select is(
  (select count(*)::int from public.unmark_episodes_watched(
     990014, (select array_agg(995200 + n) from generate_series(1, 40) as n))),
  40,
  'a season unmark of 40 episodes succeeds'
);
select is(
  (select status::text || '/' || status_source::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990014),
  'watching/system',
  'and reopens the show once'
);

-- User B's unmark cannot reach user A's show, and A's cannot reach B's.
update public.user_episode_state set watched_at = null
where episode_id = 995511;
select is(
  (select count(*)::int from public.user_episode_state where episode_id = 995511),
  0,
  'user A cannot see or unmark user B''s episode'
);

-- The pin (AC-19) and manual Watching after an automatic completion (AC-14)
select is(
  (select status_source::text from public.set_show_status(990031, 'completed', 'completed')),
  'user',
  'choosing Completed again pins an automatic Completed as the user''s'
);
update public.user_episode_state set watched_at = null
where user_id = '11111111-1111-1111-1111-111111111111' and episode_id = 995311;
select is(
  (select public.reopen_show_automatically(990031)::text || '/' || status::text
   from public.user_show_state
   where user_id = '11111111-1111-1111-1111-111111111111' and show_id = 990031),
  'false/completed',
  'a pinned Completed is reopened by neither the trigger nor a visit'
);
select is(
  (select status_source::text from public.set_show_status(990020, 'watching', 'watching')),
  'user',
  'choosing Watching again pins an automatic Watching'
);
select is(
  public.complete_show_automatically(990020, array[995001], false),
  false,
  'and no visit completes it afterwards'
);

-- The status Undo window (Consequences): an automatic completion changes the
-- status an open Stop watching style Undo expects, so the Undo refuses.
select public.set_show_status(990030, 'watching', 'on_hold');
select is(
  public.complete_show_automatically(990030, array[995301], true),
  true,
  'a finishing write completes a show the user just set to Watching'
);
select throws_ok(
  $$ select public.restore_show_status(990030, 'on_hold', 'user', 'watching') $$,
  'P0002', null, 'an open status Undo expecting Watching then refuses as undo_expired'
);
reset role;

-- Deleting a user (AC-9). GoTrue deletes from `auth.users` as
-- `supabase_auth_admin`, with no session. The ON DELETE CASCADE actions run as
-- the child table's owner, but the reopen trigger they set off is queued and
-- fires afterwards as the role that issued the delete, so its update needs
-- that role's rights. `supabase test db` connects as `postgres`, which cannot
-- `set role supabase_auth_admin`, so a stand-in role with exactly
-- `supabase_auth_admin`'s rights on the tracking tables deletes from two
-- stand-in parents whose cascade actions reach the two tables in each order.
-- Everything here is rolled back with the file.
select set_config('request.jwt.claims', '', true);
do $$
declare
  t text;
  p text;
begin
  execute format(
    'create role bestats_test_auth_admin nologin %s',
    case when (select rolbypassrls from pg_roles where rolname = 'supabase_auth_admin')
      then 'bypassrls' else 'nobypassrls' end
  );
  if has_schema_privilege('supabase_auth_admin', 'public', 'usage') then
    grant usage on schema public to bestats_test_auth_admin;
  end if;
  -- The reopen trigger calls `auth.uid()`, which the real role can (it owns
  -- `auth`). `postgres` cannot grant on `auth`, but it can grant `anon`,
  -- which may call `auth.uid()` and holds no right on the tracking tables;
  -- the assertion below checks the effective rights still match.
  grant anon to bestats_test_auth_admin;
  foreach t in array array['public.user_show_state', 'public.user_episode_state'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege('supabase_auth_admin', t, p) then
        execute format('grant %s on %s to bestats_test_auth_admin', p, t);
      end if;
    end loop;
  end loop;
end
$$;
grant bestats_test_auth_admin to current_user;

create table public.bestats_test_episodes_first (
  user_id uuid not null,
  show_id integer not null,
  primary key (user_id, show_id)
);
alter table public.user_episode_state
  add constraint bestats_test_episodes_first_episode_fk foreign key (user_id, show_id)
  references public.bestats_test_episodes_first on delete cascade not valid;
alter table public.user_show_state
  add constraint bestats_test_episodes_first_show_fk foreign key (user_id, show_id)
  references public.bestats_test_episodes_first on delete cascade not valid;
create table public.bestats_test_show_first (
  user_id uuid not null,
  show_id integer not null,
  primary key (user_id, show_id)
);
alter table public.user_show_state
  add constraint bestats_test_show_first_show_fk foreign key (user_id, show_id)
  references public.bestats_test_show_first on delete cascade not valid;
alter table public.user_episode_state
  add constraint bestats_test_show_first_episode_fk foreign key (user_id, show_id)
  references public.bestats_test_show_first on delete cascade not valid;
grant select, delete on public.bestats_test_episodes_first, public.bestats_test_show_first
  to bestats_test_auth_admin;
insert into public.bestats_test_episodes_first values ('22222222-2222-2222-2222-222222222222', 990051);
insert into public.bestats_test_show_first values ('22222222-2222-2222-2222-222222222222', 990052);

select ok(
  (select r.rolbypassrls = a.rolbypassrls and not r.rolsuper
   from pg_roles r, pg_roles a
   where r.rolname = 'bestats_test_auth_admin' and a.rolname = 'supabase_auth_admin')
  and (select bool_and(
         has_table_privilege('bestats_test_auth_admin', t, p)
           = has_table_privilege('supabase_auth_admin', t, p))
       from unnest(array['public.user_show_state', 'public.user_episode_state']) as t,
            unnest(array['select', 'insert', 'update', 'delete']) as p)
  and has_function_privilege('bestats_test_auth_admin', 'auth.uid()', 'execute')
    = has_function_privilege('supabase_auth_admin', 'auth.uid()', 'execute'),
  'the stand-in deleter has exactly supabase_auth_admin''s rights on the tracking tables'
);
-- Cascade actions fire in trigger name order, which follows creation order.
select is(
  (select array_agg(c.conrelid::regclass::text order by t.tgname)
   from pg_trigger t join pg_constraint c on c.oid = t.tgconstraint
   where t.tgrelid = 'public.bestats_test_episodes_first'::regclass
     and t.tgfoid = 'pg_catalog."RI_FKey_cascade_del"'::regproc),
  array['user_episode_state', 'user_show_state'],
  'the first stand-in cascade reaches the episode rows first'
);
select is(
  (select array_agg(c.conrelid::regclass::text order by t.tgname)
   from pg_trigger t join pg_constraint c on c.oid = t.tgconstraint
   where t.tgrelid = 'public.bestats_test_show_first'::regclass
     and t.tgfoid = 'pg_catalog."RI_FKey_cascade_del"'::regproc),
  array['user_show_state', 'user_episode_state'],
  'the second stand-in cascade reaches the show row first'
);
-- Both cascades delete a watched regular episode of an automatic Completed,
-- so the reopen trigger's `when` clause matches and it really fires.
select is(
  (select string_agg(s.status::text || '/' || s.status_source::text || '/'
     || e.season_number || '/' || (e.watched_at is not null), ',' order by s.show_id)
   from public.user_show_state s
   join public.user_episode_state e on e.user_id = s.user_id and e.show_id = s.show_id
   where s.user_id = '22222222-2222-2222-2222-222222222222' and s.show_id in (990051, 990052)),
  'completed/system/1/true,completed/system/1/true',
  'both cascades start from an automatic Completed with a watched regular episode'
);
select lives_ok(
  $$ set local role bestats_test_auth_admin;
     delete from public.bestats_test_episodes_first;
     reset role $$,
  'a cascade reaching episode rows first, as the auth admin: no error'
);
select lives_ok(
  $$ set local role bestats_test_auth_admin;
     delete from public.bestats_test_show_first;
     reset role $$,
  'a cascade reaching the show row first, as the auth admin: no error'
);
select is(
  (select count(*)::int from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222' and show_id in (990051, 990052))
  + (select count(*)::int from public.user_episode_state
     where user_id = '22222222-2222-2222-2222-222222222222' and show_id in (990051, 990052)),
  0,
  'and both cascades remove every row they reach'
);
-- The real cascade, as the test runner (it cannot become supabase_auth_admin).
select lives_ok(
  $$ delete from auth.users where id = '22222222-2222-2222-2222-222222222222' $$,
  'deleting user B, with an automatic Completed, cascades cleanly'
);
select is(
  (select count(*)::int from public.user_show_state
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'and leaves none of B''s rows'
);

-- Both functions lock episode rows in one fixed order, `episode_id`, so an
-- unmark and an automatic completion of the same show cannot deadlock. The
-- planner would otherwise pick the order (heap, or the show index).
select matches(
  pg_get_functiondef('public.complete_show_automatically(integer, integer[], boolean)'::regprocedure),
  'order by s\.episode_id\s+for share',
  'complete_show_automatically locks episode rows in episode_id order'
);
select matches(
  pg_get_functiondef('public.unmark_episodes_watched(integer, integer[])'::regprocedure),
  'order by s\.episode_id\s+for update',
  'unmark_episodes_watched locks episode rows in episode_id order'
);

select * from finish();
rollback;
