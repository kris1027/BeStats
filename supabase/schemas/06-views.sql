-- The private watchlist, movies and shows in one list (spec 0013, AC-13).
--
-- Planned movies and shows with status Want to Watch or Watching, in one
-- relation, so `/watchlist` pages over a single ordered query with an exact
-- count instead of merging two lists in TypeScript. It stores nothing: each
-- half reads its own table's partial watchlist index.
--
-- `security_invoker` is the whole security model. The view runs with the
-- reader's rights, so both tables' forced row level security applies exactly
-- as it would to a direct read, and a reader sees only their own rows
-- (AC-20). Without it a view runs as its owner and would bypass RLS.
--
-- `kind` is one of two literals, `movie` or `tv`, and sorts movies first on a
-- tie. `status` is the show's, and null for a movie; the card reads it to pick
-- its button (AC-16).
create or replace view public.user_watchlist_entries
with (security_invoker = true)
as
  select
    m.user_id,
    'movie'::text as kind,
    m.movie_id as tmdb_id,
    m.watchlisted_at as listed_at,
    null::public.tv_status as status
  from public.user_movie_state as m
  where m.in_watchlist
  union all
  select
    s.user_id,
    'tv'::text as kind,
    s.show_id as tmdb_id,
    s.listed_at,
    s.status
  from public.user_show_state as s
  where s.status in ('want_to_watch', 'watching');

-- A view gets the same default privileges a table does, so `anon` would hold
-- every command on it. Revoked from everyone, then `authenticated` gets back
-- the read alone: nothing writes through the view.
revoke all on table public.user_watchlist_entries from anon, public, authenticated;
grant select on table public.user_watchlist_entries to authenticated;
