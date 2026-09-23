SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.restore_movie_watched (
  p_movie_id   integer,
  p_watched_at timestamp with time zone
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  update public.user_movie_state
  set watched_at = p_watched_at
  where user_id = auth.uid()
    and movie_id = p_movie_id
    and watched_at is null
    and p_watched_at <= now()
    and updated_at > now() - interval '10 minutes';

  if not found then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_movie_watchlist (
  p_movie_id integer
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform set_config('bestats.restore_watchlist', 'on', true);

  update public.user_movie_state
  set in_watchlist = true
  where user_id = auth.uid()
    and movie_id = p_movie_id
    and not in_watchlist
    and watchlisted_at is not null
    and updated_at > now() - interval '10 minutes';

  if not found then
    perform set_config('bestats.restore_watchlist', 'off', true);
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_watchlist', 'off', true);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."restore_movie_watched"(integer, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."restore_movie_watched"(integer, timestamp WITH time zone) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."restore_movie_watchlist"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."restore_movie_watchlist"(integer) TO "authenticated", "postgres", "service_role";

-- Hand correction, the same one the movie tracking functions migration
-- carries. Supabase's default privileges grant EXECUTE on every new `public`
-- function to `anon`, and the declarative diff does not track grants that come
-- from default privileges, so the `revoke ... from anon` in `05-functions.sql`
-- produced no SQL above. Without these two lines `anon` could call both
-- functions over RPC. The call would still match no row (a null `auth.uid()`
-- equals nothing), but spec 0008 AC-4 requires no execute at all, and pgTAP
-- asserts it.
REVOKE ALL ON FUNCTION "public"."restore_movie_watchlist"(integer) FROM "anon";

REVOKE ALL ON FUNCTION "public"."restore_movie_watched"(integer, timestamp WITH time zone) FROM "anon";
