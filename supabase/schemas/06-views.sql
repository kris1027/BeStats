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
-- `security_invoker` is the whole security model. The view runs with the
-- reader's rights, so both tables' forced row level security applies exactly
-- as it would to a direct read, and a reader sees only their own rows
-- (AC-20). Without it a view runs as its owner and would bypass RLS.
create or replace view public.user_tracked_shows
with (security_invoker = true)
as
  select
    s.user_id,
    s.show_id,
    s.tracked_at,
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

-- A view gets the same default privileges a table does, so `anon` would hold
-- every command on it. Revoked from everyone, then `authenticated` gets back
-- the read alone: nothing writes through the view.
revoke all on table public.user_tracked_shows from anon, public, authenticated;
grant select on table public.user_tracked_shows to authenticated;
