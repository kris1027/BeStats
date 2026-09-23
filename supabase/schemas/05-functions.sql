-- Movie tracking writes whose outcome depends on the current row.
--
-- Spec 0007 keeps two rules in Postgres rather than TypeScript, because both
-- read the row they change and would race between two tabs if the app read
-- first and wrote second:
--
--   1. The first transition into watched takes the movie off the watchlist.
--      Marking an already watched movie watched again changes nothing, so a
--      stale tab can neither move the original date nor clear a rewatch
--      bookmark set since.
--   2. Rating an unwatched movie counts as that first transition.
--
-- `lib/tracking/intent.ts` mirrors these rules for the optimistic UI, and
-- `supabase/tests/050-movie-tracking-functions.test.sql` pins them here.
--
-- Both functions are SECURITY INVOKER with an empty `search_path`: they run as
-- the caller, so the four row level security policies in `04-policies.sql`
-- apply to the insert, the conflict update and the `returning` exactly as they
-- would to a plain upsert. `user_id` comes from `auth.uid()`, never from an
-- argument, and a null `auth.uid()` fails the `not null` on `user_id`, so an
-- unauthenticated call can never write.

create or replace function public.mark_movie_watched(p_movie_id integer)
returns public.user_movie_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_movie_state as s (user_id, movie_id, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, now(), false)
  on conflict (user_id, movie_id) do update
    set watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
  returning *;
$$;

create or replace function public.rate_movie(p_movie_id integer, p_rating smallint)
returns public.user_movie_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_movie_state as s (user_id, movie_id, rating, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, p_rating, now(), false)
  on conflict (user_id, movie_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
  returning *;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges add `anon` and `authenticated` on top. The declarative
-- diff does not track either, so these lines must be carried into the
-- generated migration by hand (the same trap `04-policies.sql` documents for
-- tables). `authenticated` is revoked from too and granted back, so the one
-- live grant is the one written here.
revoke all on function public.mark_movie_watched(integer) from public, anon, authenticated;
revoke all on function public.rate_movie(integer, smallint) from public, anon, authenticated;
grant execute on function public.mark_movie_watched(integer) to authenticated;
grant execute on function public.rate_movie(integer, smallint) to authenticated;
