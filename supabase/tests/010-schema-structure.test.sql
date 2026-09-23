-- Spec 0001 AC-1: the migration creates every type, table, key, index,
-- function and trigger the data model calls for.
--
-- Runs against the seeded local database. Everything is wrapped in a
-- transaction that is rolled back, so the fixture is untouched.

begin;
select plan(20);

-- Enum types and their exact vocabularies (AC-8's storage side).
select has_type('public', 'tv_status', 'the tv_status enum exists');
select has_type('public', 'status_source', 'the status_source enum exists');
select enum_has_labels(
  'public', 'tv_status',
  array['want_to_watch', 'watching', 'on_hold', 'dropped', 'completed'],
  'tv_status carries exactly the five statuses'
);
select enum_has_labels(
  'public', 'status_source',
  array['user', 'system'],
  'status_source carries exactly user and system'
);

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
  'public'::name, 'set_status_changed_at'::name, '{}'::name[],
  'set_status_changed_at() exists'
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
  'five triggers exist: three for updated_at, one for status_changed_at and one for watchlisted_at'
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

-- The deliberate absence: no foreign key ties episodes to a show status row,
-- so episode history can outlive any status (AGENTS.md section 7).
select is(
  (
    select count(*)
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.user_episode_state'::regclass
      and confrelid = 'public.user_show_state'::regclass
  ),
  0::bigint,
  'episode rows are deliberately not tied to a show status row'
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
