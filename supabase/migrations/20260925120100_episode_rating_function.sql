-- Spec 0011: rate one episode.
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The grant lines are the part a generated diff drops:
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default privileges add `anon`, so both are revoked here and `authenticated`
-- is granted back as the one live grant (the trap spec 0007 documents).

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6).
create or replace function public.rate_episode(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer,
  p_rating smallint
)
returns public.user_episode_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_episode_state as s
    (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
  values
    (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now(), p_rating)
  on conflict (user_id, episode_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;
