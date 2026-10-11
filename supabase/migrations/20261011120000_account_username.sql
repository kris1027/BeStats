-- Account username (prompts/account-username.md): the `profiles` table, its
-- rules, owner only policies, and `username_available` for the sign up form.
--
-- Written by hand from `supabase/schemas/`, which stays the source of truth.
-- The grants are written out because the declarative diff does not track the
-- default privileges Supabase hands `anon` and `authenticated` on a new table
-- (see the caveat at the end of `04-policies.sql`). It only adds objects, so
-- the app deployed before it keeps working; push it before merging its PR
-- (docs/deploy.md).

-- One row per person who has chosen a username (prompts/account-username.md).
-- It is the only account field the auth account does not already hold, which
-- is what AGENTS.md section 8 asks before a profile table exists. Never public:
-- only its owner reads it, and no route shows one person's name to another.
--
-- The rules live on the table, not in the app, so a direct API write obeys
-- them too: the two checks hold the format and the reserved names (both kept
-- equal to `lib/auth/username.ts` by `lib/auth/username.test.ts`), the index below
-- holds uniqueness ignoring case, and `guard_username_change` in
-- `03-triggers.sql` owns `username_changed_at` and the weekly lock.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format_check
    check (username ~ '^[A-Za-z0-9_.-]{2,30}$' and username !~ '^[.-]|[.-]$'),
  constraint profiles_username_reserved_check
    check (lower(username) <> all (array[
      'admin', 'administrator', 'root', 'support', 'help', 'bestats',
      'system', 'moderator', 'staff', 'official', 'tmdb', 'api', 'account',
      'null', 'undefined'
    ]))
);

-- Stored as typed, unique as lowercased: `Kris` and `kris` are one name. Also
-- the index `username_available` reads.
create unique index profiles_username_lower_key
  on public.profiles (lower(username));

-- Owns `profiles.username_changed_at` and the weekly lock
-- (prompts/account-username.md). A username can change once per rolling 7
-- days; the first one, set at sign up or on `/account`, starts the clock.
-- Saving the identical name is not a change and keeps the clock where it was,
-- while a change of case is one. The client can never choose the timestamp,
-- and `user_id` never moves, whichever write path is used.
--
-- On an upsert that hits an existing row, the insert branch runs first on the
-- proposed row and the update branch then decides, as in `set_watchlisted_at`.
create or replace function public.guard_username_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.username_changed_at := now();
    return new;
  end if;

  new.user_id := old.user_id;

  if new.username = old.username then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;

  if old.username_changed_at > now() - interval '7 days' then
    raise exception 'username_locked' using errcode = 'P0001';
  end if;

  new.username_changed_at := now();
  return new;
end;
$$;

create trigger profiles_guard_username_change
  before insert or update on public.profiles
  for each row execute function public.guard_username_change();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon, public, authenticated;
-- No delete: deleting and re-inserting the row would restart the weekly lock.
grant select, insert, update on table public.profiles to authenticated;

-- profiles

create policy "Users select their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own profile"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on function public.guard_username_change() from public, anon, authenticated;

-- Whether a username is free, asked by the sign up form before the account
-- exists (prompts/account-username.md, Q16).
--
-- The one SECURITY DEFINER function, and the one `anon` can call, in `public`:
-- a signed out visitor cannot read `profiles`, and asking after the account is
-- created would leave it with no name when the name is taken.
-- `140-security-sweep` names this exact signature as its only exception. It
-- returns a boolean and nothing else, so all it can tell anyone is that a name
-- is in use, which the plan accepts. The unique index, not this answer, is
-- what guarantees uniqueness: two sign ups racing for one name both hear
-- true, and the second insert fails.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(p_username)
  );
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
