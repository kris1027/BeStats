-- Spec 0019: the watched history view (AC-1, AC-2, AC-4, AC-12).
--
-- Copied from `supabase/schemas/06-views.sql`, which stays the source of
-- truth, grants included: the declarative diff does not track grants that
-- come from default privileges, so `anon` would otherwise keep every command.

-- The private watched history, movies and finished shows in one list
-- (spec 0019, AC-1, AC-2, AC-4).
--
-- Watched movies and shows with status Completed, in one relation, so
-- `/watched` pages over a single ordered query with an exact count, as
-- `/watchlist` does. Status alone puts a show here: episode rows of a show in
-- any other status never do. It stores nothing, and no rating: a show's
-- calculated rating is derived per request in TypeScript (`AGENTS.md`
-- section 8), so `rating` is the movie's explicit score and null for a show.
--
-- `last_watched_at` is the movie's `watched_at`, or the show's newest watched
-- episode in any season, specials included, falling back to the time it
-- became Completed when none is watched (`coalesce` takes over from a null
-- `max`). `kind` sorts movies first on a tie.
--
-- `security_invoker` is the security model, as for the views above: every
-- table's forced row level security applies to the reader, so a reader sees
-- only their own rows.
create or replace view public.user_watched_entries
with (security_invoker = true)
as
  select
    m.user_id,
    'movie'::text as kind,
    m.movie_id as tmdb_id,
    m.watched_at as last_watched_at,
    m.rating
  from public.user_movie_state as m
  where m.watched_at is not null
  union all
  select
    s.user_id,
    'tv'::text as kind,
    s.show_id as tmdb_id,
    coalesce(max(e.watched_at), s.status_changed_at) as last_watched_at,
    null::smallint as rating
  from public.user_show_state as s
  left join public.user_episode_state as e
    on e.user_id = s.user_id
    and e.show_id = s.show_id
    and e.watched_at is not null
  where s.status = 'completed'
  group by s.user_id, s.show_id, s.status_changed_at;

-- As above: nobody keeps the default privileges, and `authenticated` gets
-- the read alone.
revoke all on table public.user_watched_entries from anon, public, authenticated;
grant select on table public.user_watched_entries to authenticated;
