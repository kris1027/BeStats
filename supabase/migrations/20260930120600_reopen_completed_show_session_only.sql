-- Spec 0015: an account deletion must not run the reopen trigger (AC-9).
--
-- Written by hand from `supabase/schemas/03-triggers.sql`, which stays the
-- source of truth. Replaces the function body only; the triggers and their
-- `when` clauses are unchanged.
--
-- GoTrue deletes from `auth.users` as `supabase_auth_admin`, with no session.
-- The cascade deletes the user's watched episode rows, the delete trigger
-- fires, and it runs as the role that issued the delete, not as the table
-- owner as 20260930120100 assumed. That role has no UPDATE on
-- `user_show_state`, so deleting any account with a watched regular episode
-- failed with "permission denied". Granting it UPDATE, or making the function
-- `security definer`, would widen who can write the table (and the owner is
-- itself bound by forced RLS, so a definer reopen would match nothing for a
-- real user). Instead the function returns before it writes unless the
-- episode row belongs to the session's own user: every app write has that
-- session, and nothing else needs the reopen. A write with no session (the
-- cascade, or a service role script) leaves the show to the next visit's
-- check, which reopens it the same way (AC-10).
create or replace function public.reopen_completed_show()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is distinct from old.user_id then
    return null;
  end if;

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
