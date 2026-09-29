-- Spec 0014: `mark_episode_watched` reports `newly_marked` (AC-9).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. Postgres cannot change a function's return type in place,
-- so it is dropped and created again with its grants. The app and the
-- generated types move with it (spec 0014, Consequences).

drop function public.mark_episode_watched(integer, smallint, smallint, integer);

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`. `prior` reads the row as it was before the
-- upsert (every part of one statement sees the same snapshot), which is how
-- `show_started` knows whether this call is the one that watched it.
-- `newly_marked` (spec 0014, AC-9) is whether this transaction set the mark:
-- `now()` is the transaction's start, and `coalesce` keeps an earlier
-- writer's time. It does not read `prior`, whose snapshot two racing tabs
-- could both take before either commits; the upserted row is what won.
create or replace function public.mark_episode_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer
)
returns table (
  user_id uuid,
  episode_id integer,
  show_id integer,
  season_number smallint,
  episode_number smallint,
  watched_at timestamptz,
  rating smallint,
  created_at timestamptz,
  updated_at timestamptz,
  show_started boolean,
  newly_marked boolean
)
language sql
volatile
security invoker
set search_path = ''
as $$
  with prior as (
    select s.watched_at
    from public.user_episode_state as s
    where s.user_id = auth.uid() and s.episode_id = p_episode_id
  ),
  upserted as (
    insert into public.user_episode_state as s
      (user_id, episode_id, show_id, season_number, episode_number, watched_at)
    values
      (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now())
    on conflict (user_id, episode_id) do update
      set watched_at = coalesce(s.watched_at, now())
    returning s.*
  )
  select
    u.user_id, u.episode_id, u.show_id, u.season_number, u.episode_number,
    u.watched_at, u.rating, u.created_at, u.updated_at,
    public.start_watching_show(
      p_show_id,
      p_season_number >= 1
        and not exists (select 1 from prior where prior.watched_at is not null)
    ),
    u.watched_at = now()
  from upserted as u;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;
