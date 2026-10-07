-- Movie tracking writes whose outcome depends on the current row.
--
-- Spec 0007 keeps two rules in Postgres rather than TypeScript, because both
-- read the row they change and would race between two tabs if the app read
-- first and wrote second:
--
--   1. Marking an already watched movie watched again changes nothing, so a
--      stale tab cannot move the original date. Marking never touches the
--      plan: since spec 0020 (AC-14) a watched movie keeps `in_watchlist`, so
--      unmarking it puts a planned movie straight back on Watchlist or
--      Upcoming.
--   2. Rating an unwatched movie marks it watched, in the same statement.
--
-- `lib/tracking/intent.ts` mirrors these rules for the optimistic UI, and
-- `supabase/tests/050-movie-tracking-functions.test.sql` pins them here.
--
-- Both functions are SECURITY INVOKER with an empty `search_path`: they run as
-- the caller, so the four row level security policies in `04-policies.sql`
-- apply to the insert, the conflict update and the `returning` exactly as they
-- would to a plain upsert. `user_id` comes from `auth.uid()`, never from an
-- argument, and a null `auth.uid()` fails the `not null` on `user_id`, so an
-- unauthenticated call can never write.

create or replace function public.mark_movie_watched(p_movie_id integer)
returns public.user_movie_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_movie_state as s (user_id, movie_id, watched_at)
  values (auth.uid(), p_movie_id, now())
  on conflict (user_id, movie_id) do update
    set watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

