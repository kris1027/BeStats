-- Spec 0015: `unmark_episodes_watched` locks its rows in `episode_id` order,
-- the order `complete_show_automatically` now locks them in, so an unmark and
-- an automatic completion of the same show can never deadlock.
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The signature and return type are unchanged, so `create or
-- replace` keeps the existing grants.

-- Clears `watched_at` on the caller's watched episodes among the ids, and
-- reports each old date, which a plain PostgREST update cannot (it returns
-- only the new values). Unmark season uses the dates for its Undo (AC-11);
-- the Undo of mark season uses it with the newly marked ids (AC-10). It never
-- inserts and never touches `rating`. It locks the rows in `episode_id`
-- order, as `complete_show_automatically` does, so the two cannot deadlock
-- (spec 0015).
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
    order by s.episode_id
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
