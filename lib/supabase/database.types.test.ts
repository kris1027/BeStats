import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { Constants } from "@/lib/supabase/database.types";

/**
 * Spec 0001 AC-14: the committed types match the live schema, with `tv_status`
 * and `status_source` as string union types rather than plain `string`.
 *
 * `pnpm db:types:check` proves the file is current against a running database.
 * This proves the shape the application depends on, with no database needed,
 * so it still runs in CI and in an offline build.
 *
 * The assertions come in two halves. `Assert<Equal<...>>` is the real guard:
 * exact type equality, so a regenerated file that widened an enum to `string`
 * or `any`, dropped a member or gained one fails `pnpm typecheck`. Plain
 * assignability would not catch any of those, because every literal here stays
 * assignable to a wider type. The `Constants` checks are the runtime half,
 * proving the values the application switches on are really there.
 */

/** Invariant type equality: assignable-both-ways is not the same as equal. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

type MovieRating =
  Database["public"]["Tables"]["user_movie_state"]["Row"]["rating"];
type EpisodeRating =
  Database["public"]["Tables"]["user_episode_state"]["Row"]["rating"];

describe("the generated database types", () => {
  it("exposes tv_status as exactly the five statuses, not a plain string", () => {
    const exact: Assert<
      Equal<
        Database["public"]["Enums"]["tv_status"],
        "want_to_watch" | "watching" | "on_hold" | "dropped" | "completed"
      >
    > = true;

    expect(exact).toBe(true);
    expect([...Constants.public.Enums.tv_status]).toEqual([
      "want_to_watch",
      "watching",
      "on_hold",
      "dropped",
      "completed",
    ]);
  });

  it("exposes status_source as exactly user and system", () => {
    const exact: Assert<
      Equal<Database["public"]["Enums"]["status_source"], "user" | "system">
    > = true;

    expect(exact).toBe(true);
    expect([...Constants.public.Enums.status_source]).toEqual([
      "user",
      "system",
    ]);
  });

  it("types rating as exactly number | null on every table that carries one", () => {
    const movieExact: Assert<Equal<MovieRating, number | null>> = true;
    const episodeExact: Assert<Equal<EpisodeRating, number | null>> = true;

    expect(movieExact).toBe(true);
    expect(episodeExact).toBe(true);

    const movieRating: MovieRating = null;
    const episodeRating: EpisodeRating = 10;

    expect(movieRating).toBeNull();
    expect(episodeRating).toBe(10);
  });
});
