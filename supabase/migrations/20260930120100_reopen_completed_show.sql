-- Spec 0015: the reopen strand (AC-8, AC-9).
--
-- Written by hand from `supabase/schemas/03-triggers.sql`, which stays the
-- source of truth. A trigger function is never called through the API, so it
-- needs no grant; it runs with the rights of whoever wrote the episode row.

-- Reopens an automatic completion when a regular episode stops being watched
-- (spec 0015, AC-8): moves the writer's show from Completed with source
-- `system` to Watching with source `system`, in the same transaction as the
-- unmark. It covers every way a watched mark can go (a single untick, an
-- Undo, a season unmark, a direct API update or delete), because it lives on
-- the table rather than in each path.
--
-- It never touches a Completed the user chose, any other status, or anything
-- for a special (the `when` clauses on the two triggers keep season 0 out).
-- Security invoker: it runs as whoever made the episode write, so the forced
-- row level security of `user_show_state` applies and a user can only ever
-- reopen their own show. It reads `old.user_id` and `old.show_id`, never
-- `auth.uid()`, so a cascade from `auth.users` (run as the table owner, with
-- no session) matches no row or harmlessly updates one about to go. It
-- catches nothing: a real failure fails the unmark (AC-9). A season unmark of
-- many episodes reopens the show on its first row; the rest match nothing.
create or replace function public.reopen_completed_show()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.user_show_state as s
  set status = 'watching',
      status_source = 'system'
  where s.user_id = old.user_id
    and s.show_id = old.show_id
    and s.status = 'completed'
    and s.status_source = 'system';
  return null;
end;
$$;

-- Spec 0015 AC-8: an unwatched or deleted regular episode reopens an
-- automatic completion. A rating cleared alone (`watched_at` unchanged) fires
-- neither, and neither fires for a special.
create trigger user_episode_state_reopen_on_unwatch
  after update of watched_at on public.user_episode_state
  for each row
  when (old.watched_at is not null and new.watched_at is null and old.season_number >= 1)
  execute function public.reopen_completed_show();

create trigger user_episode_state_reopen_on_delete
  after delete on public.user_episode_state
  for each row
  when (old.watched_at is not null and old.season_number >= 1)
  execute function public.reopen_completed_show();
