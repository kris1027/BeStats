-- Spec 0001 AC-1: the migration creates every table, key, index, function
-- and trigger the data model calls for. Since the spec 0020 contract a show
-- is tracked or not, so no enum type is left (`160-show-tracking.test.sql`
-- pins their absence).
--
-- Runs against the seeded local database. Everything is wrapped in a
-- transaction that is rolled back, so the fixture is untouched.

begin;
select plan(16);

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

select * from finish();
rollback;
