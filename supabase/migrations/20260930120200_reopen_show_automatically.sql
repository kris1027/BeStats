-- Spec 0015: the visit strand (AC-10, AC-11, AC-16).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth, with the grants a generated diff drops.

-- Reopens an automatic completion on a visit (spec 0015, AC-10, AC-11):
-- the page's own check found a whole TMDB read that no longer says finished
-- and watched (a new regular episode aired, an episode is unwatched, or TMDB
-- no longer says Ended or Canceled). Moves only the caller's Completed row
-- whose source is `system` to Watching with source `system`; a Completed the
-- user chose, any other status, or no row writes nothing and returns false.
-- It never inserts and never touches `user_episode_state`, and a second call
-- writes nothing (AC-16).
create or replace function public.reopen_show_automatically(p_show_id integer)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_show_id is null or p_show_id <= 0 then
    raise exception 'invalid show id' using errcode = '23514';
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

revoke all on function public.reopen_show_automatically(integer) from public, anon, authenticated;
grant execute on function public.reopen_show_automatically(integer) to authenticated;
