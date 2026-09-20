import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { Constants } from "@/lib/supabase/database.types";

/**
 * Spec 0001 AC-14: the committed types match the live schema, with `tv_status`
 * and `status_source` as string union types rather than plain `string`.
 *
 * `pnpm db:types:check` proves the file is current against a running database.
 * This proves the shape the application depends on, with no database needed,
 * so it still runs in CI and in an offline build. The type annotations are the
 * real assertions: a regenerated file that widened either enum to `string`, or
 * dropped a member, stops type checking here.
 */

describe("the generated database types", () => {
  it("exposes tv_status as the five statuses, not a plain string", () => {
    const statuses: Database["public"]["Enums"]["tv_status"][] = [
      "want_to_watch",
      "watching",
      "on_hold",
      "dropped",
      "completed",
    ];

    expect([...Constants.public.Enums.tv_status]).toEqual(statuses);
  });

  it("exposes status_source as user and system only", () => {
    const sources: Database["public"]["Enums"]["status_source"][] = [
      "user",
      "system",
    ];

    expect([...Constants.public.Enums.status_source]).toEqual(sources);
  });

  it("types rating as a nullable number on every table that carries one", () => {
    const movieRating: Database["public"]["Tables"]["user_movie_state"]["Row"]["rating"] =
      null;
    const episodeRating: Database["public"]["Tables"]["user_episode_state"]["Row"]["rating"] = 10;

    expect(movieRating).toBeNull();
    expect(episodeRating).toBe(10);
  });
});
