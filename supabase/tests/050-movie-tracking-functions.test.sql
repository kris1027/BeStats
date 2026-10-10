-- The conditional movie writes: spec 0007 AC-4, AC-8, AC-15 and AC-18, as
-- amended by prompts/movie-plan-watched-exclusive.md (planned and watched are
-- exclusive, and a score needs a watch mark).
--
-- `mark_movie_watched`, `rate_movie`, `plan_movie` and `unmark_movie_watched`
-- hold the only business rules that depend on the current row, so this file
-- pins them from every side: their shape (invoker rights, empty search_path,
-- who may execute), what they write, and that user A can never reach user B's
-- row through them. The two table checks are pinned here too.
--
-- `lib/tracking/intent.test.ts` runs the same cases against the TypeScript
-- mirror, so the optimistic UI and the database cannot drift apart unnoticed.
--
-- User A and user B come from supabase/seed.sql. B owns movie 603, planned and
-- unwatched. Movies 900001 to 900008 are free for A in this file.

begin;
select plan(36);

-- Shape (AC-18)

select ok(
  (select bool_and(not prosecdef and proconfig = array['search_path=""'])
   from pg_proc
   where oid in (
     'public.mark_movie_watched(integer)'::regprocedure,
     'public.rate_movie(integer, smallint)'::regprocedure,
     'public.plan_movie(integer)'::regprocedure,
     'public.unmark_movie_watched(integer)'::regprocedure
   )),
  'all four functions are security invoker with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.mark_movie_watched(integer)', 'execute')
  and not has_function_privilege('anon', 'public.rate_movie(integer, smallint)', 'execute')
  and not has_function_privilege('anon', 'public.plan_movie(integer)', 'execute')
  and not has_function_privilege('anon', 'public.unmark_movie_watched(integer)', 'execute'),
  'anon cannot execute any of the four functions'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.mark_movie_watched(integer)'::regprocedure,
      'public.rate_movie(integer, smallint)'::regprocedure,
      'public.plan_movie(integer)'::regprocedure,
      'public.unmark_movie_watched(integer)'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on any of the four functions'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_movie_watched(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.rate_movie(integer, smallint)', 'execute')
  and has_function_privilege('authenticated', 'public.plan_movie(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.unmark_movie_watched(integer)', 'execute'),
  'authenticated can execute all four functions'
);

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- The two checks hold whatever a direct write sends.
select throws_ok(
  $$ insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at)
     values ('11111111-1111-1111-1111-111111111111', 900006, true, now()) $$,
  '23514',
  null,
  'a row cannot be planned and watched'
);
select throws_ok(
  $$ insert into public.user_movie_state (user_id, movie_id, rating)
     values ('11111111-1111-1111-1111-111111111111', 900006, 7) $$,
  '23514',
  null,
  'a row cannot hold a score without a watch mark'
);

-- Marking a planned movie watched clears the plan.
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900001, true);

select public.mark_movie_watched(900001);

select ok(
  (select watched_at is not null and not in_watchlist
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  'marking a planned movie watched sets watched_at and clears the plan'
);

-- A stale second Mark watched keeps the date. It is pinned to a known past
-- value first so "unchanged" is provable inside one transaction, where now()
-- never moves.
update public.user_movie_state
set watched_at = '2020-01-01T00:00:00Z'
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001;

select public.mark_movie_watched(900001);

select is(
  (select watched_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  '2020-01-01T00:00:00Z'::timestamptz,
  'marking an already watched movie again keeps the original date'
);

-- Marking a movie with no row yet creates one.
select public.mark_movie_watched(900002);

select ok(
  (select watched_at is not null and in_watchlist = false and rating is null
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900002),
  'marking an untracked movie watched creates a watched row'
);

-- A score needs a watch mark: an unwatched row and a missing row both refuse.
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900003, true);

select throws_ok(
  $$ select public.rate_movie(900003, 8::smallint) $$,
  'BS001',
  null,
  'rating a planned, unwatched movie is refused'
);
select ok(
  (select rating is null and watched_at is null and in_watchlist
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003),
  'a refused rating writes nothing'
);
select throws_ok(
  $$ select public.rate_movie(900005, 8::smallint) $$,
  'BS001',
  null,
  'rating a movie with no row is refused'
);
select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900005),
  0::bigint,
  'a refused rating creates no row'
);

-- Rating a watched movie touches only the rating.
select public.rate_movie(900001, 6::smallint);

select ok(
  (select rating = 6 and watched_at = '2020-01-01T00:00:00Z'::timestamptz
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  'rating a watched movie stores the rating and keeps its watched date'
);

-- AC-13: the rating bounds hold in the database, independently of Zod.
select throws_ok(
  $$ select public.rate_movie(900001, 0::smallint) $$,
  '23514',
  null,
  'a rating of 0 is refused'
);
select throws_ok(
  $$ select public.rate_movie(900001, 11::smallint) $$,
  '23514',
  null,
  'a rating of 11 is refused'
);

-- Planning a watched, scored movie clears both and returns what it cleared.
select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.plan_movie(900001) $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 6::smallint) $$,
  'planning a watched movie returns the cleared date and score'
);
select ok(
  (select in_watchlist and watched_at is null and rating is null
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  'planning a watched movie leaves it planned only'
);
select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.plan_movie(900001) $$,
  $$ values (null::timestamptz, null::smallint) $$,
  'planning a planned movie again clears nothing'
);

