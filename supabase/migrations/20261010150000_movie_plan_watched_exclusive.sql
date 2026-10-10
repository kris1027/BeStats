-- Planned and watched are exclusive, and a movie score needs a watch mark
-- (prompts/movie-plan-watched-exclusive.md). Supersedes spec 0020 AC-14.
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- Existing rows are fixed first, keeping everything the user entered:
--
--   1. A score with no watch mark gets its watch mark back, dated the row's
--      last change (`updated_at`), the best date the row holds.
--   2. A movie both planned and watched keeps watched and loses the plan;
--      `watchlisted_at` stays, as its trigger keeps it on unplan.
--
-- Then the two checks, then the functions. `restore_movie_watched` gains an
-- argument, so it is dropped and created again; every changed or new function
-- gets its grants here, including the `anon` revoke the default privileges
-- would otherwise leave in place.
--
-- Not fully backward compatible: the app deployed before it still works for
-- every ordinary write, but planning a watched movie (a plain upsert there)
-- breaks the new check, and scoring an unwatched movie is refused, so both
-- show a failed save until the new app is live. Push it and merge its PR at
-- once (docs/deploy.md).

update public.user_movie_state
set watched_at = updated_at
where rating is not null
  and watched_at is null;

update public.user_movie_state
set in_watchlist = false
where in_watchlist
  and watched_at is not null;

alter table public.user_movie_state
  add constraint user_movie_state_plan_or_watched_check
    check (not (in_watchlist and watched_at is not null)),
  add constraint user_movie_state_rating_needs_watched_check
    check (rating is null or watched_at is not null);

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

drop function public.restore_movie_watched(integer, timestamptz);

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

revoke all on function public.rate_movie(integer, smallint) from public, anon, authenticated;
revoke all on function public.plan_movie(integer) from public, anon, authenticated;
revoke all on function public.unmark_movie_watched(integer) from public, anon, authenticated;
revoke all on function public.restore_movie_watched(integer, timestamptz, smallint) from public, anon, authenticated;
grant execute on function public.rate_movie(integer, smallint) to authenticated;
grant execute on function public.plan_movie(integer) to authenticated;
grant execute on function public.unmark_movie_watched(integer) to authenticated;
grant execute on function public.restore_movie_watched(integer, timestamptz, smallint) to authenticated;
