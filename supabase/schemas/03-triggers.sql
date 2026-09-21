-- Timestamp maintenance triggers.
--
-- Both functions are SECURITY INVOKER: they run as whoever fired them and need
-- no elevated privilege, so they cannot become a way around row level security
-- (the `supabase` skill's security checklist). `search_path` is pinned to empty
-- so the body cannot be captured by a shadowing schema on the caller's path.

-- Keeps `updated_at` honest without any write path having to remember it. Spec
-- 0001 makes this a trigger precisely so `updated_at` is never a value the
-- client can supply.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Advances `status_changed_at` only when the status genuinely differs, so an
-- edit to some other column does not look like a status change. `is distinct
-- from` rather than `<>` because either side could be null in principle.
create or replace function public.set_status_changed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger user_movie_state_set_updated_at
  before update on public.user_movie_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_updated_at
  before update on public.user_show_state
  for each row execute function public.set_updated_at();

create trigger user_episode_state_set_updated_at
  before update on public.user_episode_state
  for each row execute function public.set_updated_at();

create trigger user_show_state_set_status_changed_at
  before update on public.user_show_state
  for each row execute function public.set_status_changed_at();
