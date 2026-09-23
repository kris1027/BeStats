-- Spec 0007 AC-4, AC-8, AC-15 and AC-18: the two conditional movie writes.
--
-- `mark_movie_watched` and `rate_movie` hold the only business rules that
-- depend on the current row, so this file pins them from every side: their
-- shape (invoker rights, empty search_path, who may execute), what they write,
-- and that user A can never reach user B's row through them.
--
-- `lib/tracking/intent.test.ts` runs the same cases against the TypeScript
-- mirror, so the optimistic UI and the database cannot drift apart unnoticed.
--
-- User A and user B come from supabase/seed.sql. B owns movie 603, planned and
-- unwatched. Movies 900001 to 900004 are free for A in this file.

begin;
select plan(24);

-- Shape (AC-18)

select is(
  (select prosecdef from pg_proc where oid = 'public.mark_movie_watched(integer)'::regprocedure),
  false,
  'mark_movie_watched is security invoker'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.rate_movie(integer, smallint)'::regprocedure),
  false,
  'rate_movie is security invoker'
);
select is(
  (select proconfig from pg_proc where oid = 'public.mark_movie_watched(integer)'::regprocedure),
  array['search_path=""'],
  'mark_movie_watched pins an empty search_path'
);
select is(
  (select proconfig from pg_proc where oid = 'public.rate_movie(integer, smallint)'::regprocedure),
  array['search_path=""'],
  'rate_movie pins an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.mark_movie_watched(integer)', 'execute')
  and not has_function_privilege('anon', 'public.rate_movie(integer, smallint)', 'execute'),
  'anon cannot execute either function'
);
select ok(
  not exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid in (
      'public.mark_movie_watched(integer)'::regprocedure,
      'public.rate_movie(integer, smallint)'::regprocedure
    )
      and a.grantee = 0
  ),
  'PUBLIC holds no execute on either function'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_movie_watched(integer)', 'execute')
  and has_function_privilege('authenticated', 'public.rate_movie(integer, smallint)', 'execute'),
  'authenticated can execute both functions'
);

-- Everything below runs as user A.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- AC-4: the first watch clears the bookmark.
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900001, true);

select public.mark_movie_watched(900001);

select ok(
  (select watched_at is not null and in_watchlist = false
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  'the first watch sets watched_at and clears the bookmark'
);

-- AC-4 and AC-6: a rewatch bookmark, then a stale second Mark watched. The
-- date is pinned to a known past value first so "unchanged" is provable inside
-- one transaction, where now() never moves.
update public.user_movie_state
set watched_at = '2020-01-01T00:00:00Z', in_watchlist = true
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001;

select public.mark_movie_watched(900001);

select is(
  (select watched_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  '2020-01-01T00:00:00Z'::timestamptz,
  'marking an already watched movie again keeps the original date'
);
select is(
  (select in_watchlist from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900001),
  true,
  'marking an already watched movie again keeps a rewatch bookmark'
);

-- AC-4: marking a movie with no row yet creates one.
select public.mark_movie_watched(900002);

select ok(
  (select watched_at is not null and in_watchlist = false and rating is null
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900002),
  'marking an untracked movie watched creates a watched row'
);

-- AC-8: rating an unwatched, planned movie sets all three in one call.
insert into public.user_movie_state (user_id, movie_id, in_watchlist)
values ('11111111-1111-1111-1111-111111111111', 900003, true);

select public.rate_movie(900003, 8::smallint);

select ok(
  (select rating = 8 and watched_at is not null and in_watchlist = false
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003),
  'rating an unwatched movie stores the rating, marks it watched and clears the bookmark'
);

-- AC-8: rating a watched movie touches only the rating.
update public.user_movie_state
set watched_at = '2020-01-01T00:00:00Z', in_watchlist = true
where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003;

select public.rate_movie(900003, 6::smallint);

select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003),
  6::smallint,
  'rating a watched movie replaces the rating'
);
select is(
  (select watched_at from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003),
  '2020-01-01T00:00:00Z'::timestamptz,
  'rating a watched movie keeps its watched date'
);
select is(
  (select in_watchlist from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900003),
  true,
  'rating a watched movie keeps its bookmark'
);

-- AC-8: rating a movie with no row yet creates a watched, rated row.
select public.rate_movie(900004, 10::smallint);

select ok(
  (select rating = 10 and watched_at is not null and in_watchlist = false
   from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  'rating an untracked movie creates a watched, rated row'
);

-- AC-13: the rating bounds hold in the database, independently of Zod.
select throws_ok(
  $$ select public.rate_movie(900004, 0::smallint) $$,
  '23514',
  null,
  'a rating of 0 is refused'
);
select throws_ok(
  $$ select public.rate_movie(900004, 11::smallint) $$,
  '23514',
  null,
  'a rating of 11 is refused'
);

-- AC-15: repeats and last write wins.
select public.rate_movie(900004, 7::smallint);
select public.rate_movie(900004, 8::smallint);
select public.mark_movie_watched(900004);
select public.mark_movie_watched(900004);

select is(
  (select count(*) from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  1::bigint,
  'repeated calls leave exactly one row'
);
select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 900004),
  8::smallint,
  'picking 7 then 8 stores 8'
);

-- AC-18: user A calling either function on movie 603 writes A's own row, never
-- B's. The conflict target includes auth.uid(), so B's row is unreachable.
select public.rate_movie(603, 2::smallint);
select public.mark_movie_watched(603);

reset role;

select ok(
  (select in_watchlist = true and watched_at is null and rating is null
   from public.user_movie_state
   where user_id = '22222222-2222-2222-2222-222222222222' and movie_id = 603),
  'user B''s row is untouched after user A calls both functions on the same movie'
);
select is(
  (select rating from public.user_movie_state
   where user_id = '11111111-1111-1111-1111-111111111111' and movie_id = 603),
  2::smallint,
  'user A''s call landed on user A''s own row'
);

-- AC-18: anon cannot call either function at all.
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

select * from finish();
rollback;
