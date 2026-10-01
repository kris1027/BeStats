-- Spec 0015: the visit reopen is confirmed by the database (AC-10, AC-16).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. `reopen_show_automatically` gains `p_episode_ids`, and
-- Postgres cannot change a function's arguments in place, so the old one is
-- dropped and the new one created with its grants (Postgres grants EXECUTE to
-- PUBLIC on every new function and Supabase adds `anon`).

drop function public.reopen_show_automatically(integer);

-- Reopens an automatic completion on a visit (spec 0015, AC-10, AC-11):
-- the page's own check found a whole TMDB read that no longer says finished
-- and watched. Moves only the caller's Completed row whose source is `system`
-- to Watching with source `system`; a Completed the user chose, any other
-- status, or no row writes nothing and returns false. It never inserts and
-- never touches `user_episode_state`, and a second call writes nothing
-- (AC-16).
--
-- `p_episode_ids` says why the app reopens. While TMDB still says Ended or
-- Canceled, the only reason is an unwatched eligible episode, and the app
-- sends the ids of every aired regular episode from the same whole TMDB read;
-- the database reopens only if at least one of them is not watched by the
-- caller. So a visit whose watched ids were read before another tab marked
-- the finale (and completed the show) cannot undo that completion: a reopen,
-- like a completion, is never stored on the app's word alone (AC-16). Null
-- (the default, which the app sends by leaving the argument out, since
-- the generated types cannot express a null argument) means TMDB no
-- longer says finished, a reason that does not depend on watched state, so
-- the row reopens without the check. An empty list, more
-- than 20000 ids or a null id is refused, as `complete_show_automatically`
-- refuses them.
--
-- Locks follow the order every other writer uses, episode rows then the show
-- row: the episode rows `for share` in `episode_id` order (as
-- `complete_show_automatically` and `unmark_episodes_watched` lock them, so
-- none of them can deadlock), then the show row `for update`. The watched
-- count is taken after the show row lock, in a statement with a fresh
-- snapshot, so a completion that committed while this call waited is seen
-- together with the marks it confirmed.
create or replace function public.reopen_show_automatically(
  p_show_id integer,
  p_episode_ids integer[] default null
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
  if p_episode_ids is not null and (
    cardinality(p_episode_ids) = 0
    or cardinality(p_episode_ids) > 20000
    or array_position(p_episode_ids, null) is not null
  ) then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  if p_episode_ids is not null then
    perform 1
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
    order by s.episode_id
    for share;

    perform 1
    from public.user_show_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.status = 'completed'
      and s.status_source = 'system'
    for update;
    if not found then
      return false;
    end if;

    select count(distinct e.id) into v_expected
    from unnest(p_episode_ids) as e(id);

    select count(*) into v_watched
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
      and s.watched_at is not null;

    if v_watched >= v_expected then
      return false;
    end if;
  end if;

  update public.user_show_state as s
  set status = 'watching',
      status_source = 'system'
  where s.user_id = auth.uid()
    and s.show_id = p_show_id
    and s.status = 'completed'
    and s.status_source = 'system';

  return found;
end;
$$;

revoke all on function public.reopen_show_automatically(integer, integer[]) from public, anon, authenticated;
grant execute on function public.reopen_show_automatically(integer, integer[]) to authenticated;
