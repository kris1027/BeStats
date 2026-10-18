import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Spec 0001 AC-14: the committed types match the live schema. Since the spec
 * 0020 contract (amended 2026-10-10) a show is tracked or not, so
 * `user_show_state` carries no status or hold column, and the one enum left is
 * the games status of spec 0024.
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
type GameRow = Database["public"]["Tables"]["user_game_state"]["Row"];

describe("the generated database types", () => {
  it("has only the game status enum and no status or hold on a tracked show (spec 0020, AC-1)", () => {
    const onlyGameStatus: Assert<
      Equal<
        Database["public"]["Enums"],
        { game_status: "want_to_play" | "playing" | "finished" }
      >
    > = true;
    const showColumns: Assert<
      Equal<
        keyof Database["public"]["Tables"]["user_show_state"]["Row"],
        "user_id" | "show_id" | "tracked_at" | "created_at" | "updated_at"
      >
    > = true;

    expect(onlyGameStatus).toBe(true);
    expect(showColumns).toBe(true);
  });

  it("carries the game row exactly as spec 0024 sets it (AC-14)", () => {
    const gameRow: Assert<
      Equal<
        GameRow,
        {
          user_id: string;
          game_id: number;
          status: Database["public"]["Enums"]["game_status"];
          rating: number | null;
          added_at: string;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        }
      >
    > = true;

    expect(gameRow).toBe(true);
  });

  it("types rating as exactly number | null on every table that carries one", () => {
    const movieExact: Assert<Equal<MovieRating, number | null>> = true;
    const episodeExact: Assert<Equal<EpisodeRating, number | null>> = true;
    const gameExact: Assert<Equal<GameRow["rating"], number | null>> = true;

    expect(movieExact).toBe(true);
    expect(episodeExact).toBe(true);
    expect(gameExact).toBe(true);

    const movieRating: MovieRating = null;
    const episodeRating: EpisodeRating = 10;

    expect(movieRating).toBeNull();
    expect(episodeRating).toBe(10);
  });
});
