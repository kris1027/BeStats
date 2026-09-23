import { describe, expect, it } from "vitest";

import { classifyTrackingError } from "./supabase-error";

/**
 * covers: spec 0007, AC-11, AC-12, AC-21
 *
 * The classifier is the one place a PostgREST error turns into something the
 * browser and the log may see, so it must read nothing but the code.
 */
describe("classifyTrackingError", () => {
  it.each(["PGRST301", "PGRST303"])(
    "asks the person to sign in again for the expired JWT code %s (AC-12)",
    (code) => {
      expect(classifyTrackingError({ code })).toEqual({
        error: "session_expired",
        outcome: "session_expired",
      });
    },
  );

  it("reports a refused Undo (P0002) as undo_expired (spec 0008, AC-6, AC-7)", () => {
    expect(classifyTrackingError({ code: "P0002" })).toEqual({
      error: "undo_expired",
      outcome: "undo_expired",
    });
  });

  it("shows a policy refusal as a failed save but logs it as forbidden", () => {
    expect(classifyTrackingError({ code: "42501" })).toEqual({
      error: "write_failed",
      outcome: "forbidden",
    });
  });

  it.each([
    ["a check violation", { code: "23514" }],
    ["a null code", { code: null }],
    ["no code at all", {}],
  ])("treats %s as an ordinary db_error (AC-11)", (_, error) => {
    expect(classifyTrackingError(error)).toEqual({
      error: "write_failed",
      outcome: "db_error",
    });
  });

  it("returns only the two classes, never the raw message (AC-21)", () => {
    const classified = classifyTrackingError({
      code: "23514",
      message: "user-a movie 550 rating 11",
    } as { code: string });
    expect(JSON.stringify(classified)).not.toMatch(/user-a|550|11/);
  });
});
