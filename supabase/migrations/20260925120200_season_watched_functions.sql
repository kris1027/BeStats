-- Spec 0011: mark a season watched, unmark episodes and restore their dates.
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The grant lines are the part a generated diff drops:
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default privileges add `anon`, so both are revoked here and `authenticated`
-- is granted back as the one live grant (the trap spec 0007 documents).

-- Mark season watched (AC-9). The action passes every aired episode of the
-- season, ids and numbers as parallel arrays. One statement: it succeeds or
-- fails as a whole, and it returns the ids it newly marked, which is exactly
-- what the Undo clears (AC-10). No rating is touched.
--
-- `distinct on` keeps one entry per id even if the TypeScript deduplication
-- regresses: two entries for one id in a single `on conflict` insert would
-- fail the whole statement with `21000` (spec 0001).
create or replace function public.mark_season_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_ids integer[],
  p_episode_numbers smallint[]
)
returns integer[]
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_marked integer[];
begin
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 1000
    or cardinality(p_episode_ids) <> coalesce(cardinality(p_episode_numbers), 0)
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  with marked as (
    insert into public.user_episode_state as s
      (user_id, episode_id, show_id, season_number, episode_number, watched_at)
    select distinct on (e.id)
      auth.uid(), e.id, p_show_id, p_season_number, e.num, now()
    from unnest(p_episode_ids, p_episode_numbers) as e(id, num)
    order by e.id, e.num
    on conflict (user_id, episode_id) do update
      set watched_at = now()
      -- A `do update ... where` that is false skips that row without an error
      -- and leaves it out of `returning`, so an already watched episode keeps
      -- its date and is not reported as newly marked.
      where s.watched_at is null
    returning s.episode_id
  )
  select coalesce(array_agg(marked.episode_id order by marked.episode_id), '{}')
  into v_marked
  from marked;

  return v_marked;
end;
$$;

-- Clears `watched_at` on the caller's watched episodes among the ids, and
-- reports each old date, which a plain PostgREST update cannot (it returns
-- only the new values). Unmark season uses the dates for its Undo (AC-11);
-- the Undo of mark season uses it with the newly marked ids (AC-10). It never
-- inserts and never touches `rating`.
create or replace function public.unmark_episodes_watched(
  p_show_id integer,
  p_episode_ids integer[]
)
returns table (episode_id integer, watched_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 1000
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  return query
  with prior as (
    select s.episode_id, s.watched_at
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
      and s.watched_at is not null
    for update
  )
  update public.user_episode_state as u
  set watched_at = null
  from prior
  where u.user_id = auth.uid()
    and u.episode_id = prior.episode_id
  returning prior.episode_id, prior.watched_at;
end;
$$;

-- The Undo of unmark season (AC-11): puts back each episode's own earlier
-- date, which the client passes back from `unmark_episodes_watched`. Like
-- `restore_movie_watched` it is bounded, because it stores a client supplied
-- time: only the caller's own rows that are still unwatched, were changed in
-- the last 10 minutes, and only a date that is not in the future. A malformed
-- entry fails the record cast and errors the whole call. No row restored
-- raises `P0002`, which reaches the user as `undo_expired`.
create or replace function public.restore_episodes_watched(
  p_show_id integer,
  p_entries jsonb
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_restored integer;
begin
  if p_entries is null
    or jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) = 0
    or jsonb_array_length(p_entries) > 1000
  then
    raise exception 'invalid restore list' using errcode = '22023';
  end if;

  update public.user_episode_state as u
  set watched_at = e.watched_at
  from jsonb_to_recordset(p_entries) as e(episode_id integer, watched_at timestamptz)
  where u.user_id = auth.uid()
    and u.show_id = p_show_id
    and u.episode_id = e.episode_id
    and u.watched_at is null
    and e.watched_at <= now()
    and u.updated_at > now() - interval '10 minutes';

  get diagnostics v_restored = row_count;
  if v_restored = 0 then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  return v_restored;
end;
$$;

revoke all on function public.mark_season_watched(integer, smallint, integer[], smallint[]) from public, anon, authenticated;
revoke all on function public.unmark_episodes_watched(integer, integer[]) from public, anon, authenticated;
revoke all on function public.restore_episodes_watched(integer, jsonb) from public, anon, authenticated;
grant execute on function public.mark_season_watched(integer, smallint, integer[], smallint[]) to authenticated;
grant execute on function public.unmark_episodes_watched(integer, integer[]) to authenticated;
grant execute on function public.restore_episodes_watched(integer, jsonb) to authenticated;
