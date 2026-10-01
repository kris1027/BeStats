-- Spec 0015: automatic completion, the thin thread (AC-3, AC-4).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. `rate_episode` gains `newly_marked`, and Postgres cannot
-- change a function's return type in place, so it is dropped and created
-- again with its grants, as spec 0013 did. `complete_show_automatically` is
-- new; its grants are the part a generated diff drops (Postgres grants
-- EXECUTE to PUBLIC on every new function and Supabase adds `anon`).

drop function public.rate_episode(integer, smallint, smallint, integer, smallint);

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6). That first watch can
-- start the show, exactly as `mark_episode_watched` does; rating an episode
-- already watched never does (spec 0013, AC-7).
-- `newly_marked` (spec 0015, AC-4) is whether this call set the watched mark,
-- worked out as in `mark_episode_watched`; it tells the automatic completion
-- check that a rating was also a new watch.
create or replace function public.rate_episode(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer,
  p_rating smallint
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
      (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
    values
      (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now(), p_rating)
    on conflict (user_id, episode_id) do update
      set rating = excluded.rating,
          watched_at = coalesce(s.watched_at, now())
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

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;

-- Automatic completion (spec 0015, AC-3): moves the caller's Watching row to
-- Completed with `status_source = 'system'`, the one path that writes that
-- pair. The app sends the ids of every aired regular episode from one whole
-- TMDB read; the database then confirms each of them is watched itself, so a
-- completion is never stored on the app's word alone. The episode rows are
-- read `for share`: an unmark still in flight is waited for and then seen
-- (the row is checked again once the lock is free), so the two never cross.
-- The rows are locked in `episode_id` order, the same order
-- `unmark_episodes_watched` locks them in, so the two can never each hold a
-- row the other waits for (a deadlock). Without it the plan picks the order
-- (heap order, or season and episode order through the show index).
--
-- It moves only a row that still holds `watching`, whose source is `system`
-- or, for a write that newly watched a regular episode, `user`
-- (`p_allow_user_source`, null reads as false). No row, any other status, or
-- one unwatched id writes nothing and returns false; it never inserts, never
-- touches `user_episode_state`, and a second call writes nothing, so neither
-- `updated_at` nor `status_changed_at` moves (AC-16). A caller who sends made
-- up ids can only complete their own Watching show, which `set_show_status`
-- already allows.
create or replace function public.complete_show_automatically(
  p_show_id integer,
  p_episode_ids integer[],
  p_allow_user_source boolean
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_watched integer;
begin
  if p_show_id is null or p_show_id <= 0 then
    raise exception 'invalid show id' using errcode = '23514';
  end if;
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 20000
    or array_position(p_episode_ids, null) is not null
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  select count(distinct e.id) into v_expected
  from unnest(p_episode_ids) as e(id);

  select count(*) into v_watched
  from (
    select s.episode_id
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
      and s.watched_at is not null
    order by s.episode_id
    for share
  ) as watched;

  if v_watched <> v_expected then
    return false;
  end if;

  update public.user_show_state as s
  set status = 'completed',
      status_source = 'system'
  where s.user_id = auth.uid()
    and s.show_id = p_show_id
    and s.status = 'watching'
    and (s.status_source = 'system' or coalesce(p_allow_user_source, false));

  return found;
end;
$$;

revoke all on function public.complete_show_automatically(integer, integer[], boolean) from public, anon, authenticated;
grant execute on function public.complete_show_automatically(integer, integer[], boolean) to authenticated;
