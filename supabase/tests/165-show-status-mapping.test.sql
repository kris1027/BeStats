-- Spec 0020 AC-19: the mapping from the five statuses to tracked plus a hold,
-- and the mirror back into `status` that keeps a rollback working.
--
-- Both directions are helpers (`20261007130000_legacy_status_helpers.sql`):
-- `legacy_hold_for_status` is the expand migration's backfill mapping, which
-- already ran with the same `case` inline, and `legacy_status_for_hold` is
-- the mirror in `set_show_hold` and `restore_show_tracking`. The backfill's
-- column wiring is then run over seeded old rows, as the expand migration's
-- `update` states it, with the triggers off as they were there.
--
-- Shows 965001 to 965049 are free for user A in this file. Every row is
-- pinned as `postgres` with `session_replication_role = replica`.

begin;
select plan(20);

-- Shape

select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.legacy_hold_for_status(public.tv_status)'::regprocedure,
     'public.legacy_status_for_hold(public.show_hold)'::regprocedure
   )
     and not prosecdef
     and provolatile = 'i'
     and proconfig = array['search_path=""']),
  2,
  'both helpers are immutable, security invoker, with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.legacy_hold_for_status(public.tv_status)', 'execute')
  and not has_function_privilege('anon', 'public.legacy_status_for_hold(public.show_hold)', 'execute')
  and not has_function_privilege('authenticated', 'public.legacy_hold_for_status(public.tv_status)', 'execute'),
  'anon runs neither helper, and authenticated cannot run the backfill one'
);
select ok(
  has_function_privilege('authenticated', 'public.legacy_status_for_hold(public.show_hold)', 'execute'),
  'authenticated runs the mirror, which the tracking functions call as the caller'
);

-- Status to hold (the backfill)

select is(public.legacy_hold_for_status('want_to_watch'), null, 'Want to Watch is tracked with no hold');
select is(public.legacy_hold_for_status('watching'), null, 'Watching is tracked with no hold');
select is(public.legacy_hold_for_status('completed'), null, 'Completed is tracked with no hold');
select is(public.legacy_hold_for_status('on_hold'), 'paused'::public.show_hold, 'On Hold is paused');
select is(public.legacy_hold_for_status('dropped'), 'dropped'::public.show_hold, 'Dropped is dropped');

-- Hold to status (the mirror)

select is(public.legacy_status_for_hold(null), 'watching'::public.tv_status, 'no hold mirrors to Watching');
select is(public.legacy_status_for_hold('paused'), 'on_hold'::public.tv_status, 'paused mirrors to On Hold');
select is(public.legacy_status_for_hold('dropped'), 'dropped'::public.tv_status, 'dropped mirrors to Dropped');

-- The backfill over seeded old rows

set local session_replication_role = replica;
insert into public.user_show_state
  (user_id, show_id, status, status_source, listed_at, status_changed_at, tracked_at, hold_state, hold_changed_at)
values
  ('11111111-1111-1111-1111-111111111111', 965001, 'want_to_watch', 'user', '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z', '1999-01-01T00:00:00Z', null, null),
  ('11111111-1111-1111-1111-111111111111', 965002, 'watching', 'system', '2020-01-15T00:00:00Z', '2020-03-01T00:00:00Z', '1999-01-01T00:00:00Z', null, null),
  ('11111111-1111-1111-1111-111111111111', 965003, 'completed', 'system', null, '2020-04-01T00:00:00Z', '1999-01-01T00:00:00Z', null, null),
  ('11111111-1111-1111-1111-111111111111', 965004, 'on_hold', 'user', '2020-01-01T00:00:00Z', '2020-05-01T00:00:00Z', '1999-01-01T00:00:00Z', null, null),
  ('11111111-1111-1111-1111-111111111111', 965005, 'dropped', 'user', null, '2020-06-01T00:00:00Z', '1999-01-01T00:00:00Z', null, null);

update public.user_show_state
set tracked_at = coalesce(listed_at, status_changed_at),
    hold_state = public.legacy_hold_for_status(status),
    hold_changed_at = case
      when public.legacy_hold_for_status(status) is not null then status_changed_at
    end
where show_id between 965001 and 965005;
set local session_replication_role = origin;

select is(
  (select tracked_at from public.user_show_state where show_id = 965001),
  '2020-01-01T00:00:00Z'::timestamptz,
  'a listed row keeps its listed time as tracked_at'
);
select is(
  (select tracked_at from public.user_show_state where show_id = 965002),
  '2020-01-15T00:00:00Z'::timestamptz,
  'a listed row moved on since keeps its listed time, not its status time'
);
select is(
  (select tracked_at from public.user_show_state where show_id = 965003),
  '2020-04-01T00:00:00Z'::timestamptz,
  'a row never listed takes its status time as tracked_at'
);
select ok(
  (select hold_state is null and hold_changed_at is null
   from public.user_show_state where show_id = 965001),
  'Want to Watch has no hold and no hold time'
);
select ok(
  (select hold_state is null and hold_changed_at is null
   from public.user_show_state where show_id = 965003),
  'Completed has no hold and no hold time'
);
select ok(
  (select hold_state = 'paused' and hold_changed_at = '2020-05-01T00:00:00Z'::timestamptz
   from public.user_show_state where show_id = 965004),
  'On Hold is paused since its status time'
);
select ok(
  (select hold_state = 'dropped' and hold_changed_at = '2020-06-01T00:00:00Z'::timestamptz
   and tracked_at = '2020-06-01T00:00:00Z'::timestamptz
   from public.user_show_state where show_id = 965005),
  'Dropped is dropped since its status time, and tracked from it when never listed'
);
select is(
  (select array_agg(status order by show_id) from public.user_show_state
   where show_id between 965001 and 965005),
  array['want_to_watch', 'watching', 'completed', 'on_hold', 'dropped']::public.tv_status[],
  'the backfill leaves every legacy status as it was'
);
select ok(
  (select bool_and((hold_state is null) = (hold_changed_at is null))
   from public.user_show_state where show_id between 965001 and 965005),
  'every mapped row satisfies the hold check'
);

select * from finish();
rollback;
