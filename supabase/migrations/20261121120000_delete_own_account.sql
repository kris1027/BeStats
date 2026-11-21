-- Self serve account deletion (spec 0033, child 0036; AC-12).
--
-- Copied from `supabase/schemas/05-functions.sql`, which stays the source of
-- truth: the installed CLI's `db diff` no longer reads `schema_paths` (it
-- compares migrations with the database), so it cannot generate this file.
-- The grants are written out because the declarative diff never tracked them.
-- `tests/200-delete-own-account.test.sql` proves the function.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

alter function public.delete_own_account() owner to postgres;
revoke all on function public.delete_own_account() from public, anon, authenticated;
grant execute on function public.delete_own_account() to authenticated;
