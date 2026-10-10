-- Movie tracking writes whose outcome depends on the current row.
--
-- A movie is planned or watched, never both, and a score lives only on a
-- watched movie (prompts/movie-plan-watched-exclusive.md). The two checks on
-- `user_movie_state` enforce that; these functions are how the app moves
-- between the states, clearing the other fields in the same statement so two
-- tabs cannot race:
--
--   1. Marking watched clears the plan. Marking an already watched movie again
--      keeps its date, so a stale tab cannot move it.
--   2. A score is written only on a watched movie; otherwise `rate_movie`
--      raises `BS001`, which the Server Action reports as `not_watched`.
--   3. Planning a watched movie, or unmarking it, clears the watch mark and the
--      score, and returns what it cleared, so the app can offer an Undo
--      (`restore_movie_watched` below puts both back).
--
-- `lib/tracking/intent.ts` mirrors these rules for the optimistic UI, and
-- `supabase/tests/050-movie-tracking-functions.test.sql` pins them here.
--
-- Every function is SECURITY INVOKER with an empty `search_path`: it runs as
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
    set watched_at = coalesce(s.watched_at, now()),
        in_watchlist = false
  returning *;
$$;

-- Update only: a score never creates a row, because a row with a score must
-- already be watched.
create or replace function public.rate_movie(p_movie_id integer, p_rating smallint)
returns public.user_movie_state
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  result public.user_movie_state;
begin
  update public.user_movie_state
  set rating = p_rating
  where user_id = auth.uid()
    and movie_id = p_movie_id
    and watched_at is not null
  returning * into result;

  if not found then
    raise exception 'not_watched' using errcode = 'BS001';
  end if;

  return result;
end;
$$;

-- Plans a movie. A watched movie loses its watch mark and score; the old values
-- come back so the caller can offer an Undo, and are null when nothing was
-- cleared. The row lock makes the read and the write one step.
create or replace function public.plan_movie(p_movie_id integer)
returns table (cleared_watched_at timestamptz, cleared_rating smallint)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  old_watched_at timestamptz;
  old_rating smallint;
begin
  select s.watched_at, s.rating
  into old_watched_at, old_rating
  from public.user_movie_state s
  where s.user_id = auth.uid()
    and s.movie_id = p_movie_id
  for update;

  insert into public.user_movie_state as s (user_id, movie_id, in_watchlist)
  values (auth.uid(), p_movie_id, true)
  on conflict (user_id, movie_id) do update
    set in_watchlist = true,
        watched_at = null,
        rating = null;

  return query select old_watched_at, old_rating;
end;
$$;

-- Unmarks a movie, which also removes its score. Update only, so it never
-- creates a row; the old values come back for the Undo, both null when the
-- movie was not watched.
create or replace function public.unmark_movie_watched(p_movie_id integer)
returns table (cleared_watched_at timestamptz, cleared_rating smallint)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  old_watched_at timestamptz;
  old_rating smallint;
begin
  select s.watched_at, s.rating
  into old_watched_at, old_rating
  from public.user_movie_state s
  where s.user_id = auth.uid()
    and s.movie_id = p_movie_id
  for update;

  if old_watched_at is not null then
    update public.user_movie_state
    set watched_at = null,
        rating = null
    where user_id = auth.uid()
      and movie_id = p_movie_id;
  end if;

  return query select old_watched_at, old_rating;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges add `anon` and `authenticated` on top. The declarative
-- diff does not track either, so these lines must be carried into the
-- generated migration by hand (the same trap `04-policies.sql` documents for
-- tables). `authenticated` is revoked from too and granted back, so the one
-- live grant is the one written here.
revoke all on function public.mark_movie_watched(integer) from public, anon, authenticated;
revoke all on function public.rate_movie(integer, smallint) from public, anon, authenticated;
revoke all on function public.plan_movie(integer) from public, anon, authenticated;
revoke all on function public.unmark_movie_watched(integer) from public, anon, authenticated;
grant execute on function public.mark_movie_watched(integer) to authenticated;
grant execute on function public.rate_movie(integer, smallint) to authenticated;
grant execute on function public.plan_movie(integer) to authenticated;
grant execute on function public.unmark_movie_watched(integer) to authenticated;

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
    and watched_at is null
    and watchlisted_at is not null
    and updated_at > now() - interval '10 minutes';

  if not found then
    perform set_config('bestats.restore_watchlist', 'off', true);
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_watchlist', 'off', true);
end;
$$;

