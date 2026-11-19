import { describe, expect, it } from "vitest";

import {
  PROFILE_ERROR_TO_V1,
  v1ProfileBodySchema,
  v1ProfileWriteOkSchema,
} from "./profile";

/** covers: spec 0035, API surface (`/me/profile`) */
describe("profile contracts", () => {
  it("trims a username and refuses what the web forms refuse", () => {
    expect(v1ProfileBodySchema.parse({ username: " tester " })).toEqual({
      username: "tester",
    });
    for (const username of ["a", "admin", "Admin", "émile", "x".repeat(31)]) {
      expect(v1ProfileBodySchema.safeParse({ username }).success).toBe(false);
    }
  });

  it("parses both write outcomes", () => {
    expect(v1ProfileWriteOkSchema.parse({ ok: true, changed: false })).toEqual({
      ok: true,
      changed: false,
    });
  });

  it("answers a taken name and the weekly limit as conflict", () => {
    expect(PROFILE_ERROR_TO_V1.username_taken).toBe("conflict");
    expect(PROFILE_ERROR_TO_V1.username_locked).toBe("conflict");
    expect(PROFILE_ERROR_TO_V1.unexpected).toBe("internal");
  });
});