create or replace function public.rate_movie(p_movie_id integer, p_rating smallint)
returns public.user_movie_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_movie_state as s (user_id, movie_id, rating, watched_at)
  values (auth.uid(), p_movie_id, p_rating, now())
  on conflict (user_id, movie_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges add `anon` and `authenticated` on top. The declarative
-- diff does not track either, so these lines must be carried into the
-- generated migration by hand (the same trap `04-policies.sql` documents for
-- tables). `authenticated` is revoked from too and granted back, so the one
-- live grant is the one written here.
revoke all on function public.mark_movie_watched(integer) from public, anon, authenticated;
revoke all on function public.rate_movie(integer, smallint) from public, anon, authenticated;
grant execute on function public.mark_movie_watched(integer) to authenticated;
grant execute on function public.rate_movie(integer, smallint) to authenticated;

-- Undo for the two private list pages (spec 0008, AC-6, AC-7).
--
-- Removing a card reuses the spec 0007 writes; these two put it back exactly
-- as it was. Both are plpgsql rather than sql because a refused Undo must
-- reach the user as a failure: a `language sql` update that matches nothing
-- returns null, not an error, and the Server Action only inspects `error`. So
-- when no row matches they raise `P0002` (`no_data_found`), which
-- `classifyTrackingError` maps to `undo_expired`.
--
-- The same shape as the functions above: SECURITY INVOKER, so row level
-- security applies inside them, an empty `search_path`, and an explicit
-- `auth.uid()` filter. Neither ever inserts, so an Undo can never create a row.
--
-- The 10 minute window is measured from `updated_at`, which the removal itself
-- set. Any later write to the row moves it forward. That is accepted: the
-- window only limits a stale Undo, it is not a security boundary, and it can
-- only ever restore the caller's own earlier value.

-- Re-plans a movie at its old place. `watchlisted_at` was kept on unplan, and
-- the transaction local setting is what tells `set_watchlisted_at` to keep it
-- rather than stamp now(). It is switched off again straight away, so nothing
-- later in the same transaction can take that branch by accident.
create or replace function public.restore_movie_watchlist(p_movie_id integer)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform set_config('bestats.restore_watchlist', 'on', true);

  update public.user_movie_state
  set in_watchlist = true
  where user_id = auth.uid()
    and movie_id = p_movie_id
    and not in_watchlist
    and watchlisted_at is not null
    and updated_at > now() - interval '10 minutes';

  if not found then
    perform set_config('bestats.restore_watchlist', 'off', true);
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_watchlist', 'off', true);
end;
$$;

-- Marks a movie watched again at its original date, which the page rendered
-- and the client passes back. It is the one client supplied time the schema
-- stores, so it is bounded: never in the future, only for the caller's own
-- row that is currently unwatched and was changed in the last 10 minutes. It
-- never touches `in_watchlist` or `rating`.
create or replace function public.restore_movie_watched(
  p_movie_id integer,
  p_watched_at timestamptz
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.user_movie_state
  set watched_at = p_watched_at
  where user_id = auth.uid()
    and movie_id = p_movie_id
    and watched_at is null
    and p_watched_at <= now()
    and updated_at > now() - interval '10 minutes';

  if not found then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.restore_movie_watchlist(integer) from public, anon, authenticated;
revoke all on function public.restore_movie_watched(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_movie_watchlist(integer) to authenticated;
grant execute on function public.restore_movie_watched(integer, timestamptz) to authenticated;

-- Episode tracking writes whose outcome depends on the current row (spec 0011).
--
-- The same shape as the movie functions above: SECURITY INVOKER with an empty
-- `search_path`, so the row level security policies apply inside them, and
-- `user_id` always `auth.uid()`. The TypeScript mirror is
-- `lib/tracking/episode-intent.ts`, and
-- `supabase/tests/080-episode-tracking-functions.test.sql` pins both.
--
-- `season_number` and `episode_number` are the TMDB season read's, passed in
-- by the Server Action (spec 0001). On conflict they are never rewritten: the
-- row keeps the numbers it was created with, and only `watched_at` and
-- `rating` ever change.

-- Legacy, kept only for the app deployed before spec 0020 and dropped by its
-- contract migration: since spec 0020 the episode functions call
-- `track_show` instead, and nothing calls this.
--
-- Legacy since spec 0020: the app no longer calls it, and it stays only so a
-- rollback to the earlier deploy works. The contract migration drops it.
-- Starts a show on its own (spec 0013, AC-6). It moves nothing or Want to
-- Watch to Watching with `status_source = 'system'`, and never touches On
-- Hold, Dropped, Completed or Watching, whatever their source. Each episode
-- function decides `p_should_start` inline, in the same statement as its own
-- write: true only when that call moved a regular (season 1 or later)
-- episode from unwatched to watched. Returns whether it created or changed
-- the row, which the action turns into the "moved to Watching" toast (AC-8).
--
-- Executable by `authenticated` because the invoker rights callers run it as
-- the caller; called directly, it can only ever start the caller's own show.
create or replace function public.start_watching_show(
  p_show_id integer,
  p_should_start boolean
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not coalesce(p_should_start, false) then
    return false;
  end if;

  insert into public.user_show_state as s (user_id, show_id, status, status_source)
  values (auth.uid(), p_show_id, 'watching', 'system')
  on conflict (user_id, show_id) do update
    set status = 'watching',
        status_source = 'system'
    -- A false `do update ... where` skips the row without an error, so every
    -- other status stays exactly as it was.
    where s.status = 'want_to_watch';

  return found;
end;
$$;

revoke all on function public.start_watching_show(integer, boolean) from public, anon, authenticated;
grant execute on function public.start_watching_show(integer, boolean) to authenticated;

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

-- Tracking a show (spec 0020, API surface).
--
-- A show is tracked while the caller has a `user_show_state` row for it, with
-- an optional hold (AC-1). These four are the only writes of `hold_state`,
-- and none touches `user_episode_state`. The same shape as every function in
-- this file: SECURITY INVOKER with an empty `search_path`, so the four row
-- level security policies apply inside, and `user_id` always `auth.uid()`,
-- never an argument. `tracked_at` and `hold_changed_at` are the
-- `set_tracking_times` trigger's. `supabase/tests/160-show-tracking.test.sql`
-- pins them.
--
-- Until the contract migration they also mirror into the legacy `status`
-- column (Migration plan), so a rollback to the app deployed before spec 0020
-- shows what the new app set: tracked is `watching`, a pause `on_hold`, a
-- drop `dropped`, all with source `user`.

-- Tracks a show with no hold (AC-2, AC-5, AC-6). Tracking a tracked show is a
-- no op that keeps its hold, so an episode mark never clears a Pause or a
-- Drop. Returns whether this call created the row, the "added to your shows"
-- toast's cue. Executable by `authenticated` because the episode functions
-- below run it as the caller; called directly, it only ever tracks the
-- caller's own show.
create or replace function public.track_show(p_show_id integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.user_show_state as s (user_id, show_id, status, status_source)
    values (auth.uid(), p_show_id, 'watching', 'user')
    on conflict (user_id, show_id) do nothing
    returning 1
  )
  select exists (select 1 from inserted);
$$;

-- Pauses, drops or resumes a show (AC-2, AC-4, AC-10), but only over the
-- hold the caller last saw: `p_expected` is that hold, null for none. A
-- mismatch raises `BS409`, which reaches the user as `hold_changed`, and
-- writes nothing. No row raises `BS404`, `not_tracked`. Choosing the hold the
-- row already holds writes nothing. Returns the hold as stored.
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

-- Stops tracking a show (AC-3, AC-4): the row goes, every episode mark and
-- rating stays. Only the hold the caller saw is removed: a row that now holds
-- another raises `BS409` and stays, and no row raises `BS404`. Returns the
-- deleted row's times and hold, which the client keeps as the Undo.
create or replace function public.untrack_show(
  p_show_id integer,
  p_expected public.show_hold
)
returns table (
  tracked_at timestamptz,
  hold_state public.show_hold,
  hold_changed_at timestamptz
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
  delete from public.user_show_state as s
  where s.user_id = auth.uid()
    and s.show_id = p_show_id
    and s.hold_state is not distinct from p_expected
  returning s.* into v_row;

  if v_row.user_id is null then
    if exists (
      select 1 from public.user_show_state as s
      where s.user_id = auth.uid() and s.show_id = p_show_id
    ) then
      raise exception 'hold_changed' using errcode = 'BS409';
    end if;
    raise exception 'not_tracked' using errcode = 'BS404';
  end if;

  return query select v_row.tracked_at, v_row.hold_state, v_row.hold_changed_at;
end;
$$;

-- The Undo of Stop tracking (AC-3): puts the row back with the times and hold
-- `untrack_show` reported, so the show returns to its old place. It stores
-- client supplied times, so they are bounded: none in the future,
-- `hold_changed_at` never before `tracked_at`, and a hold and its time both
-- set or both null. A supplied `tracked_at` can only move the caller's own
-- sort order, which is accepted. A row that is already back (tracked again
-- since, or a second Undo) raises `P0002`, which reaches the user as
-- `undo_expired`, and so does anything out of bounds.
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

revoke all on function public.track_show(integer) from public, anon, authenticated;
revoke all on function public.set_show_hold(integer, public.show_hold, public.show_hold) from public, anon, authenticated;
revoke all on function public.untrack_show(integer, public.show_hold) from public, anon, authenticated;
revoke all on function public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz) from public, anon, authenticated;
grant execute on function public.track_show(integer) to authenticated;
grant execute on function public.set_show_hold(integer, public.show_hold, public.show_hold) to authenticated;
grant execute on function public.untrack_show(integer, public.show_hold) to authenticated;
grant execute on function public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz) to authenticated;

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`. `prior` reads the row as it was before the
-- upsert (every part of one statement sees the same snapshot), which is how
-- it knows whether this call is the one that watched it. Only that first
-- watch of a regular episode tracks the show (spec 0020, AC-5);
-- `show_started` reports whether it newly did, keeping the name the app
-- deployed before spec 0020 reads.
-- `newly_marked` (spec 0014, AC-9) is whether this transaction set the mark:
-- `now()` is the transaction's start, and `coalesce` keeps an earlier
-- writer's time. It does not read `prior`, whose snapshot two racing tabs
-- could both take before either commits; the upserted row is what won.
create or replace function public.mark_episode_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer
)
returns table (
  user_id uuid,
  episode_id integer,
  show_id integer,
  season_number smallint,
  episode_number smallint,
  watched_at timestamptz,
  rating smallint,
  created_at timestamptz,
  updated_at timestamptz,
  show_started boolean,
  newly_marked boolean
)
language sql
volatile
security invoker
set search_path = ''
as $$
  with prior as (
    select s.watched_at
    from public.user_episode_state as s
    where s.user_id = auth.uid() and s.episode_id = p_episode_id
  ),
  upserted as (
    insert into public.user_episode_state as s
      (user_id, episode_id, show_id, season_number, episode_number, watched_at)
    values
      (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now())
    on conflict (user_id, episode_id) do update
      set watched_at = coalesce(s.watched_at, now())
    returning s.*
  )
  select
    u.user_id, u.episode_id, u.show_id, u.season_number, u.episode_number,
    u.watched_at, u.rating, u.created_at, u.updated_at,
    case
      when p_season_number >= 1
        and not exists (select 1 from prior where prior.watched_at is not null)
      then public.track_show(p_show_id)
      else false
    end,
    u.watched_at = now()
  from upserted as u;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6). That first watch can
-- track the show, exactly as `mark_episode_watched` does; rating an episode
-- already watched never does (spec 0013, AC-7; spec 0020, AC-5).
-- `newly_marked` (spec 0015, AC-4) is whether this call set the watched mark,
-- worked out as in `mark_episode_watched`. The app no longer reads it; it
-- stays for the automatic completion check of the app deployed before spec
-- 0020, so a rollback keeps working, and goes with the contract migration.
create or replace function public.rate_episode(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer,
  p_rating smallint
)
returns table (
  user_id uuid,
  episode_id integer,
  show_id integer,
  season_number smallint,
  episode_number smallint,
  watched_at timestamptz,
  rating smallint,
  created_at timestamptz,
  updated_at timestamptz,
  show_started boolean,
  newly_marked boolean
)
language sql
volatile
security invoker
set search_path = ''
as $$
  with prior as (
    select s.watched_at
    from public.user_episode_state as s
    where s.user_id = auth.uid() and s.episode_id = p_episode_id
  ),
  upserted as (
    insert into public.user_episode_state as s
      (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
    values
      (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now(), p_rating)
    on conflict (user_id, episode_id) do update
      set rating = excluded.rating,
          watched_at = coalesce(s.watched_at, now())
    returning s.*
  )
  select
    u.user_id, u.episode_id, u.show_id, u.season_number, u.episode_number,
    u.watched_at, u.rating, u.created_at, u.updated_at,
    case
      when p_season_number >= 1
        and not exists (select 1 from prior where prior.watched_at is not null)
      then public.track_show(p_show_id)
      else false
    end,
    u.watched_at = now()
  from upserted as u;
$$;

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;

-- Mark season watched (AC-9). The action passes every aired episode of the
-- season, ids and numbers as parallel arrays. One statement: it succeeds or
-- fails as a whole, and it returns the ids it newly marked, which is exactly
-- what the Undo clears (AC-10). No rating is touched. Newly marking any
-- regular episode tracks an untracked show (spec 0020, AC-5), reported as
-- `show_started`.
--
-- `distinct on` keeps one entry per id even if the TypeScript deduplication
-- regresses: two entries for one id in a single `on conflict` insert would
-- fail the whole statement with `21000` (spec 0001).
create or replace function public.mark_season_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_ids integer[],
  p_episode_numbers smallint[]
)
returns table (marked_ids integer[], show_started boolean)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_marked integer[];
begin
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 1000
    or cardinality(p_episode_ids) <> coalesce(cardinality(p_episode_numbers), 0)
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  with marked as (
    insert into public.user_episode_state as s
      (user_id, episode_id, show_id, season_number, episode_number, watched_at)
    select distinct on (e.id)
      auth.uid(), e.id, p_show_id, p_season_number, e.num, now()
    from unnest(p_episode_ids, p_episode_numbers) as e(id, num)
    order by e.id, e.num
    on conflict (user_id, episode_id) do update
      set watched_at = now()
      -- A `do update ... where` that is false skips that row without an error
      -- and leaves it out of `returning`, so an already watched episode keeps
      -- its date and is not reported as newly marked.
      where s.watched_at is null
    returning s.episode_id
  )
  select coalesce(array_agg(marked.episode_id order by marked.episode_id), '{}')
  into v_marked
  from marked;

  return query select
    v_marked,
    case
      when p_season_number >= 1 and cardinality(v_marked) > 0
      then public.track_show(p_show_id)
      else false
    end;
end;
$$;

-- Clears `watched_at` on the caller's watched episodes among the ids, and
-- reports each old date, which a plain PostgREST update cannot (it returns
-- only the new values). Unmark season uses the dates for its Undo (AC-11);
-- the Undo of mark season uses it with the newly marked ids (AC-10). It never
-- inserts and never touches `rating`. It locks the rows in `episode_id`
-- order, as `complete_show_automatically` does, so the two cannot deadlock
-- (spec 0015).
create or replace function public.unmark_episodes_watched(
  p_show_id integer,
  p_episode_ids integer[]
)
returns table (episode_id integer, watched_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 1000
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  return query
  with prior as (
    select s.episode_id, s.watched_at
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
      and s.watched_at is not null
    order by s.episode_id
    for update
  )
  update public.user_episode_state as u
  set watched_at = null
  from prior
  where u.user_id = auth.uid()
    and u.episode_id = prior.episode_id
  returning prior.episode_id, prior.watched_at;
end;
$$;

-- The Undo of unmark season (AC-11): puts back each episode's own earlier
-- date, which the client passes back from `unmark_episodes_watched`. Like
-- `restore_movie_watched` it is bounded, because it stores a client supplied
-- time: only the caller's own rows that are still unwatched, were changed in
-- the last 10 minutes, and only a date that is not in the future. A malformed
-- entry fails the record cast and errors the whole call. No row restored
-- raises `P0002`, which reaches the user as `undo_expired`.
create or replace function public.restore_episodes_watched(
  p_show_id integer,
  p_entries jsonb
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_restored integer;
begin
  if p_entries is null
    or jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) = 0
    or jsonb_array_length(p_entries) > 1000
  then
    raise exception 'invalid restore list' using errcode = '22023';
  end if;

  update public.user_episode_state as u
  set watched_at = e.watched_at
  from jsonb_to_recordset(p_entries) as e(episode_id integer, watched_at timestamptz)
  where u.user_id = auth.uid()
    and u.show_id = p_show_id
    and u.episode_id = e.episode_id
    and u.watched_at is null
    and e.watched_at <= now()
    and u.updated_at > now() - interval '10 minutes';

  get diagnostics v_restored = row_count;
  if v_restored = 0 then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  return v_restored;
end;
$$;

revoke all on function public.mark_season_watched(integer, smallint, integer[], smallint[]) from public, anon, authenticated;
revoke all on function public.unmark_episodes_watched(integer, integer[]) from public, anon, authenticated;
revoke all on function public.restore_episodes_watched(integer, jsonb) from public, anon, authenticated;
grant execute on function public.mark_season_watched(integer, smallint, integer[], smallint[]) to authenticated;
grant execute on function public.unmark_episodes_watched(integer, integer[]) to authenticated;
grant execute on function public.restore_episodes_watched(integer, jsonb) to authenticated;

-- Legacy since spec 0020: the app no longer calls these, and they stay only so a
-- rollback to the earlier deploy works. The contract migration drops them.
-- TV status writes (spec 0013).
--
-- A status is only ever written through these three, so `status_source` can
-- mean something: every choice here writes `'user'`, fixed in the body and
-- never an argument, and `'system'` comes only from `start_watching_show`
-- above and from automatic completion (spec 0015: `complete_show_automatically`,
-- `reopen_show_automatically` and the `reopen_completed_show` trigger). The same shape as every function above: SECURITY INVOKER with an
-- empty `search_path`, so the four row level security policies apply inside,
-- and `user_id` always `auth.uid()`. None touches `user_episode_state`
-- (AC-3). `supabase/tests/090-show-status-functions.test.sql` pins them.

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

revoke all on function public.set_show_status(integer, public.tv_status, public.tv_status) from public, anon, authenticated;
revoke all on function public.remove_show_status(integer, public.tv_status) from public, anon, authenticated;
revoke all on function public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.set_show_status(integer, public.tv_status, public.tv_status) to authenticated;
grant execute on function public.remove_show_status(integer, public.tv_status) to authenticated;
grant execute on function public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz) to authenticated;

-- Legacy since spec 0020: the app no longer calls it, and it stays only so a
-- rollback to the earlier deploy works. The contract migration drops it.
-- Automatic completion (spec 0015, AC-3): moves the caller's Watching row to
-- Completed with `status_source = 'system'`, the one path that writes that
-- pair. The app sends the ids of every aired regular episode from one whole
-- TMDB read; the database then confirms each of them is watched itself, so a
-- completion is never stored on the app's word alone. The episode rows are
-- read `for share`: an unmark still in flight is waited for and then seen
-- (the row is checked again once the lock is free), so the two never cross.
-- The rows are locked in `episode_id` order, the same order
-- `unmark_episodes_watched` locks them in, so the two can never each hold a
-- row the other waits for (a deadlock). Without it the plan picks the order
-- (heap order, or season and episode order through the show index).
--
-- It moves only a row that still holds `watching`, whose source is `system`
-- or, for a write that newly watched a regular episode, `user`
-- (`p_allow_user_source`, null reads as false). No row, any other status, or
-- one unwatched id writes nothing and returns false; it never inserts, never
-- touches `user_episode_state`, and a second call writes nothing, so neither
-- `updated_at` nor `status_changed_at` moves (AC-16). A caller who sends made
-- up ids can only complete their own Watching show, which `set_show_status`
-- already allows.
create or replace function public.complete_show_automatically(
  p_show_id integer,
  p_episode_ids integer[],
  p_allow_user_source boolean
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
  if coalesce(cardinality(p_episode_ids), 0) = 0
    or cardinality(p_episode_ids) > 20000
    or array_position(p_episode_ids, null) is not null
  then
    raise exception 'invalid episode list' using errcode = '22023';
  end if;

  select count(distinct e.id) into v_expected
  from unnest(p_episode_ids) as e(id);

  select count(*) into v_watched
  from (
    select s.episode_id
    from public.user_episode_state as s
    where s.user_id = auth.uid()
      and s.show_id = p_show_id
      and s.episode_id = any(p_episode_ids)
      and s.watched_at is not null
    order by s.episode_id
    for share
  ) as watched;

  if v_watched <> v_expected then
    return false;
  end if;

  update public.user_show_state as s
  set status = 'completed',
      status_source = 'system'
  where s.user_id = auth.uid()
    and s.show_id = p_show_id
    and s.status = 'watching'
    and (s.status_source = 'system' or coalesce(p_allow_user_source, false));

  return found;
end;
$$;

revoke all on function public.complete_show_automatically(integer, integer[], boolean) from public, anon, authenticated;
grant execute on function public.complete_show_automatically(integer, integer[], boolean) to authenticated;

-- Legacy since spec 0020: the app no longer calls it, and it stays only so a
-- rollback to the earlier deploy works. The contract migration drops it.
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
