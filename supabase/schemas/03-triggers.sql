-- Timestamp maintenance triggers.
--
-- Both functions are SECURITY INVOKER: they run as whoever fired them and need
-- no elevated privilege, so they cannot become a way around row level security
-- (the `supabase` skill's security checklist). `search_path` is pinned to empty
-- so the body cannot be captured by a shadowing schema on the caller's path.

-- Keeps `updated_at` honest without any write path having to remember it. Spec
-- 0001 makes this a trigger precisely so `updated_at` is never a value the
-- client can supply.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Advances `status_changed_at` only when the status genuinely differs, so an
-- edit to some other column does not look like a status change. `is distinct
-- from` rather than `<>` because either side could be null in principle.
create or replace function public.set_status_changed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

-- Owns `user_movie_state.watchlisted_at` (spec 0008, AC-8). Planning, by any
-- path, stamps the current time; every other write keeps the stored value
-- whatever the client sent, so the column is never writable from outside.
--
-- The one exception is Undo. `restore_movie_watchlist` in `05-functions.sql`
-- sets the transaction local `bestats.restore_watchlist` to `on` before it
-- re-plans, and only then is the old time kept, so the movie returns to its
-- old place. PostgREST gives a client no way to set a custom setting, so no
-- other write can take this branch. A new write path that re-plans a row must
-- not set it either.
--
-- On an upsert that hits an existing row, the insert branch runs first on the
-- proposed row and the update branch then decides, so the result is the same
-- as a plain update.
create or replace function public.set_watchlisted_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.watchlisted_at := case when new.in_watchlist then now() else null end;
  elsif new.in_watchlist and not old.in_watchlist then
    if current_setting('bestats.restore_watchlist', true) = 'on'
       and old.watchlisted_at is not null then
      new.watchlisted_at := old.watchlisted_at;
    else
      new.watchlisted_at := now();
    end if;
  else
    new.watchlisted_at := old.watchlisted_at;
  end if;
  return new;
end;
$$;

-- Triggers on one table fire in name order. This one does not read
-- `updated_at`, so its place beside `user_movie_state_set_updated_at` does not
-- matter.
create trigger user_movie_state_set_watchlisted_at
  before insert or update on public.user_movie_state
  for each row execute function public.set_watchlisted_at();

create trigger user_movie_state_set_updated_at
  before update on public.user_movie_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_updated_at
  before update on public.user_show_state
  for each row execute function public.set_updated_at();

create trigger user_episode_state_set_updated_at
  before update on public.user_episode_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_status_changed_at
  before update on public.user_show_state
  for each row execute function public.set_status_changed_at();
