SET local check_function_bodies = off;

CREATE TABLE "public"."user_episode_state" (
  "user_id"        uuid                     NOT NULL,
  "episode_id"     integer                  NOT NULL,
  "show_id"        integer                  NOT NULL,
  "season_number"  smallint                 NOT NULL,
  "episode_number" smallint                 NOT NULL,
  "watched_at"     timestamp with time zone,
  "rating"         smallint,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_episode_state_episode_id_check" CHECK ((episode_id > 0)),
  CONSTRAINT "user_episode_state_episode_number_check" CHECK ((episode_number >= 1)),
  CONSTRAINT "user_episode_state_pkey" PRIMARY KEY (user_id, episode_id),
  CONSTRAINT "user_episode_state_rating_check" CHECK (((rating >= 1) AND (rating <= 10))),
  CONSTRAINT "user_episode_state_season_number_check" CHECK ((season_number >= 0)),
  CONSTRAINT "user_episode_state_show_id_check" CHECK ((show_id > 0))
);

ALTER TABLE "public"."user_episode_state"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_episode_state"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_movie_state" (
  "user_id"      uuid                     NOT NULL,
  "movie_id"     integer                  NOT NULL,
  "in_watchlist" boolean                  NOT NULL DEFAULT false,
  "watched_at"   timestamp with time zone,
  "rating"       smallint,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_movie_state_movie_id_check" CHECK ((movie_id > 0)),
  CONSTRAINT "user_movie_state_pkey" PRIMARY KEY (user_id, movie_id),
  CONSTRAINT "user_movie_state_rating_check" CHECK (((rating >= 1) AND (rating <= 10)))
);

ALTER TABLE "public"."user_movie_state"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_movie_state"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_show_state" (
  "user_id"           uuid                     NOT NULL,
  "show_id"           integer                  NOT NULL,
  "status_changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_show_state_pkey" PRIMARY KEY (user_id, show_id),
  CONSTRAINT "user_show_state_show_id_check" CHECK ((show_id > 0))
);

ALTER TABLE "public"."user_show_state"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_show_state"
  FORCE ROW LEVEL SECURITY;

CREATE TYPE "public"."status_source" AS ENUM (
  'user',
  'system'
);

ALTER TABLE "public"."user_show_state"
  ADD COLUMN "status_source" public.status_source NOT NULL DEFAULT 'user'::public.status_source;

CREATE TYPE "public"."tv_status" AS ENUM (
  'want_to_watch',
  'watching',
  'on_hold',
  'dropped',
  'completed'
);

ALTER TABLE "public"."user_show_state"
  ADD COLUMN "status" public.tv_status NOT NULL;

CREATE OR REPLACE FUNCTION public.set_status_changed_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

ALTER TABLE "public"."user_episode_state"
  ADD CONSTRAINT "user_episode_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_movie_state"
  ADD CONSTRAINT "user_movie_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."user_show_state"
  ADD CONSTRAINT "user_show_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX user_episode_state_show_order_idx ON public.user_episode_state USING btree (user_id, show_id, season_number, episode_number);

CREATE TRIGGER user_episode_state_set_updated_at
  BEFORE UPDATE ON public.user_episode_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER user_movie_state_set_updated_at
  BEFORE UPDATE ON public.user_movie_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER user_show_state_set_status_changed_at
  BEFORE UPDATE ON public.user_show_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_status_changed_at();

CREATE TRIGGER user_show_state_set_updated_at
  BEFORE UPDATE ON public.user_show_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users delete their own episode state" ON "public"."user_episode_state"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users insert their own episode state" ON "public"."user_episode_state"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users select their own episode state" ON "public"."user_episode_state"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users update their own episode state" ON "public"."user_episode_state"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users delete their own movie state" ON "public"."user_movie_state"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users insert their own movie state" ON "public"."user_movie_state"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users select their own movie state" ON "public"."user_movie_state"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users update their own movie state" ON "public"."user_movie_state"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users delete their own show state" ON "public"."user_show_state"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users insert their own show state" ON "public"."user_show_state"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users select their own show state" ON "public"."user_show_state"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users update their own show state" ON "public"."user_show_state"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

-- Both are trigger functions, which Postgres refuses to call directly, so the
-- default EXECUTE to PUBLIC is not reachable as an entry point. Narrowed
-- anyway: nothing but the triggers themselves needs to run these.
REVOKE ALL ON FUNCTION "public"."set_status_changed_at"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_status_changed_at"() TO "postgres", "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres", "service_role";

-- Hand corrected after generation, and deliberately not what pg-delta emitted.
--
-- Two problems with the generated block, both verified against the live
-- database before this edit:
--
--   1. Supabase's default privileges on the `public` schema grant `anon` the
--      full set of commands the moment a table is created. The diff engine
--      does not track grants that come from default privileges, so the
--      `revoke` written in `supabase/schemas/04-policies.sql` produced no SQL
--      and `anon` ended up with SELECT, INSERT, UPDATE, DELETE and TRUNCATE on
--      all three tables, masked only by row level security. Spec 0001 AC-4
--      requires `anon` and `public` to hold no privilege at all, so the
--      refusal does not depend on RLS staying enabled.
--   2. The generated grant handed `authenticated` MAINTAIN, REFERENCES,
--      TRIGGER and TRUNCATE as well. TRUNCATE is the dangerous one: it empties
--      a table without going through row level security at all.
--
-- The revokes run before the grants so `authenticated` keeps what it needs.
-- `postgres` and `service_role` keep the generated grants: `postgres` owns the
-- schema, and `service_role` is Supabase's own escape hatch, which AGENTS.md
-- section 11 bans the application from ever using rather than removing here.

REVOKE ALL ON TABLE "public"."user_episode_state" FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."user_movie_state" FROM PUBLIC, "anon";
REVOKE ALL ON TABLE "public"."user_show_state" FROM PUBLIC, "anon";

REVOKE ALL ON TABLE "public"."user_episode_state" FROM "authenticated";
REVOKE ALL ON TABLE "public"."user_movie_state" FROM "authenticated";
REVOKE ALL ON TABLE "public"."user_show_state" FROM "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_episode_state" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_movie_state" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_show_state" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_episode_state" TO "postgres", "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_movie_state" TO "postgres", "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_show_state" TO "postgres", "service_role";

GRANT USAGE ON TYPE "public"."status_source" TO "postgres";

GRANT USAGE ON TYPE "public"."tv_status" TO "postgres";