-- Marks a movie watched again at its original date, with the score it had,
-- which the page rendered or the clearing write returned and the client passes
-- back. The date is the one client supplied time the schema stores, so it is
-- bounded: never in the future, only for the caller's own row that is
-- currently unwatched and was changed in the last 10 minutes. The score is
-- bounded by the table's rating check. A watched movie cannot be planned, so
-- the plan goes off; `watchlisted_at` is kept by its trigger.
create or replace function public.restore_movie_watched(
  p_movie_id integer,
  p_watched_at timestamptz,
  p_rating smallint default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.user_movie_state
  set watched_at = p_watched_at,
      rating = p_rating,
      in_watchlist = false
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
revoke all on function public.restore_movie_watched(integer, timestamptz, smallint) from public, anon, authenticated;
grant execute on function public.restore_movie_watchlist(integer) to authenticated;
grant execute on function public.restore_movie_watched(integer, timestamptz, smallint) to authenticated;

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

-- Tracking a show (spec 0020, API surface).
--
-- A show is tracked while the caller has a `user_show_state` row for it, and
-- untracked otherwise (AC-1); there is no hold. None of these three touches
-- `user_episode_state`, so Stop tracking keeps every mark and rating. The
-- same shape as every function in this file: SECURITY INVOKER with an empty
-- `search_path`, so the four row level security policies apply inside, and
-- `user_id` always `auth.uid()`, never an argument. `tracked_at` is the
-- `set_tracked_at` trigger's. `supabase/tests/160-show-tracking.test.sql`
-- pins them.

-- Tracks a show (AC-2, AC-5, AC-6). Tracking a tracked show is a no op.
-- Returns whether this call created the row, the "added to your shows"
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
    insert into public.user_show_state as s (user_id, show_id)
    values (auth.uid(), p_show_id)
    on conflict (user_id, show_id) do nothing
    returning 1
  )
  select exists (select 1 from inserted);
$$;

-- The one place AC-5's rule lives: only a mark that newly watches a regular
-- episode tracks the show, so a special or a mark that changes nothing leaves
-- an untracked show untracked. The three episode functions below call it with
-- whether their own write was the first watch, which only they can tell.
-- Granted to `authenticated` because they run it as the caller; it adds no
-- capability `track_show` does not already give.
create or replace function public.track_show_after_watch(
  p_show_id integer,
  p_season_number smallint,
  p_newly_watched boolean
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select case
    when p_season_number >= 1 and p_newly_watched
    then public.track_show(p_show_id)
    else false
  end;
$$;

-- Stops tracking a show (AC-3, AC-4): the row goes, every episode mark and
-- rating stays. Idempotent: a show that is not tracked (stopped in another
-- tab) deletes nothing and returns no row, which the client reads as done
-- with no Undo. Otherwise returns the deleted row's `tracked_at`, which the
-- client keeps as the Undo.
create or replace function public.untrack_show(p_show_id integer)
returns table (tracked_at timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.user_show_state as s
  where s.user_id = auth.uid() and s.show_id = p_show_id
  returning s.tracked_at;
$$;

-- The Undo of Stop tracking (AC-3): puts the row back with the `tracked_at`
-- `untrack_show` reported, so the show returns to its old place. It stores a
-- client supplied time, so it is bounded: never null or in the future. A
-- supplied `tracked_at` can only move the caller's own sort order, which is
-- accepted. A row that is already back (tracked again since, or a second
-- Undo) raises `P0002`, which reaches the user as `undo_expired`, and so does
-- a time out of bounds.
create or replace function public.restore_show_tracking(
  p_show_id integer,
  p_tracked_at timestamptz
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
  if p_tracked_at is null or p_tracked_at > now() then
    raise exception 'undo_expired' using errcode = 'P0002';
  end if;

  perform set_config('bestats.restore_tracking', 'on', true);

  insert into public.user_show_state as s (user_id, show_id, tracked_at)
  values (auth.uid(), p_show_id, p_tracked_at)
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
revoke all on function public.track_show_after_watch(integer, smallint, boolean) from public, anon, authenticated;
revoke all on function public.untrack_show(integer) from public, anon, authenticated;
revoke all on function public.restore_show_tracking(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.track_show(integer) to authenticated;
grant execute on function public.track_show_after_watch(integer, smallint, boolean) to authenticated;
grant execute on function public.untrack_show(integer) to authenticated;
grant execute on function public.restore_show_tracking(integer, timestamptz) to authenticated;

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`. `prior` reads the row as it was before the
-- upsert (every part of one statement sees the same snapshot), which is how
-- it knows whether this call is the one that watched it. Only that first
-- watch of a regular episode tracks the show (spec 0020, AC-5);
-- `show_tracked` reports whether it newly did.
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
  show_tracked boolean,
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
    public.track_show_after_watch(
      p_show_id,
      p_season_number,
      not exists (select 1 from prior where prior.watched_at is not null)
    ),
    u.watched_at = now()
  from upserted as u;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6). That first watch can
-- track the show, exactly as `mark_episode_watched` does; rating an episode
-- already watched never does (spec 0013, AC-7; spec 0020, AC-5).
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
  show_tracked boolean
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
    public.track_show_after_watch(
      p_show_id,
      p_season_number,
      not exists (select 1 from prior where prior.watched_at is not null)
    )
  from upserted as u;
$$;

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;

-- Mark season watched (AC-9). The action passes every aired episode of the
-- season, ids and numbers as parallel arrays. One statement: it succeeds or
-- fails as a whole, and it returns the ids it newly marked, which is exactly
-- what the Undo clears (AC-10). No rating is touched. Newly marking any
-- regular episode tracks an untracked show (spec 0020, AC-5), reported as
-- `show_tracked`.
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
returns table (marked_ids integer[], show_tracked boolean)
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
    public.track_show_after_watch(
      p_show_id, p_season_number, cardinality(v_marked) > 0
    );
end;
$$;

-- Clears `watched_at` on the caller's watched episodes among the ids, and
-- reports each old date, which a plain PostgREST update cannot (it returns
-- only the new values). Unmark season uses the dates for its Undo (AC-11);
-- the Undo of mark season uses it with the newly marked ids (AC-10). It never
-- inserts and never touches `rating`. It locks the rows in `episode_id`
-- order, so two overlapping unmarks cannot deadlock.
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
