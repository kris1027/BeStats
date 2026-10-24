-- Game status and rating functions (spec 0026): `set_game_status`,
-- `rate_game`, `remove_game`, `restore_game_status` and
-- `restore_removed_game`, the writes behind the game page's status pills and
-- score.
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The revokes and grants are written out because the
-- declarative diff does not track function privileges. It only adds
-- functions, so the app deployed before it keeps working; push it before
-- merging its PR (docs/deploy.md).

-- Game status and rating writes (spec 0026, API surface).
--
-- The status machine and its dates are spec 0024's: `set_game_timestamps`
-- owns every date, and the table's checks keep a score on Playing or
-- Finished only. These functions are how the game page moves between the
-- states, and every write whose result an Undo needs reads the old values
-- and writes in one transaction, under a row lock, so two tabs can never
-- both receive the same Undo payload (AC-13).
--
-- The same shape as every function in this file: SECURITY INVOKER with an
-- empty `search_path`, so the four row level security policies apply inside,
-- and `user_id` always `auth.uid()`, never an argument. The release gate is
-- not here; only the Server Action in `app/games/actions.ts` checks it
-- (spec 0024, security model). `lib/tracking/game-intent.ts` mirrors these
-- rules for the optimistic UI, and
-- `supabase/tests/190-game-tracking-functions.test.sql` pins them.

