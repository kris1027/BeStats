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
  constraint user_game_state_game_id_check check (game_id > 0),
  constraint user_game_state_rating_check check (rating between 1 and 10),
  -- A score only on a game being played or finished (AGENTS.md "Games").
  constraint user_game_state_rating_needs_status_check
    check (rating is null or status in ('playing', 'finished')),
  -- Each of those has the date its tab sorts by. No order between the two: a
  -- game set straight to Finished and replayed later starts after its finish.
  constraint user_game_state_playing_started_check
    check (status <> 'playing' or started_at is not null),
  constraint user_game_state_finished_at_check
    check (status <> 'finished' or finished_at is not null)
);

-- No index beyond the primary key, on purpose (spec 0024, AC-12).

-- Owns every date on `user_game_state` and pins its identity (spec 0024,
-- AC-4 to AC-7). An insert stamps `created_at` and `updated_at`; an update
-- keeps `user_id`, `game_id` and `created_at`, so a row never moves to another
-- person or game, whichever write path is used. `updated_at` on update is
-- `set_updated_at`'s.
--
-- The three list dates follow the status, whatever the client sent: added is
-- now on insert and on a move back to Want to play, started is the first time
-- the game becomes Playing, and finished is the latest time it becomes
-- Finished. Every other write keeps the stored value, so a score change or a
-- repeated save moves nothing.
--
-- The one exception is Undo. G4's restore function sets the transaction local
-- `bestats.restore_game` to `on`, and only then are the three list dates kept
-- as given, so a game returns exactly as it was. The identity pin and the
-- checks still apply. PostgREST gives a client no way to set a custom
-- setting, and no other write path may set it.
--
-- On an upsert that hits an existing row, the insert branch runs first on the
-- proposed row and the update branch then decides, as in `set_watchlisted_at`.
create or replace function public.set_game_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.user_id := old.user_id;
    new.game_id := old.game_id;
    new.created_at := old.created_at;
  end if;

  if coalesce(current_setting('bestats.restore_game', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.added_at := now();
    new.started_at := case when new.status = 'playing' then now() end;
    new.finished_at := case when new.status = 'finished' then now() end;
    return new;
  end if;

  new.added_at := old.added_at;
  new.started_at := old.started_at;
  new.finished_at := old.finished_at;

  if new.status is distinct from old.status then
    case new.status
      when 'want_to_play' then
        new.added_at := now();
      when 'playing' then
        new.started_at := coalesce(old.started_at, now());
      when 'finished' then
        new.finished_at := now();
    end case;
  end if;

  return new;
end;
$$;

-- `set_timestamps` sorts before `set_updated_at`, so on update the dates are
-- settled first and `updated_at` is stamped last.
create trigger user_game_state_set_timestamps
  before insert or update on public.user_game_state
  for each row execute function public.set_game_timestamps();

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

revoke all on function public.set_game_timestamps() from public, anon, authenticated;