-- Planning a movie with no row creates a planned row.
select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.plan_movie(900004) $$,
  $$ values (null::timestamptz, null::smallint) $$,
  'planning an untracked movie clears nothing'
);
select ok(
  (select in_watchlist and watchlisted_at is not null and watched_at is null
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  'planning an untracked movie creates a planned row'
);

-- Unmarking a scored movie clears the score too and returns both.
update public.user_movie_state
set watched_at = '2020-01-01T00:00:00Z', rating = 9
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900002;

select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.unmark_movie_watched(900002) $$,
  $$ values ('2020-01-01T00:00:00Z'::timestamptz, 9::smallint) $$,
  'unmarking returns the cleared date and score'
);
select ok(
  (select watched_at is null and rating is null and not in_watchlist
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900002),
  'unmarking clears the watch mark and the score'
);
select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.unmark_movie_watched(900002) $$,
  $$ values (null::timestamptz, null::smallint) $$,
  'unmarking an unwatched movie clears nothing'
);
select results_eq(
  $$ select cleared_watched_at, cleared_rating from public.unmark_movie_watched(900005) $$,
  $$ values (null::timestamptz, null::smallint) $$,
  'unmarking a movie with no row clears nothing'
);
select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900005),
  0::bigint,
  'unmarking never creates a row'
);

-- AC-15: repeats and last write wins.
select public.mark_movie_watched(900004);
select public.mark_movie_watched(900004);
select public.rate_movie(900004, 7::smallint);
select public.rate_movie(900004, 8::smallint);

select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  1::bigint,
  'repeated calls leave exactly one row'
);
select ok(
  (select rating = 8 and not in_watchlist
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  'picking 7 then 8 stores 8 on a watched, unplanned row'
);

-- AC-18: user A calling the functions on movie 603 writes A's own row, never
-- B's. Every write filters or conflicts on auth.uid(), so B's row is
-- unreachable. Seed A's 603 is watched and scored 9.
select public.rate_movie(603, 2::smallint);
select public.unmark_movie_watched(603);
select public.plan_movie(603);
select public.mark_movie_watched(603);

reset role;

select ok(
  (select in_watchlist = true and watched_at is null and rating is null
   from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222' and movie_id = 603),
  'user B''s row is untouched after user A calls every function on the same movie'
);
select ok(
  (select watched_at is not null and not in_watchlist and rating is null
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 603),
  'user A''s calls landed on user A''s own row'
);

-- AC-18: anon cannot call any of them at all.
set local role anon;
select throws_ok(
  $$ select public.mark_movie_watched(900001) $$,
  '42501',
  null,
  'anon is refused execute on mark_movie_watched'
);
select throws_ok(
  $$ select public.rate_movie(900001, 5::smallint) $$,
  '42501',
  null,
  'anon is refused execute on rate_movie'
);
select throws_ok(
  $$ select public.plan_movie(900001) $$,
  '42501',
  null,
  'anon is refused execute on plan_movie'
);
select throws_ok(
  $$ select public.unmark_movie_watched(900001) $$,
  '42501',
  null,
  'anon is refused execute on unmark_movie_watched'
);

-- The migration's one-off fix, replayed. The checks are dropped inside this
-- transaction so pre-migration rows can exist, then its exact statements run.
reset role;
alter table public.user_movie_state
  drop constraint user_movie_state_plan_or_watched_check,
  drop constraint user_movie_state_rating_needs_watched_check;
set local session_replication_role = replica;
insert into public.user_movie_state
  (user_id, movie_id, in_watchlist, watchlisted_at, watched_at, rating, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 900007, true, '2020-01-01T00:00:00Z', '2021-05-05T12:00:00Z', 6, now()),
  ('11111111-1111-1111-1111-111111111111', 900008, true, '2020-01-01T00:00:00Z', null, 4, '2019-06-01T00:00:00Z');
set local session_replication_role = origin;

update public.user_movie_state
set watched_at = updated_at
where rating is not null
  and watched_at is null;

update public.user_movie_state
set in_watchlist = false
where in_watchlist
  and watched_at is not null;

select ok(
  (select not in_watchlist
      and watchlisted_at = '2020-01-01T00:00:00Z'::timestamptz
      and watched_at = '2021-05-05T12:00:00Z'::timestamptz
      and rating = 6
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900007),
  'the fix keeps a planned and watched movie watched and drops the plan'
);
select ok(
  (select not in_watchlist
      and watched_at = '2019-06-01T00:00:00Z'::timestamptz
      and rating = 4
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900008),
  'the fix gives a scored, unwatched movie its watch mark back from updated_at'
);

select * from finish();
rollback;
