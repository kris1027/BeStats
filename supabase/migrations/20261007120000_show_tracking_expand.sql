-- Spec 0020, the expand migration: tracked plus an optional hold, alongside
-- the five statuses (Build plan step 1; Migration plan phase 1).
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- Additive only: every column, trigger, check, index, view and function the
-- app deployed before spec 0020 reads stays, and the episode functions keep
-- their return shapes, so that app keeps working until the new one is live.
-- The contract migration drops the legacy parts once production is verified.
-- Functions whose signature is unchanged keep their grants through `create or
-- replace`; new ones get theirs here, as the declarative diff does not track
-- them.

create type public.show_hold as enum (
  'paused',
  'dropped'
);

-- The deployed app always writes a status; the new app writes the legacy
-- mirror only. Nullable with a default so neither can fail on it.
alter table public.user_show_state
  alter column status drop not null,
  alter column status set default 'watching';

alter table public.user_show_state
  add column tracked_at timestamptz not null default now(),
  add column hold_state public.show_hold,
  add column hold_changed_at timestamptz;

-- AC-19: every existing row, mapped. Want to Watch, Watching and Completed
-- become tracked with no hold; On Hold becomes paused and Dropped dropped.
-- The table's triggers are off for this one statement, so the backfill moves
-- neither `updated_at` nor `status_changed_at` nor `listed_at`, and no Undo
-- window opens. No episode or movie row is touched.
alter table public.user_show_state disable trigger user;

update public.user_show_state
set tracked_at = coalesce(listed_at, status_changed_at),
    hold_state = case status
      when 'on_hold' then 'paused'::public.show_hold
      when 'dropped' then 'dropped'::public.show_hold
    end,
    hold_changed_at = case
      when status in ('on_hold', 'dropped') then status_changed_at
    end;

alter table public.user_show_state enable trigger user;

alter table public.user_show_state
  add constraint user_show_state_hold_changed_at_check
    check ((hold_state is null) = (hold_changed_at is null));

create index user_show_state_held_idx
  on public.user_show_state (user_id, hold_changed_at desc, show_id)
  where hold_state is not null;

-- AC-13: only planned movies not yet watched are classified.
drop index public.user_movie_state_watchlist_idx;
create index user_movie_state_watchlist_idx
  on public.user_movie_state (user_id, watchlisted_at desc, movie_id)
  where in_watchlist and watched_at is null;

-- Owns `user_show_state.tracked_at` and `hold_changed_at` (spec 0020, data
-- model). An insert stamps `tracked_at` now, and `hold_changed_at` now when
-- it carries a hold; an update keeps `tracked_at` and moves
-- `hold_changed_at` only when the hold genuinely changes (to null when the
-- hold is cleared). Whatever the client sent is overwritten, so neither
-- column is ever writable from outside.
--
-- The one exception is Undo of Stop tracking. `restore_show_tracking` in
-- `05-functions.sql` sets the transaction local `bestats.restore_tracking` to
-- `on` before it inserts the row again, and only then does an insert keep the
-- times it was given, so the show returns to its old place. PostgREST gives
-- a client no way to set a custom setting.
create or replace function public.set_tracking_times()
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
    new.hold_changed_at := case when new.hold_state is null then null else now() end;
    return new;
  end if;

  new.tracked_at := old.tracked_at;
  if new.hold_state is distinct from old.hold_state then
    new.hold_changed_at := case when new.hold_state is null then null else now() end;
  else
    new.hold_changed_at := old.hold_changed_at;
  end if;
  return new;
end;
$$;

create trigger user_show_state_set_tracking_times
  before insert or update on public.user_show_state
  for each row execute function public.set_tracking_times();

revoke all on function public.set_tracking_times() from public, anon, authenticated;

-- AC-14: marking or rating a movie watched no longer clears its plan.
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
      status = case p_hold
        when 'paused' then 'on_hold'::public.tv_status
        when 'dropped' then 'dropped'::public.tv_status
        else 'watching'::public.tv_status
      end,
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
    case p_hold
      when 'paused' then 'on_hold'::public.tv_status
      when 'dropped' then 'dropped'::public.tv_status
      else 'watching'::public.tv_status
    end,
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

-- AC-5: the episode functions track the show in place of starting it.
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

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6). That first watch can
-- track the show, exactly as `mark_episode_watched` does; rating an episode
-- already watched never does (spec 0013, AC-7; spec 0020, AC-5).
-- `newly_marked` (spec 0015, AC-4) is whether this call set the watched mark,
-- worked out as in `mark_episode_watched`; it tells the automatic completion
-- check that a rating was also a new watch.
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

-- Every tracked show with the times the library pages sort by (spec 0020,
-- data model). It decides no page: which of Watchlist, Upcoming and Watched
-- a show is on is worked out per request in TypeScript from TMDB and the
-- user's episodes (`lib/tv/library-page.ts`), and nothing derived is stored.
--
-- `last_regular_watched_at` is the newest watched regular episode (specials
-- never move a card), `last_watched_at` the newest watched episode in any
-- season, specials included, the Watched order (AC-12). `last_activity_at`
-- is the later of the first and `tracked_at` (`greatest` ignores a null
-- `max`), the Watchlist order and the order the 500 show ceiling is taken in
-- (AC-9, AC-16). Grouping by the primary key lets the other show columns
-- through. The join reads `user_episode_state_show_order_idx`.
--
-- `security_invoker` is the security model, as for the views above: both
-- tables' forced row level security applies to the reader, so a reader sees
-- only their own rows (AC-20).
create or replace view public.user_tracked_shows
with (security_invoker = true)
as
  select
    s.user_id,
    s.show_id,
    s.tracked_at,
    s.hold_state,
    s.hold_changed_at,
    max(e.watched_at) filter (where e.season_number >= 1) as last_regular_watched_at,
    max(e.watched_at) as last_watched_at,
    greatest(
      max(e.watched_at) filter (where e.season_number >= 1),
      s.tracked_at
    ) as last_activity_at
  from public.user_show_state as s
  left join public.user_episode_state as e
    on e.user_id = s.user_id
    and e.show_id = s.show_id
    and e.watched_at is not null
  group by s.user_id, s.show_id;

-- As above: nobody keeps the default privileges, and `authenticated` gets
-- the read alone.
revoke all on table public.user_tracked_shows from anon, public, authenticated;
grant select on table public.user_tracked_shows to authenticated;
