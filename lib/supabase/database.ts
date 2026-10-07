import type { Database as GeneratedDatabase } from "@/lib/supabase/database.types";

type PublicSchema = GeneratedDatabase["public"];
type Functions = PublicSchema["Functions"];
type ShowHold = PublicSchema["Enums"]["show_hold"];

type SetShowHold = Functions["set_show_hold"];
type UntrackShow = Functions["untrack_show"];
type UntrackShowRow = UntrackShow["Returns"][number];

/**
 * The hold functions as they really behave (spec 0020, AC-2 to AC-4): null
 * means "no hold", for the hold sent, the hold expected and the hold
 * returned.
 *
 * `supabase gen types` writes every function argument and every returned
 * enum as non null, because Postgres records no nullability for either. The
 * stale hold guard is carried by exactly these arguments, so they are
 * corrected here rather than cast at the call site, where a cast would hide
 * any later change to the generated signature. `database.test.ts` fails
 * typecheck if the generated arguments gain, lose or rename one.
 */
type HoldFunctions = {
  set_show_hold: {
    Args: Omit<SetShowHold["Args"], "p_hold" | "p_expected"> & {
      p_hold: ShowHold | null;
      p_expected: ShowHold | null;
    };
    Returns: ShowHold | null;
  };
  untrack_show: {
    Args: Omit<UntrackShow["Args"], "p_expected"> & {
      p_expected: ShowHold | null;
    };
    Returns: (Omit<UntrackShowRow, "hold_state" | "hold_changed_at"> & {
      hold_state: ShowHold | null;
      hold_changed_at: string | null;
    })[];
  };
};

/**
 * The generated `Database` with the corrections above, the type both
 * Supabase clients are created with. Everything else is the generated file
 * unchanged, so `pnpm db:types` stays the only source of the schema.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: Omit<Functions, keyof HoldFunctions> & HoldFunctions;
  };
};
