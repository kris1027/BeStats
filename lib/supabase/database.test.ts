import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database";
import type { Database as GeneratedDatabase } from "@/lib/supabase/database.types";

/**
 * covers: spec 0020, AC-2 to AC-4
 *
 * The hold functions take and return null for "no hold", which the generated
 * types cannot say. These assertions are the guard and run in `pnpm
 * typecheck`: the corrected arguments are exactly nullable holds, and they
 * keep the generated argument names, so a regenerated signature that gains,
 * loses or renames an argument fails here instead of being masked.
 */

/** Invariant type equality, as in `database.types.test.ts`. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

type Functions = Database["public"]["Functions"];
type Generated = GeneratedDatabase["public"]["Functions"];
type Hold = Database["public"]["Enums"]["show_hold"] | null;

describe("the corrected hold function types", () => {
  it("accept and return null for no hold", () => {
    const checks: [
      Assert<Equal<Functions["set_show_hold"]["Args"]["p_hold"], Hold>>,
      Assert<Equal<Functions["set_show_hold"]["Args"]["p_expected"], Hold>>,
      Assert<Equal<Functions["set_show_hold"]["Returns"], Hold>>,
      Assert<Equal<Functions["untrack_show"]["Args"]["p_expected"], Hold>>,
      Assert<
        Equal<Functions["untrack_show"]["Returns"][number]["hold_state"], Hold>
      >,
    ] = [true, true, true, true, true];
    expect(checks).toEqual([true, true, true, true, true]);
  });

  it("keep exactly the generated argument and column names", () => {
    const checks: [
      Assert<
        Equal<
          keyof Functions["set_show_hold"]["Args"],
          keyof Generated["set_show_hold"]["Args"]
        >
      >,
      Assert<
        Equal<
          keyof Functions["untrack_show"]["Args"],
          keyof Generated["untrack_show"]["Args"]
        >
      >,
      Assert<
        Equal<
          keyof Functions["untrack_show"]["Returns"][number],
          keyof Generated["untrack_show"]["Returns"][number]
        >
      >,
    ] = [true, true, true];
    expect(checks).toEqual([true, true, true]);
  });
});
