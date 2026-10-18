-- Game data model (spec 0024): the `game_status` enum, the private
-- `user_game_state` table, its trigger owned dates, and owner only policies.
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- The grants are written out because the declarative diff does not track the
-- default privileges Supabase hands `anon` and `authenticated` on a new table
-- (see the caveat at the end of `04-policies.sql`). It only adds objects, so
-- the app deployed before it keeps working; push it before merging its PR
-- (docs/deploy.md).

-- A game's place in a person's list (spec 0024, AGENTS.md "Games"). Set by
-- hand, any status to any other in one click; nothing is derived from
-- progress, so there is no Dropped, Paused or computed status.
create type public.game_status as enum ('want_to_play', 'playing', 'finished');

-- One row per person per IGDB game (spec 0024): the game is in the list while
-- the row exists, and removing it deletes the row. A game id lives only here,
-- so an IGDB id can never collide with a TMDB id (AGENTS.md section 8,
-- "Catalog identity"), and no IGDB metadata is stored, the same rule as TMDB.
--
-- The checks hold the games rules whatever a client sends: a score only on
-- Playing or Finished, and the date each of those needs. Nothing clears a
-- score silently, so the write that moves a game back to Want to play nulls it
-- in the same statement. The five dates belong to `set_game_timestamps` in
-- `03-triggers.sql`, so no client can choose them.
create table public.user_game_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id integer not null,
  status public.game_status not null,
  rating smallint,
  -- When the game last became Want to play (or was added), the Want to play
  -- order. Started is the first time it became Playing, finished the latest
  -- time it became Finished, each its own tab's order.
  added_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_game_state_pkey primary key (user_id, game_id),
  constraint user_game_state_game_id_check check (game_id > 0)
);

-- No index beyond the primary key, on purpose (spec 0024, AC-12).

create trigger user_game_state_set_updated_at
  before update on public.user_game_state
  for each row execute function public.set_updated_at();

alter table public.user_game_state enable row level security;
alter table public.user_game_state force row level security;

revoke all on table public.user_game_state from anon, public, authenticated;
grant select, insert, update, delete on table public.user_game_state to authenticated;

-- user_game_state

create policy "Users select their own game state"
  on public.user_game_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own game state"
  on public.user_game_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own game state"
  on public.user_game_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own game state"
  on public.user_game_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);
