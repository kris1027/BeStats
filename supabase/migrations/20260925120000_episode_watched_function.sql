-- Spec 0011: mark one episode watched.
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The grant lines are the part a generated diff drops:
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default privileges add `anon`, so both are revoked here and `authenticated`
-- is granted back as the one live grant (the trap spec 0007 documents).

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`.
create or replace function public.mark_episode_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer
)
returns public.user_episode_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_episode_state as s
    (user_id, episode_id, show_id, season_number, episode_number, watched_at)
  values
    (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now())
  on conflict (user_id, episode_id) do update
    set watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;
