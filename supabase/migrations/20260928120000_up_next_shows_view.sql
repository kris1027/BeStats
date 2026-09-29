-- Spec 0014: the Up Next view (AC-3, AC-15).
--
-- Copied from `supabase/schemas/06-views.sql`, which stays the source of
-- truth, grants included: the declarative diff does not track grants that
-- come from default privileges, so `anon` would otherwise keep every command.

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
