import { describe, expect, it } from "vitest";

import { v1AccountDeleteBodySchema } from "./account";

/** covers: spec 0033, AC-12 (the typed confirm word, checked on the server). */
describe("v1AccountDeleteBodySchema", () => {
  it("accepts exactly DELETE", () => {
    expect(
      v1AccountDeleteBodySchema.safeParse({ confirm: "DELETE" }).success,
    ).toBe(true);
  });

  it.each(["delete", " DELETE", "DELETE ", "", "yes"])(
    "refuses %j",
    (confirm) => {
      expect(v1AccountDeleteBodySchema.safeParse({ confirm }).success).toBe(
        false,
      );
    },
  );

  it("refuses a body without the word, or one naming a user", () => {
    expect(v1AccountDeleteBodySchema.safeParse({}).success).toBe(false);
    expect(
      v1AccountDeleteBodySchema.safeParse({ userId: "someone-else" }).success,
    ).toBe(false);
  });
});
