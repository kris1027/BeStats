-- Private user tracking state: three tables, one per media shape.
--
-- Spec 0001 keeps movies, shows and episodes in separate tables so a TMDB movie
-- id and a TMDB TV id can never collide (AGENTS.md section 8, "Catalog
-- identity"). No TMDB catalog metadata is stored here and no season or show
-- rating column exists anywhere: both are derived at read time (AGENTS.md
-- section 9), so nothing stored can go stale or disagree with the rules.
--
-- Each table's primary key is `(user_id, <tmdb id>)`. That is what makes a
-- repeated write idempotent by construction rather than by convention, and it
-- also means every row level security predicate on `user_id` is served by an
-- index that already had to exist.

-- One row per person per TMDB movie. A movie is planned or watched, never both,
-- and a score lives only on a watched movie (AGENTS.md section 7,
-- prompts/movie-plan-watched-exclusive.md). The two checks below hold that
-- whatever a client sends; the functions in `05-functions.sql` clear the other
-- fields in the same statement.
create table public.user_movie_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id integer not null,
  in_watchlist boolean not null default false,
  -- Null means not watched. A timestamp doubles as the watched flag and the
  -- history entry, so no separate boolean can drift away from it.
  watched_at timestamptz,
  rating smallint,
  -- When the movie was last planned, which is the watchlist page's order
  -- (spec 0008). It is owned by `user_movie_state_set_watchlisted_at` in
  -- `03-triggers.sql`, so no client can choose it. It means something only
  -- while `in_watchlist` is true, and it is kept on unplan so Undo can put the
  -- movie back in its old place.
  watchlisted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_movie_state_pkey primary key (user_id, movie_id),
  constraint user_movie_state_movie_id_check check (movie_id > 0),
  constraint user_movie_state_rating_check check (rating between 1 and 10),
  -- A planned row always has a time to sort by.
  constraint user_movie_state_watchlisted_at_check
    check (not in_watchlist or watchlisted_at is not null),
  constraint user_movie_state_plan_or_watched_check
    check (not (in_watchlist and watched_at is not null)),
  constraint user_movie_state_rating_needs_watched_check
    check (rating is null or watched_at is not null)
);

-- The two private list reads (spec 0008), one per kind of row. Each is
-- partial, so it holds only the rows its read can use, and each ends in
-- `movie_id`, the tiebreak, so the order comes straight off the index. The
-- first holds only planned movies not yet watched, the ones Watchlist and
-- Upcoming classify (spec 0020, AC-13). Since a watched movie can no longer be
-- planned, its `watched_at is null` is redundant but harmless.
create index user_movie_state_watchlist_idx
  on public.user_movie_state (user_id, watchlisted_at desc, movie_id)
  where in_watchlist and watched_at is null;

create index user_movie_state_watched_idx
  on public.user_movie_state (user_id, watched_at desc, movie_id)
  where watched_at is not null;

-- One row per person per TMDB show: the show is tracked while the row exists
-- (spec 0020, AC-1), and untracked otherwise. There is no hold and no status:
-- which library page it sits on is never stored; it is worked out per request
-- from its episodes and TMDB.
create table public.user_show_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  show_id integer not null,
  -- When the show was tracked, the Watchlist order's fallback for a show with
  -- nothing watched (spec 0020, AC-9). Owned by
  -- `user_show_state_set_tracked_at` in `03-triggers.sql`, so no client
  -- chooses it; only `restore_show_tracking` puts back an earlier one.
  tracked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_show_state_pkey primary key (user_id, show_id),
  constraint user_show_state_show_id_check check (show_id > 0)
);

-- No index beyond the primary key, on purpose. The one list read,
-- `user_tracked_shows` (spec 0020, AC-16), orders by an aggregate over the
-- episode rows, which no index can serve. It reaches one person's rows through
-- this table's primary key and `user_episode_state_show_order_idx`, then sorts
-- at most 500 groups in memory.

-- One row per person per TMDB episode. Deliberately not tied to
-- `user_show_state` by a foreign key: AGENTS.md section 7 requires episode
-- history and ratings to survive Stop tracking, which deletes the show row,
-- so an episode row can exist on its own.
create table public.user_episode_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id integer not null,
  show_id integer not null,
  -- Zero is the TMDB specials season. It is storable here and excluded from
  -- progress and calculated ratings in TypeScript (AGENTS.md section 7).
  season_number smallint not null,
  episode_number smallint not null,
  watched_at timestamptz,
  rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_episode_state_pkey primary key (user_id, episode_id),
  constraint user_episode_state_episode_id_check check (episode_id > 0),
  constraint user_episode_state_show_id_check check (show_id > 0),
  constraint user_episode_state_season_number_check check (season_number >= 0),
  constraint user_episode_state_episode_number_check check (episode_number >= 1),
  constraint user_episode_state_rating_check check (rating between 1 and 10)
);

-- Serves the one read the primary key cannot: one person's episodes for one
-- show, already in display order.
create index user_episode_state_show_order_idx
  on public.user_episode_state (user_id, show_id, season_number, episode_number);
