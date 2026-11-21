-- Self serve account deletion (spec 0033, child 0036; AC-12).
--
-- Written by hand from `supabase/schemas/05-functions.sql`, which stays the
-- source of truth. The grants are written out because the declarative diff
-- does not track them. The function body is the one
-- `tests/200-delete-own-account-proof.test.sql` proved in step 3.
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
