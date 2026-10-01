-- Spec 0015: choosing the current status pins a `system` status as the
-- user's (AC-19, replacing the last sentence of spec 0013 AC-2).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The signature and return type are unchanged, so `create or
-- replace` keeps the existing grants.

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

  -- Choosing the status the row already holds (spec 0015, AC-19, replacing
  -- spec 0013 AC-2): with source `user` it writes nothing and reports no
  -- previous values. With source `system` it pins the status as the user's,
  -- so no automatic check moves it afterwards; the status itself does not
  -- change, so neither `status_changed_at` nor `listed_at` moves.
  if v_prior.status = p_status then
    if v_prior.status_source = 'user' then
      return query select
        v_prior.status, v_prior.status_source, v_prior.listed_at,
        null::public.tv_status, null::public.status_source, null::timestamptz;
      return;
    end if;

    update public.user_show_state as s
    set status_source = 'user'
    where s.user_id = auth.uid() and s.show_id = p_show_id
    returning s.* into v_row;

    return query select
      v_row.status, v_row.status_source, v_row.listed_at,
      v_prior.status, v_prior.status_source, v_prior.listed_at;
    return;
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
