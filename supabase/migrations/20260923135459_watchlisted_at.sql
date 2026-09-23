SET local check_function_bodies = off;

ALTER TABLE "public"."user_movie_state"
  ADD COLUMN "watchlisted_at" timestamp WITH time zone;

-- Hand written backfill (spec 0008, Feature design). The diff engine emits no
-- data statements. It must run after the column exists and before the check
-- constraint below, which every planned row would otherwise fail, and before
-- the trigger, which would otherwise overwrite these values with now().
-- `updated_at` is the best time available for a row planned before this
-- column existed. The `updated_at` trigger is paused around it, so the
-- backfill does not restamp every planned row as changed just now.
ALTER TABLE "public"."user_movie_state"
  DISABLE TRIGGER "user_movie_state_set_updated_at";

UPDATE "public"."user_movie_state"
  SET "watchlisted_at" = "updated_at"
  WHERE "in_watchlist";

ALTER TABLE "public"."user_movie_state"
  ENABLE TRIGGER "user_movie_state_set_updated_at";

CREATE OR REPLACE FUNCTION public.set_watchlisted_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    new.watchlisted_at := case when new.in_watchlist then now() else null end;
  elsif new.in_watchlist and not old.in_watchlist then
    if current_setting('bestats.restore_watchlist', true) = 'on'
       and old.watchlisted_at is not null then
      new.watchlisted_at := old.watchlisted_at;
    else
      new.watchlisted_at := now();
    end if;
  else
    new.watchlisted_at := old.watchlisted_at;
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."user_movie_state"
  ADD CONSTRAINT "user_movie_state_watchlisted_at_check" CHECK (((NOT in_watchlist) OR (watchlisted_at IS NOT NULL)));

CREATE INDEX user_movie_state_watched_idx ON public.user_movie_state USING btree (user_id, watched_at DESC, movie_id)
  WHERE (watched_at IS NOT NULL);

CREATE INDEX user_movie_state_watchlist_idx ON public.user_movie_state USING btree (user_id, watchlisted_at DESC, movie_id)
  WHERE in_watchlist;

CREATE TRIGGER user_movie_state_set_watchlisted_at
  BEFORE INSERT OR UPDATE ON public.user_movie_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_watchlisted_at();

-- Hand corrected, as the first migration does for the other two trigger
-- functions: the generated line granted EXECUTE to PUBLIC, anon and
-- authenticated. A trigger function cannot be called directly, so this is
-- tidiness, but it keeps all three alike and matches `04-policies.sql`.
REVOKE ALL ON FUNCTION "public"."set_watchlisted_at"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_watchlisted_at"() TO "postgres", "service_role";
