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

-- One row per person per TMDB movie. Watchlist membership, watched state and
-- rating are independent columns: AGENTS.md section 7 requires unmarking
-- watched to leave the rating alone.
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
    check (not in_watchlist or watchlisted_at is not null)
);

-- The two private list reads (spec 0008), one per kind of row. Each is
-- partial, so it holds only the rows its read can use, and each ends in
-- `movie_id`, the tiebreak, so the order comes straight off the index. The
-- first holds only planned movies not yet watched, the ones Watchlist and
-- Upcoming classify (spec 0020, AC-13): a watched movie is on Watched whatever
-- its plan says.
create index user_movie_state_watchlist_idx
  on public.user_movie_state (user_id, watchlisted_at desc, movie_id)
  where in_watchlist and watched_at is null;

create index user_movie_state_watched_idx
  on public.user_movie_state (user_id, watched_at desc, movie_id)
  where watched_at is not null;

-- One row per person per TMDB show: the show is tracked while the row exists
-- (spec 0020, AC-1), with an optional hold. Which library page it sits on is
-- never stored; it is worked out per request from its episodes and TMDB.
--
-- The four legacy columns (`status`, `status_source`, `status_changed_at`,
-- `listed_at`) stay until the spec 0020 contract migration, so the app
-- deployed before it keeps working during the rollout. `status` is nullable
-- with a default for the same reason, and `track_show` and `set_show_hold`
-- mirror into it. Nothing in the new app reads them.
create table public.user_show_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  show_id integer not null,
  status public.tv_status default 'watching',
  -- The default fires on insert only. Every caller passes this explicitly on
  -- every write, because on the update branch of an upsert an omitted column
  -- keeps its old value instead of falling back to the default. See spec 0001,
  -- "The `status_source` default is insert only".
  status_source public.status_source not null default 'user',
  status_changed_at timestamptz not null default now(),
  -- When the show last joined the watchlist, by entering Want to Watch or
  -- Watching from anywhere else; the watchlist page's order (spec 0013,
  -- AC-14). Owned by `user_show_state_set_listed_at` in `03-triggers.sql`, so
  -- no client can choose it. Moving between those two keeps it, so starting a
  -- planned show does not move its card; leaving them keeps it too, so Undo
  -- of Stop watching puts the card back in its old place.
  listed_at timestamptz,
  -- When the show was tracked, the Watchlist order's fallback for a show with
  -- nothing watched (spec 0020, AC-9). Owned by
  -- `user_show_state_set_tracking_times` in `03-triggers.sql`, so no client
  -- chooses it; only `restore_show_tracking` puts back an earlier one.
  tracked_at timestamptz not null default now(),
  -- Null is no hold. Set only by `set_show_hold`, never by an episode write.
  hold_state public.show_hold,
  -- When the hold last changed, the Paused & dropped order (AC-10). Owned by
  -- the same trigger as `tracked_at`.
  hold_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_show_state_pkey primary key (user_id, show_id),
  constraint user_show_state_show_id_check check (show_id > 0),
  -- A show on the watchlist always has a time to sort by.
  constraint user_show_state_listed_at_check
    check (status not in ('want_to_watch', 'watching') or listed_at is not null),
  -- A hold always has a time, and no hold never has one.
  constraint user_show_state_hold_changed_at_check
    check ((hold_state is null) = (hold_changed_at is null))
);

-- The show half of the watchlist page (spec 0013, AC-13): only the rows the
-- page can show, ending in `show_id`, the tiebreak, as the movie index does.
create index user_show_state_watchlist_idx
  on public.user_show_state (user_id, listed_at desc, show_id)
  where status in ('want_to_watch', 'watching');

-- The Paused & dropped section (spec 0020, AC-10): held rows only, in the
-- section's order, ending in `show_id`, the tiebreak.
create index user_show_state_held_idx
  on public.user_show_state (user_id, hold_changed_at desc, show_id)
  where hold_state is not null;

-- One row per person per TMDB episode. Deliberately not tied to
-- `user_show_state` by a foreign key: AGENTS.md section 7 requires episode
-- history and ratings to survive any status change, including having no status
-- row at all, so an episode row can exist on its own.
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