-- Sets a status from any status, or none, in one click (AC-3). A move back to
-- Want to play nulls the score in the same statement, since a score lives
-- only on Playing or Finished (spec 0024, AC-2). The previous values come
-- back for the score cleared Undo (AC-5), read under the row lock; a missing
-- row locks nothing and leaves them all null, so the caller always gets
-- exactly one row.
create or replace function public.set_game_status(
  p_game_id integer,
  p_status public.game_status
)
returns table (
  prev_status public.game_status,
  prev_rating smallint,
  prev_added_at timestamptz,
  prev_started_at timestamptz,
  prev_finished_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status public.game_status;
  v_rating smallint;
  v_added_at timestamptz;
  v_started_at timestamptz;
  v_finished_at timestamptz;
begin
  select s.status, s.rating, s.added_at, s.started_at, s.finished_at
  into v_status, v_rating, v_added_at, v_started_at, v_finished_at
  from public.user_game_state s
  where s.user_id = auth.uid()
    and s.game_id = p_game_id
  for update;

  insert into public.user_game_state as s (user_id, game_id, status)
  values (auth.uid(), p_game_id, p_status)
  on conflict (user_id, game_id) do update
    set status = excluded.status,
        rating = case when excluded.status = 'want_to_play' then null else s.rating end;

  return query select v_status, v_rating, v_added_at, v_started_at, v_finished_at;
end;
$$;

-- Update only: a score never creates a row, and only a game being played or
-- finished takes one (AC-6). Anything else raises `BS004`, the app's own code
-- beside `BS001` to `BS003`, which the Server Action reports as
-- `not_started`. A null score is refused the same way, so clearing goes only
-- through the action's plain update, which moves no date.
create or replace function public.rate_game(p_game_id integer, p_rating smallint)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.user_game_state
  set rating = p_rating
  where user_id = auth.uid()
    and game_id = p_game_id
    and status in ('playing', 'finished')
    and p_rating between 1 and 10;

  if not found then
    raise exception 'game_not_started' using errcode = 'BS004';
  end if;
end;
$$;

-- Removes a game from the list (AC-4): the row goes, and what it held comes
-- back with the time of removal, for the Undo. A game that is already gone
-- (removed in another tab) deletes nothing and returns no row, which the
-- client reads as done with no Undo.
create or replace function public.remove_game(p_game_id integer)
returns table (
  removed_status public.game_status,
  removed_rating smallint,
  removed_added_at timestamptz,
  removed_started_at timestamptz,
  removed_finished_at timestamptz,
  removed_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_status public.game_status;
  v_rating smallint;
  v_added_at timestamptz;
  v_started_at timestamptz;
  v_finished_at timestamptz;
begin
  delete from public.user_game_state as s
  where s.user_id = auth.uid()
    and s.game_id = p_game_id
  returning s.status, s.rating, s.added_at, s.started_at, s.finished_at
  into v_status, v_rating, v_added_at, v_started_at, v_finished_at;

  if found then
    return query select v_status, v_rating, v_added_at, v_started_at, v_finished_at, now();
  end if;
end;
$$;

-- The two Undo restores (AC-14). Both store client supplied dates, so both
-- are bounded: every date in the past, only the caller's own row, only the
-- state the matching write produced, and only for 10 minutes. The window is
-- a staleness limit, not a security boundary (the same note as
-- `restore_movie_watchlist`): a forged call can only write the caller's own
-- private row. A refusal raises `P0002`, which reaches the user as
-- `undo_expired`.
--
-- `bestats.restore_game` is what tells `set_game_timestamps` to keep the
-- given dates, so it is `on` only around the one statement and `off` again
-- before returning or raising. A statement the table's checks refuse rolls
-- the setting back with it.
--
-- `p_added_at` (and `p_removed_at`) come before the defaulted parameters
-- because Postgres needs every parameter after a default to have one.

-- Undoes a move to Want to play that cleared a score (AC-5): puts back the
-- old status, score and all three dates, on a row that is still Want to play
-- with no score and was changed in the last 10 minutes.
create or replace function public.restore_game_status(
  p_game_id integer,
  p_status public.game_status,
  p_added_at timestamptz,
  p_rating smallint default null,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform set_config('bestats.restore_game', 'on', true);

  update public.user_game_state
  set status = p_status,
      rating = p_rating,
      added_at = p_added_at,
      started_at = p_started_at,
      finished_at = p_finished_at
  where user_id = auth.uid()
    and game_id = p_game_id
    and status = 'want_to_play'
    and rating is null
    and updated_at > now() - interval '10 minutes'
    and p_status in ('playing', 'finished')
    and p_added_at <= now()
    and (p_started_at is null or p_started_at <= now())
    and (p_finished_at is null or p_finished_at <= now());

  if not found then
    perform set_config('bestats.restore_game', 'off', true);
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_game', 'off', true);
end;
$$;

-- Undoes a removal (AC-4): puts the row back exactly as `remove_game`
-- returned it, within 10 minutes of `p_removed_at`. A row that is already
-- back (set again since, or a second Undo) inserts nothing and raises.
create or replace function public.restore_removed_game(
  p_game_id integer,
  p_status public.game_status,
  p_added_at timestamptz,
  p_removed_at timestamptz,
  p_rating smallint default null,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if (
    p_added_at <= now()
    and (p_started_at is null or p_started_at <= now())
    and (p_finished_at is null or p_finished_at <= now())
    and p_removed_at <= now()
    and p_removed_at > now() - interval '10 minutes'
  ) is not true then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_game', 'on', true);

  insert into public.user_game_state (
    user_id, game_id, status, rating, added_at, started_at, finished_at
  )
  values (
    auth.uid(), p_game_id, p_status, p_rating, p_added_at, p_started_at, p_finished_at
  )
  on conflict (user_id, game_id) do nothing;

  if not found then
    perform set_config('bestats.restore_game', 'off', true);
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_game', 'off', true);
end;
$$;

revoke all on function public.set_game_status(integer, public.game_status) from public, anon, authenticated;
revoke all on function public.rate_game(integer, smallint) from public, anon, authenticated;
revoke all on function public.remove_game(integer) from public, anon, authenticated;
revoke all on function public.restore_game_status(integer, public.game_status, timestamptz, smallint, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.restore_removed_game(integer, public.game_status, timestamptz, timestamptz, smallint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.set_game_status(integer, public.game_status) to authenticated;
grant execute on function public.rate_game(integer, smallint) to authenticated;
grant execute on function public.remove_game(integer) to authenticated;
grant execute on function public.restore_game_status(integer, public.game_status, timestamptz, smallint, timestamptz, timestamptz) to authenticated;
grant execute on function public.restore_removed_game(integer, public.game_status, timestamptz, timestamptz, smallint, timestamptz, timestamptz) to authenticated;
