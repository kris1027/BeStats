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

-- The shows on the Up Next page, most recently active first (spec 0014,
-- AC-3, AC-15).
--
-- Only shows with status Watching, so the page can never list a planned,
-- paused, dropped or finished show: the filter lives here, not in the page.
-- `last_activity_at` is the later of the newest watched regular episode
-- (specials never move a card) and the time the status last changed, so a
-- show just started with nothing watched still sorts by when it started.
-- `greatest` ignores a null `max`, which is that case. It stores nothing: the
-- join reads `user_episode_state_show_order_idx`.
--
-- `security_invoker` is the security model, as for the watchlist view: both
-- tables' forced row level security applies to the reader, so a reader sees
-- only their own rows.
create or replace view public.user_up_next_shows
with (security_invoker = true)
as
  select
    s.user_id,
    s.show_id,
    greatest(
      max(e.watched_at) filter (where e.season_number >= 1),
      s.status_changed_at
    ) as last_activity_at
  from public.user_show_state as s
  left join public.user_episode_state as e
    on e.user_id = s.user_id and e.show_id = s.show_id
  where s.status = 'watching'
  group by s.user_id, s.show_id, s.status_changed_at;

-- As above: nobody keeps the default privileges, and `authenticated` gets
-- the read alone.
revoke all on table public.user_up_next_shows from anon, public, authenticated;
grant select on table public.user_up_next_shows to authenticated;

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
