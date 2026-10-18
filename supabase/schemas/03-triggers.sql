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

-- Owns `user_show_state.tracked_at` (spec 0020, data model). An insert
-- stamps it now and an update keeps it, whatever the client sent, so the
-- column is never writable from outside.
--
-- The one exception is Undo of Stop tracking. `restore_show_tracking` in
-- `05-functions.sql` sets the transaction local `bestats.restore_tracking` to
-- `on` before it inserts the row again, and only then does an insert keep the
-- time it was given, so the show returns to its old place. PostgREST gives a
-- client no way to set a custom setting.
create or replace function public.set_tracked_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('bestats.restore_tracking', true), '') = 'on' then
      return new;
    end if;
    new.tracked_at := now();
    return new;
  end if;

  new.tracked_at := old.tracked_at;
  return new;
end;
$$;

-- Owns `profiles.username_changed_at` and the weekly lock
-- (prompts/account-username.md). A username can change once per rolling 7
-- days; the first one, set at sign up or on `/account`, starts the clock.
-- Saving the identical name is not a change and keeps the clock where it was,
-- while a change of case is one. The client can never choose the timestamp,
-- and `user_id` never moves, whichever write path is used.
--
-- On an upsert that hits an existing row, the insert branch runs first on the
-- proposed row and the update branch then decides, as in `set_watchlisted_at`.
create or replace function public.guard_username_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.username_changed_at := now();
    return new;
  end if;

  new.user_id := old.user_id;

  if new.username = old.username then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;

  -- `BS002` is the app's own code, like `BS001` in `rate_movie`, so the
  -- action can recognise the lock without reading the message.
  if old.username_changed_at > now() - interval '7 days' then
    raise exception 'username_locked' using errcode = 'BS002';
  end if;

  new.username_changed_at := now();
  return new;
end;
$$;

-- Owns every date on `user_game_state` and pins its identity (spec 0024,
-- AC-4 to AC-7). An insert stamps `created_at` and `updated_at`; an update
-- keeps `user_id`, `game_id` and `created_at`, so a row never moves to another
-- person or game, whichever write path is used. `updated_at` on update is
-- `set_updated_at`'s.
--
-- The three list dates follow the status, whatever the client sent: added is
-- now on insert and on a move back to Want to play, started is the first time
-- the game becomes Playing, and finished is the latest time it becomes
-- Finished. Every other write keeps the stored value, so a score change or a
-- repeated save moves nothing.
--
-- The one exception is Undo. G4's restore function sets the transaction local
-- `bestats.restore_game` to `on`, and only then are the three list dates kept
-- as given, so a game returns exactly as it was. The identity pin and the
-- checks still apply. PostgREST gives a client no way to set a custom
-- setting, and no other write path may set it.
--
-- On an upsert that hits an existing row, the insert branch runs first on the
-- proposed row and the update branch then decides, as in `set_watchlisted_at`.
create or replace function public.set_game_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.user_id := old.user_id;
    new.game_id := old.game_id;
    new.created_at := old.created_at;
  end if;

  if coalesce(current_setting('bestats.restore_game', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.added_at := now();
    new.started_at := case when new.status = 'playing' then now() end;
    new.finished_at := case when new.status = 'finished' then now() end;
    return new;
  end if;

  new.added_at := old.added_at;
  new.started_at := old.started_at;
  new.finished_at := old.finished_at;

  if new.status is distinct from old.status then
    case new.status
      when 'want_to_play' then
        new.added_at := now();
      when 'playing' then
        new.started_at := coalesce(old.started_at, now());
      when 'finished' then
        new.finished_at := now();
    end case;
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

create trigger user_show_state_set_tracked_at
  before insert or update on public.user_show_state
  for each row execute function public.set_tracked_at();

create trigger user_show_state_set_updated_at
  before update on public.user_show_state
  for each row execute function public.set_updated_at();

create trigger user_episode_state_set_updated_at
  before update on public.user_episode_state
  for each row execute function public.set_updated_at();

create trigger profiles_guard_username_change
  before insert or update on public.profiles
  for each row execute function public.guard_username_change();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- `set_timestamps` sorts before `set_updated_at`, so on update the dates are
-- settled first and `updated_at` is stamped last.
create trigger user_game_state_set_timestamps
  before insert or update on public.user_game_state
  for each row execute function public.set_game_timestamps();

create trigger user_game_state_set_updated_at
  before update on public.user_game_state
  for each row execute function public.set_updated_at();
