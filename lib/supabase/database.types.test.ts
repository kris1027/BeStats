import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Spec 0001 AC-14: the committed types match the live schema. Since the spec
 * 0020 contract (amended 2026-10-10) a show is tracked or not, so the schema
 * carries no enum and `user_show_state` no status or hold column.
 *
 * `pnpm db:types:check` proves the file is current against a running database.
 * This proves the shape the application depends on, with no database needed,
 * so it still runs in CI and in an offline build.
 *
 * `Assert<Equal<...>>` is the real guard: exact type equality, so a
 * regenerated file that widened a column to `any`, or brought a status or a
 * hold back, fails `pnpm typecheck`. Plain assignability would not catch
 * those, because every literal here stays assignable to a wider type.
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
  it("has no enum and no status or hold on a tracked show (spec 0020, AC-1)", () => {
    const noEnums: Assert<
      Equal<Database["public"]["Enums"], { [_ in never]: never }>
    > = true;
    const showColumns: Assert<
      Equal<
        keyof Database["public"]["Tables"]["user_show_state"]["Row"],
        "user_id" | "show_id" | "tracked_at" | "created_at" | "updated_at"
      >
    > = true;

    expect(noEnums).toBe(true);
    expect(showColumns).toBe(true);
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
