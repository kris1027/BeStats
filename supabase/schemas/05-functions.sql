-- Movie tracking writes whose outcome depends on the current row.
--
-- Spec 0007 keeps two rules in Postgres rather than TypeScript, because both
-- read the row they change and would race between two tabs if the app read
-- first and wrote second:
--
--   1. The first transition into watched takes the movie off the watchlist.
--      Marking an already watched movie watched again changes nothing, so a
--      stale tab can neither move the original date nor clear a rewatch
--      bookmark set since.
--   2. Rating an unwatched movie counts as that first transition.
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
  insert into public.user_movie_state as s (user_id, movie_id, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, now(), false)
  on conflict (user_id, movie_id) do update
    set watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
  returning *;
$$;

create or replace function public.rate_movie(p_movie_id integer, p_rating smallint)
returns public.user_movie_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_movie_state as s (user_id, movie_id, rating, watched_at, in_watchlist)
  values (auth.uid(), p_movie_id, p_rating, now(), false)
  on conflict (user_id, movie_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now()),
        in_watchlist = case when s.watched_at is null then false else s.in_watchlist end
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

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`.
create or replace function public.mark_episode_watched(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer
)
returns public.user_episode_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_episode_state as s
    (user_id, episode_id, show_id, season_number, episode_number, watched_at)
  values
    (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now())
  on conflict (user_id, episode_id) do update
    set watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6).
create or replace function public.rate_episode(
  p_show_id integer,
  p_season_number smallint,
  p_episode_number smallint,
  p_episode_id integer,
  p_rating smallint
)
returns public.user_episode_state
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_episode_state as s
    (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
  values
    (auth.uid(), p_episode_id, p_show_id, p_season_number, p_episode_number, now(), p_rating)
  on conflict (user_id, episode_id) do update
    set rating = excluded.rating,
        watched_at = coalesce(s.watched_at, now())
  returning *;
$$;

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;

-- Mark season watched (AC-9). The action passes every aired episode of the
-- season, ids and numbers as parallel arrays. One statement: it succeeds or
-- fails as a whole, and it returns the ids it newly marked, which is exactly
-- what the Undo clears (AC-10). No rating is touched.
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
returns integer[]
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

  return v_marked;
end;
$$;

-- Clears `watched_at` on the caller's watched episodes among the ids, and
-- reports each old date, which a plain PostgREST update cannot (it returns
-- only the new values). Unmark season uses the dates for its Undo (AC-11);
-- the Undo of mark season uses it with the newly marked ids (AC-10). It never
-- inserts and never touches `rating`.
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
