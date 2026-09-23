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
