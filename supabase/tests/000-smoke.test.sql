-- Proves the pgTAP pipe works: the extension is reachable and `supabase test db`
-- can run a file. It asserts nothing about a schema on purpose, because no table
-- exists yet; feature 3 (spec 0001) adds the real row level security policy tests
-- beside this one.
begin;
select plan(1);
select ok(true, 'pgtap runs and supabase test db reaches the database');
select * from finish();
rollback;
