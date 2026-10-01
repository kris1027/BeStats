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

-- Triggers on one table fire in name order. This one does not read
-- `updated_at`, so its place beside `user_movie_state_set_updated_at` does not
-- matter.
create trigger user_movie_state_set_watchlisted_at
  before insert or update on public.user_movie_state
  for each row execute function public.set_watchlisted_at();

create trigger user_movie_state_set_updated_at
  before update on public.user_movie_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_listed_at
  before insert or update on public.user_show_state
  for each row execute function public.set_listed_at();

create trigger user_show_state_set_updated_at
  before update on public.user_show_state
  for each row execute function public.set_updated_at();

create trigger user_episode_state_set_updated_at
  before update on public.user_episode_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_status_changed_at
  before update on public.user_show_state
  for each row execute function public.set_status_changed_at();

-- Reopens an automatic completion when a regular episode stops being watched
-- (spec 0015, AC-8): moves the writer's show from Completed with source
-- `system` to Watching with source `system`, in the same transaction as the
-- unmark. It covers every way a watched mark can go (a single untick, an
-- Undo, a season unmark, a direct API update or delete), because it lives on
-- the table rather than in each path.
--
-- It never touches a Completed the user chose, any other status, or anything
-- for a special (the `when` clauses on the two triggers keep season 0 out).
-- Security invoker: it runs as whoever made the episode write, so the forced
-- row level security of `user_show_state` applies and a user can only ever
-- reopen their own show. It writes only when the episode row is the
-- session's own: an account deletion cascades from `auth.users` as
-- `supabase_auth_admin`, with no session and no UPDATE on `user_show_state`,
-- and the trigger runs as that role, so it must return before it writes
-- (AC-9). A write with no session leaves the show to the next visit's check
-- (AC-10). Otherwise it catches nothing: a real failure fails the unmark. A season unmark of
-- many episodes reopens the show on its first row; the rest match nothing.
create or replace function public.reopen_completed_show()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is distinct from old.user_id then
    return null;
  end if;

  update public.user_show_state as s
  set status = 'watching',
      status_source = 'system'
  where s.user_id = old.user_id
    and s.show_id = old.show_id
    and s.status = 'completed'
    and s.status_source = 'system';
  return null;
end;
$$;

-- Spec 0015 AC-8: an unwatched or deleted regular episode reopens an
-- automatic completion. A rating cleared alone (`watched_at` unchanged) fires
-- neither, and neither fires for a special.
create trigger user_episode_state_reopen_on_unwatch
  after update of watched_at on public.user_episode_state
  for each row
  when (old.watched_at is not null and new.watched_at is null and old.season_number >= 1)
  execute function public.reopen_completed_show();

create trigger user_episode_state_reopen_on_delete
  after delete on public.user_episode_state
  for each row
  when (old.watched_at is not null and old.season_number >= 1)
  execute function public.reopen_completed_show();
