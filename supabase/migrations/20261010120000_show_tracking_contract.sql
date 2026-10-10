-- Spec 0020, the contract migration, amended 2026-10-10 to remove Pause and
-- Drop as well (Build plan step 8; Migration plan phase 3).
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- It drops everything the app deployed before spec 0020 read (the four legacy
-- columns, the `tv_status` and `status_source` enums, the old views, triggers
-- and functions, and the legacy mapping helpers), and the hold: the
-- `hold_state` and `hold_changed_at` columns, their check and index, the
-- `show_hold` enum and `set_show_hold`. Dropping `hold_state` is what clears
-- every existing hold: a paused or dropped show becomes an ordinary tracked
-- show and lands on the page its progress gives it (amended AC-19). No episode
-- mark, rating or movie row is touched.
--
-- Not backward compatible: the app deployed before this migration calls
-- functions it drops, so push it and merge its PR at once (Migration plan).
-- Functions whose return shape or arguments change are dropped and created
-- again, so they get their grants here, as the declarative diff does not
-- track them.

-- Views first: they read the columns dropped below.
drop view public.user_watchlist_entries;
drop view public.user_up_next_shows;
drop view public.user_watched_entries;
drop view public.user_tracked_shows;

drop trigger user_show_state_set_listed_at on public.user_show_state;
drop trigger user_show_state_set_status_changed_at on public.user_show_state;
drop trigger user_show_state_set_tracking_times on public.user_show_state;
drop trigger user_episode_state_reopen_on_unwatch on public.user_episode_state;
drop trigger user_episode_state_reopen_on_delete on public.user_episode_state;

drop function public.set_listed_at();
drop function public.set_status_changed_at();
drop function public.set_tracking_times();
drop function public.reopen_completed_show();
drop function public.start_watching_show(integer, boolean);
drop function public.set_show_status(integer, public.tv_status, public.tv_status);
drop function public.remove_show_status(integer, public.tv_status);
drop function public.restore_show_status(integer, public.tv_status, public.status_source, public.tv_status, timestamptz, timestamptz);
drop function public.complete_show_automatically(integer, integer[], boolean);
drop function public.reopen_show_automatically(integer, integer[]);
drop function public.set_show_hold(integer, public.show_hold, public.show_hold);
drop function public.untrack_show(integer, public.show_hold);
drop function public.restore_show_tracking(integer, timestamptz, public.show_hold, timestamptz);
drop function public.legacy_hold_for_status(public.tv_status);
drop function public.legacy_status_for_hold(public.show_hold);
-- `show_started` becomes `show_tracked`, and `rate_episode` loses
-- `newly_marked`, which nothing reads: a new return shape needs a new function.
drop function public.mark_episode_watched(integer, smallint, smallint, integer);
drop function public.rate_episode(integer, smallint, smallint, integer, smallint);
drop function public.mark_season_watched(integer, smallint, integer[], smallint[]);

-- Neither gets a successor: the Watchlist order is now an aggregate in
-- `user_tracked_shows`, which no index serves (see `02-tables.sql`).
drop index public.user_show_state_watchlist_idx;
drop index public.user_show_state_held_idx;

alter table public.user_show_state
  drop constraint user_show_state_listed_at_check,
  drop constraint user_show_state_hold_changed_at_check,
  drop column status,
  drop column status_source,
  drop column status_changed_at,
  drop column listed_at,
  drop column hold_state,
  drop column hold_changed_at;

drop type public.tv_status;
drop type public.status_source;
drop type public.show_hold;

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

-- Trigger functions are narrowed too, as `04-policies.sql` does for each.
revoke all on function public.set_tracked_at() from public, anon, authenticated;

create trigger user_show_state_set_tracked_at
  before insert or update on public.user_show_state
  for each row execute function public.set_tracked_at();

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

-- AC-5's rule in one place, for the three episode functions below.
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

revoke all on function public.track_show_after_watch(integer, smallint, boolean) from public, anon, authenticated;
revoke all on function public.untrack_show(integer) from public, anon, authenticated;
revoke all on function public.restore_show_tracking(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.track_show_after_watch(integer, smallint, boolean) to authenticated;
grant execute on function public.untrack_show(integer) to authenticated;
grant execute on function public.restore_show_tracking(integer, timestamptz) to authenticated;

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

revoke all on function public.mark_season_watched(integer, smallint, integer[], smallint[]) from public, anon, authenticated;
grant execute on function public.mark_season_watched(integer, smallint, integer[], smallint[]) to authenticated;

create or replace view public.user_tracked_shows
with (security_invoker = true)
as
  select
    s.user_id,
    s.show_id,
    s.tracked_at,
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

revoke all on table public.user_tracked_shows from anon, public, authenticated;
grant select on table public.user_tracked_shows to authenticated;
