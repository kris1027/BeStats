SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.mark_movie_watched (
  p_movie_id integer
)
  RETURNS public.user_movie_state
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  insert into public.user_movie_state as s (user_id, movie_id, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, now(), false)
  on conflict (user_id, movie_id) do update
    set watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
  returning *;
$function$;

CREATE OR REPLACE FUNCTION public.rate_movie (
  p_movie_id integer,
  p_rating   smallint
)
  RETURNS public.user_movie_state
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  insert into public.user_movie_state as s (user_id, movie_id, rating, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, p_rating, now(), false)
  on conflict (user_id, movie_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
  returning *;
$function$;

REVOKE ALL ON FUNCTION "public"."mark_movie_watched"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."mark_movie_watched"(integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."rate_movie"(integer, smallint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rate_movie"(integer, smallint) TO "authenticated", "postgres", "service_role";

-- Hand correction, the same one the first migration carries for tables.
-- Supabase's default privileges grant EXECUTE on every new `public` function
-- to `anon`, and the declarative diff does not track grants that come from
-- default privileges, so the `revoke ... from anon` in `05-functions.sql`
-- produced no SQL above. Without these two lines `anon` could call both
-- functions over RPC. The call would still fail (a null `auth.uid()` breaks
-- the `not null` on `user_id` and the insert policy), but spec 0007 AC-18
-- requires no execute at all, and pgTAP asserts it.
REVOKE ALL ON FUNCTION "public"."mark_movie_watched"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."rate_movie"(integer, smallint) FROM "anon";
