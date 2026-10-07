-- Spec 0020: the legacy status mapping, written once (review fixes,
-- `prompts/0020-review-fixes.md`).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The expand migration `20261007120000` already ran in
-- production with the mapping inlined as a `case` in three places; this adds
-- the two helpers and points `set_show_hold` and `restore_show_tracking` at
-- the mirror one. Same behaviour, same signatures, so `create or replace`
-- keeps their grants. The backfill has already run and is not repeated.

-- The two directions of the legacy mapping (AC-19, Migration plan), each
-- written once: the backfill reads `legacy_hold_for_status`, and the mirror
-- into `status` that keeps a rollback working reads `legacy_status_for_hold`.
-- Both go with the contract migration. Pure and immutable, they read no
-- table. `legacy_status_for_hold` runs inside the caller's SECURITY INVOKER
-- functions, so `authenticated` may execute it; `legacy_hold_for_status` is
-- for the migration and pgTAP only. `supabase/tests/165-show-status-mapping.test.sql`
-- pins both.
create or replace function public.legacy_hold_for_status(p_status public.tv_status)
returns public.show_hold
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_status
    when 'on_hold' then 'paused'::public.show_hold
    when 'dropped' then 'dropped'::public.show_hold
  end;
$$;

create or replace function public.legacy_status_for_hold(p_hold public.show_hold)
returns public.tv_status
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_hold
    when 'paused' then 'on_hold'::public.tv_status
    when 'dropped' then 'dropped'::public.tv_status
    else 'watching'::public.tv_status
  end;
$$;

revoke all on function public.legacy_hold_for_status(public.tv_status) from public, anon, authenticated;
revoke all on function public.legacy_status_for_hold(public.show_hold) from public, anon, authenticated;
grant execute on function public.legacy_status_for_hold(public.show_hold) to authenticated;

create or replace function public.set_show_hold(
  p_show_id integer,
  p_hold public.show_hold,
  p_expected public.show_hold
)
returns public.show_hold
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_prior public.user_show_state;
begin
  select * into v_prior
  from public.user_show_state as s
  where s.user_id = auth.uid() and s.show_id = p_show_id
  for update;

  if v_prior.user_id is null then
    raise exception 'not_tracked' using errcode = 'BS404';
  end if;
  if v_prior.hold_state is distinct from p_expected then
    raise exception 'hold_changed' using errcode = 'BS409';
  end if;
  if v_prior.hold_state is not distinct from p_hold then
    return p_hold;
  end if;

  update public.user_show_state as s
  set hold_state = p_hold,
      status = public.legacy_status_for_hold(p_hold),
      status_source = 'user'
  where s.user_id = auth.uid() and s.show_id = p_show_id;

  return p_hold;
end;
$$;
create or replace function public.restore_show_tracking(
  p_show_id integer,
  p_tracked_at timestamptz,
  p_hold public.show_hold default null,
  p_hold_changed_at timestamptz default null
)
returns public.user_show_state
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row public.user_show_state;
begin
  if p_tracked_at is null
    or p_tracked_at > now()
    or p_hold_changed_at > now()
    or (p_hold is null) <> (p_hold_changed_at is null)
    or p_hold_changed_at < p_tracked_at
  then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_tracking', 'on', true);

  insert into public.user_show_state as s
    (user_id, show_id, tracked_at, hold_state, hold_changed_at, status, status_source)
  values (
    auth.uid(), p_show_id, p_tracked_at, p_hold, p_hold_changed_at,
    public.legacy_status_for_hold(p_hold),
    'user'
  )
  on conflict (user_id, show_id) do nothing
  returning s.* into v_row;

  perform set_config('bestats.restore_tracking', 'off', true);

  if v_row.user_id is null then
    raise exception 'already_tracked' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;
