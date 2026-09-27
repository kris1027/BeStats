-- Spec 0013: the automatic Watching move (AC-6 to AC-8).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The three episode functions gain a `show_started` column,
-- and Postgres cannot change a function's return type in place, so each is
-- dropped and created again, with its grants, in this one migration. The app
-- and the generated types move with it (spec 0013, Consequences).

drop function public.mark_episode_watched(integer, smallint, smallint, integer);
drop function public.rate_episode(integer, smallint, smallint, integer, smallint);
drop function public.mark_season_watched(integer, smallint, integer[], smallint[]);

-- Starts a show on its own (spec 0013, AC-6): the one write to
-- `user_show_state` any episode function makes. It moves nothing or Want to
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

-- Marks one episode watched. Marking an already watched episode again changes
-- nothing, so a stale second tab cannot move the first watched date (AC-5).
-- It never touches `rating`. `prior` reads the row as it was before the
-- upsert (every part of one statement sees the same snapshot), which is how
-- `show_started` knows whether this call is the one that watched it.
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
  show_started boolean
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
    public.start_watching_show(
      p_show_id,
      p_season_number >= 1
        and not exists (select 1 from prior where prior.watched_at is not null)
    )
  from upserted as u;
$$;

revoke all on function public.mark_episode_watched(integer, smallint, smallint, integer) from public, anon, authenticated;
grant execute on function public.mark_episode_watched(integer, smallint, smallint, integer) to authenticated;

-- Rates one episode. Rating an unwatched episode also marks it watched, in the
-- same statement; a watched one keeps its date (AC-6). That first watch can
-- start the show, exactly as `mark_episode_watched` does; rating an episode
-- already watched never does (spec 0013, AC-7).
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
  show_started boolean
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
    public.start_watching_show(
      p_show_id,
      p_season_number >= 1
        and not exists (select 1 from prior where prior.watched_at is not null)
    )
  from upserted as u;
$$;

revoke all on function public.rate_episode(integer, smallint, smallint, integer, smallint) from public, anon, authenticated;
grant execute on function public.rate_episode(integer, smallint, smallint, integer, smallint) to authenticated;

-- Mark season watched (AC-9). The action passes every aired episode of the
-- season, ids and numbers as parallel arrays. One statement: it succeeds or
-- fails as a whole, and it returns the ids it newly marked, which is exactly
-- what the Undo clears (AC-10). No rating is touched. Newly marking any
-- regular episode can start the show (spec 0013, AC-6), reported as
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
    public.start_watching_show(
      p_show_id,
      p_season_number >= 1 and cardinality(v_marked) > 0
    );
end;
$$;

revoke all on function public.mark_season_watched(integer, smallint, integer[], smallint[]) from public, anon, authenticated;
grant execute on function public.mark_season_watched(integer, smallint, integer[], smallint[]) to authenticated;
