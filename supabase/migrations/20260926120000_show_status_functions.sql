-- Spec 0013: TV status, the thin thread.
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- The grant lines are the part a generated diff drops: Postgres grants EXECUTE
-- to PUBLIC on every new function and Supabase's default privileges add
-- `anon`, so both are revoked here and `authenticated` is granted back as the
-- one live grant (the trap spec 0007 documents).

alter table public.user_show_state
  add column listed_at timestamptz;

-- Backfill, before the check constraint that every listed row would fail and
-- before the trigger that would restamp it. `status_changed_at` is when the
-- row entered its current status, the closest time there is to "joined the
-- watchlist". The `updated_at` trigger is paused so the backfill does not
-- restamp every row as changed just now, as the `watchlisted_at` migration
-- did.
alter table public.user_show_state
  disable trigger user_show_state_set_updated_at;

update public.user_show_state
set listed_at = status_changed_at
where status in ('want_to_watch', 'watching');

alter table public.user_show_state
  enable trigger user_show_state_set_updated_at;

alter table public.user_show_state
  add constraint user_show_state_listed_at_check
  check (status not in ('want_to_watch', 'watching') or listed_at is not null);

create index user_show_state_watchlist_idx
  on public.user_show_state (user_id, listed_at desc, show_id)
  where status in ('want_to_watch', 'watching');

-- Owns `user_show_state.listed_at` (spec 0013, AC-14), the show twin of
-- `set_watchlisted_at`. A status entering Want to Watch or Watching from no row
-- or any other status stamps the current time; every other write keeps the
-- stored value (null on an insert outside those two), whatever the client sent.
--
-- The one exception is Undo. `restore_show_status` in `05-functions.sql` sets
-- the transaction local `bestats.restore_listed_at` to `on` first: then an
-- insert keeps the time it was given (the removed row's own) and an update
-- keeps the stored one, so the show returns to its old place. PostgREST gives
-- a client no way to set a custom setting.
create or replace function public.set_listed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_listed boolean := new.status in ('want_to_watch', 'watching');
  v_restore boolean :=
    coalesce(current_setting('bestats.restore_listed_at', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if v_restore then
      return new;
    end if;
    new.listed_at := case when v_listed then now() else null end;
  elsif v_restore then
    new.listed_at := old.listed_at;
  elsif v_listed and old.status not in ('want_to_watch', 'watching') then
    new.listed_at := now();
  else
    new.listed_at := old.listed_at;
  end if;
  return new;
end;
$$;

create trigger user_show_state_set_listed_at
  before insert or update on public.user_show_state
  for each row execute function public.set_listed_at();

-- A trigger function cannot be called directly, so this is tidiness, but it
-- keeps all four alike and matches `04-policies.sql`.
revoke all on function public.set_listed_at() from public, anon, authenticated;

-- TV status writes (spec 0013).
--
-- A status is only ever written through these three, so `status_source` can
-- mean something: every choice here writes `'user'`, fixed in the body and
-- never an argument, and `'system'` comes only from `start_watching_show`
-- below. The same shape as every function above: SECURITY INVOKER with an
-- empty `search_path`, so the four row level security policies apply inside,
-- and `user_id` always `auth.uid()`. None touches `user_episode_state`
-- (AC-3). `supabase/tests/090-show-status-functions.test.sql` pins them.

-- Sets one status by hand (AC-2). Returns the row as written plus what it was
-- before (all null when there was no row), which the client keeps as the
-- Undo of Stop watching (AC-16). `listed_at` is the trigger's.
create or replace function public.set_show_status(
  p_show_id integer,
  p_status public.tv_status
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
  -- Locks the row, when there is one, so the previous values reported are
  -- the ones this write replaced.
  select * into v_prior
  from public.user_show_state as s
  where s.user_id = auth.uid() and s.show_id = p_show_id
  for update;

  insert into public.user_show_state as s (user_id, show_id, status, status_source)
  values (auth.uid(), p_show_id, p_status, 'user')
  on conflict (user_id, show_id) do update
    set status = excluded.status,
        status_source = 'user'
  returning s.* into v_row;

  return query select
    v_row.status, v_row.status_source, v_row.listed_at,
    v_prior.status, v_prior.status_source, v_prior.listed_at;
end;
$$;

-- Removes a show's status (AC-4, AC-16): the row goes, the episode rows stay.
-- Returns what was deleted and when, which is the Undo; zero rows when there
-- was nothing to remove.
create or replace function public.remove_show_status(p_show_id integer)
returns table (
  status public.tv_status,
  status_source public.status_source,
  listed_at timestamptz,
  removed_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.user_show_state as s
  where s.user_id = auth.uid() and s.show_id = p_show_id
  returning s.status, s.status_source, s.listed_at, now();
$$;

-- The Undo of a removal or of Stop watching (AC-19). It puts back the
-- status, source and place the undone action reported, only while the row is
-- still what that action left, within the 10 minute window every restore in
-- this file uses:
--
--   - `p_expected` null: the removal. The row must be absent and `p_removed_at`
--     less than 10 minutes old; the row comes back with the given `listed_at`.
--   - `p_expected` set: Stop watching. The row must hold that status and have
--     changed in the last 10 minutes; it keeps its stored `listed_at`.
--
-- The three that can be absent come last with a null default, so the Server
-- Action leaves them out rather than sending null. It stores client supplied
-- times, so a time in the future is refused, and it can only ever reach the
-- caller's own row. Anything refused raises `P0002`,
-- which reaches the user as `undo_expired`.
create or replace function public.restore_show_status(
  p_show_id integer,
  p_status public.tv_status,
  p_source public.status_source,
  p_expected public.tv_status default null,
  p_listed_at timestamptz default null,
  p_removed_at timestamptz default null
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
  if p_status is null or p_source is null or p_listed_at > now() then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_listed_at', 'on', true);

  if p_expected is null then
    if p_removed_at is null
      or p_removed_at > now()
      or p_removed_at <= now() - interval '10 minutes'
    then
      perform set_config('bestats.restore_listed_at', 'off', true);
      raise exception 'undo_expired' using errcode = 'P0002';
    end if;

    insert into public.user_show_state as s
      (user_id, show_id, status, status_source, listed_at)
    values (auth.uid(), p_show_id, p_status, p_source, p_listed_at)
    on conflict (user_id, show_id) do nothing
    returning s.* into v_row;
  else
    update public.user_show_state as s
    set status = p_status,
        status_source = p_source
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.status = p_expected
      and s.updated_at > now() - interval '10 minutes'
    returning s.* into v_row;
  end if;

  perform set_config('bestats.restore_listed_at', 'off', true);

  if v_row.user_id is null then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.set_show_status(integer, public.tv_status) from public, anon, authenticated;
revoke all on function public.remove_show_status(integer) from public, anon, authenticated;
revoke all on function public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.set_show_status(integer, public.tv_status) to authenticated;
grant execute on function public.remove_show_status(integer) to authenticated;
grant execute on function public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz) to authenticated;
