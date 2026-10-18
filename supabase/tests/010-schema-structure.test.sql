-- Spec 0001 AC-1: the migration creates every table, key, index, function
-- and trigger the data model calls for. Since the spec 0020 contract a show
-- is tracked or not, so no show status enum is left (`160-show-tracking.test.sql`
-- pins their absence). The one enum is the games status of spec 0024, whose
-- table is pinned at the end (AC-1, AC-12).
--
-- Runs against the seeded local database. Everything is wrapped in a
-- transaction that is rolled back, so the fixture is untouched.

begin;
select plan(25);

-- The three tables and their composite primary keys. The key is what makes a
-- repeated write idempotent, so it is part of the contract, not an detail.
select has_table('public', 'user_movie_state', 'user_movie_state exists');
select has_table('public', 'user_show_state', 'user_show_state exists');
select has_table('public', 'user_episode_state', 'user_episode_state exists');
select has_pk('public', 'user_movie_state', 'user_movie_state has a primary key');
select has_pk('public', 'user_show_state', 'user_show_state has a primary key');
select has_pk('public', 'user_episode_state', 'user_episode_state has a primary key');

select col_is_pk(
  'public', 'user_movie_state', array['user_id', 'movie_id'],
  'user_movie_state is keyed on (user_id, movie_id)'
);
select col_is_pk(
  'public', 'user_show_state', array['user_id', 'show_id'],
  'user_show_state is keyed on (user_id, show_id)'
);
select col_is_pk(
  'public', 'user_episode_state', array['user_id', 'episode_id'],
  'user_episode_state is keyed on (user_id, episode_id)'
);

-- The one read the primary key cannot serve: a show's episodes in order.
select has_index(
  'public', 'user_episode_state', 'user_episode_state_show_order_idx',
  'the episode lookup index exists'
);

-- Trigger functions and their triggers (the mechanism AC-12 rests on).
select has_function(
  'public'::name, 'set_updated_at'::name, '{}'::name[],
  'set_updated_at() exists'
);
select has_function(
  'public'::name, 'set_tracked_at'::name, '{}'::name[],
  'set_tracked_at() exists'
);
select is(
  (
    select count(*)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
      and c.relname in ('user_movie_state', 'user_show_state', 'user_episode_state')
  ),
  5::bigint,
  'five triggers exist: three for updated_at, one each for watchlisted_at and tracked_at'
);

-- Owner deletion cascades, which is what AC-11 asserts behaviourally.
select is(
  (
    select count(*)
    from pg_constraint
    where contype = 'f'
      and confdeltype = 'c'
      and conrelid::regclass::text in
        ('user_movie_state', 'user_show_state', 'user_episode_state')
  ),
  3::bigint,
  'all three tables cascade on owner delete'
);

-- The deliberate absence: no foreign key ties episodes to a tracked show
-- row, so episode history outlives Stop tracking (AGENTS.md section 7).
select is(
  (
    select count(*)
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.user_episode_state'::regclass
      and confrelid = 'public.user_show_state'::regclass
  ),
  0::bigint,
  'episode rows are deliberately not tied to a tracked show row'
);

-- Nothing anywhere stores a derived rating (AGENTS.md section 8).
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('user_movie_state', 'user_show_state', 'user_episode_state')
      and (column_name like '%season_rating%' or column_name like '%show_rating%')
  ),
  0::bigint,
  'no season or show rating is stored in any column'
);

-- Spec 0024: the games table, its enum in order, its key and trigger owned
-- dates, its cascade, and no index beyond the primary key.
select has_table('public', 'user_game_state', 'user_game_state exists');
select columns_are(
  'public', 'user_game_state',
  array['user_id', 'game_id', 'status', 'rating', 'added_at', 'started_at',
        'finished_at', 'created_at', 'updated_at'],
  'user_game_state carries exactly the spec 0024 columns'
);
select col_is_pk(
  'public', 'user_game_state', array['user_id', 'game_id'],
  'user_game_state is keyed on (user_id, game_id)'
);
select enum_has_labels(
  'public', 'game_status', array['want_to_play', 'playing', 'finished'],
  'game_status holds want_to_play, playing and finished, in that order'
);
select col_type_is(
  'public', 'user_game_state', 'status', 'game_status',
  'status is a game_status'
);
select has_function(
  'public'::name, 'set_game_timestamps'::name, '{}'::name[],
  'set_game_timestamps() exists'
);
select is(
  (
    select array_agg(t.tgname::text order by t.tgname)
    from pg_trigger t
    where not t.tgisinternal and t.tgrelid = 'public.user_game_state'::regclass
  ),
  array['user_game_state_set_timestamps', 'user_game_state_set_updated_at'],
  'user_game_state has its timestamps trigger, then its updated_at trigger'
);
select is(
  (
    select count(*)
    from pg_constraint
    where contype = 'f' and confdeltype = 'c'
      and conrelid = 'public.user_game_state'::regclass
      and confrelid = 'auth.users'::regclass
  ),
  1::bigint,
  'user_game_state cascades on owner delete'
);
select is(
  (
    select array_agg(indexrelid::regclass::text)
    from pg_index
    where indrelid = 'public.user_game_state'::regclass
  ),
  array['user_game_state_pkey'],
  'user_game_state has no index beyond its primary key (spec 0024, AC-12)'
);

select * from finish();
rollback;
