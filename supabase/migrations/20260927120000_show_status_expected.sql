-- Spec 0013 review fix: status writes compare against the status the caller
-- last saw, so a stale card can never delete or overwrite a newer status, and
-- a write to an existing row no longer needs TMDB to confirm the show.
--
-- Written by hand from `supabase/schemas/05-functions.sql`. The signatures
-- change, so the old functions are dropped rather than replaced, and the
-- grants are set again, as in `20260926120000_show_status_functions.sql`.

drop function public.set_show_status(integer, public.tv_status);
drop function public.remove_show_status(integer);

-- Sets one status by hand (AC-2), but only over the status the caller last
-- saw: `p_expected` is that status, or null for "no row". A card rendered
-- before a status changed elsewhere (another tab, an episode that started the
-- show) would otherwise overwrite the newer status; a mismatch raises
-- `BS409`, which reaches the user as `status_changed`, and writes nothing.
--
-- With `p_expected` set the row must already exist, and this only updates it,
-- so the Server Action skips the TMDB check there: a show TMDB has since
-- dropped can still be moved off the watchlist. Only `p_expected` null
-- inserts. Returns the row as written plus what it was before (all null when
-- there was no row), which the client keeps as the Undo of Stop watching
-- (AC-16). `listed_at` is the trigger's.
create or replace function public.set_show_status(
  p_show_id integer,
  p_status public.tv_status,
  p_expected public.tv_status
)
returns table (
  status public.tv_status,
  status_source public.status_source,
  listed_at timestamptz,
  previous_status public.tv_status,
  previous_source public.status_source,
  previous_listed_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prior public.user_show_state;
  v_row public.user_show_state;
begin
  -- Locks the row, when there is one, so the status compared and the
  -- previous values reported are the ones this write replaced.
  select * into v_prior
  from public.user_show_state as s
  where s.user_id = auth.uid() and s.show_id = p_show_id
  for update;

  if v_prior.status is distinct from p_expected then
    raise exception 'status_changed' using errcode = 'BS409';
  end if;

  if v_prior.user_id is null then
    -- A concurrent first write wins; this one reports the change.
    insert into public.user_show_state as s (user_id, show_id, status, status_source)
    values (auth.uid(), p_show_id, p_status, 'user')
    on conflict (user_id, show_id) do nothing
    returning s.* into v_row;
  else
    update public.user_show_state as s
    set status = p_status,
        status_source = 'user'
    where s.user_id = auth.uid() and s.show_id = p_show_id
    returning s.* into v_row;
  end if;

  if v_row.user_id is null then
    raise exception 'status_changed' using errcode = 'BS409';
  end if;

  return query select
    v_row.status, v_row.status_source, v_row.listed_at,
    v_prior.status, v_prior.status_source, v_prior.listed_at;
end;
$$;

-- Removes a show's status (AC-4, AC-16): the row goes, the episode rows stay.
-- Only the status the caller saw is removed: a row that now holds another one
-- raises `BS409` and stays, as in `set_show_status`. Returns what was deleted
-- and when, which is the Undo; zero rows when there was nothing to remove.
create or replace function public.remove_show_status(
  p_show_id integer,
  p_expected public.tv_status
)
returns table (
  status public.tv_status,
  status_source public.status_source,
  listed_at timestamptz,
  removed_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.user_show_state;
begin
  if p_expected is null then
    raise exception 'expected status required' using errcode = '22023';
  end if;

  delete from public.user_show_state as s
  where s.user_id = auth.uid()
    and s.show_id = p_show_id
    and s.status = p_expected
  returning s.* into v_row;

  if v_row.user_id is null then
    if exists (
      select 1 from public.user_show_state as s
      where s.user_id = auth.uid() and s.show_id = p_show_id
    ) then
      raise exception 'status_changed' using errcode = 'BS409';
    end if;
    return;
  end if;

  return query select v_row.status, v_row.status_source, v_row.listed_at, now();
end;
$$;

revoke all on function public.set_show_status(integer, public.tv_status, public.tv_status) from public, anon, authenticated;
revoke all on function public.remove_show_status(integer, public.tv_status) from public, anon, authenticated;
grant execute on function public.set_show_status(integer, public.tv_status, public.tv_status) to authenticated;
grant execute on function public.remove_show_status(integer, public.tv_status) to authenticated;
