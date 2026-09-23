import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  emailSchema,
  existingPasswordSchema,
  MINIMUM_PASSWORD_LENGTH,
  newPasswordSchema,
  signInSchema,
} from "./schemas";

/**
 * covers: spec 0005, AC-9
 *
 * The password rule lives in two places by necessity: here, where it saves a
 * round trip, and in `supabase/config.toml`, where it is actually enforced. Two
 * copies of a number is two chances to change one and not the other, and the
 * failure is silent in the dangerous direction: lowering the Supabase setting
 * while this stays at eight means a weaker password than the app claims to
 * accept gets through anything that does not post to our own form.
 *
 * So the invariant is asserted against the config file itself rather than
 * restated in a comment.
 */
describe("password rules (AC-9)", () => {
  it("rejects a password shorter than the minimum", () => {
    const result = newPasswordSchema.safeParse(
      "a".repeat(MINIMUM_PASSWORD_LENGTH - 1),
    );
    expect(result.success).toBe(false);
  });

  it("accepts one at exactly the minimum", () => {
    expect(
      newPasswordSchema.safeParse("a".repeat(MINIMUM_PASSWORD_LENGTH)).success,
    ).toBe(true);
  });

  it("names the rule in the message rather than saying 'invalid'", () => {
    const result = newPasswordSchema.safeParse("short");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        String(MINIMUM_PASSWORD_LENGTH),
      );
    }
  });

  it("stays equal to minimum_password_length in supabase/config.toml", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const match = config.match(/^minimum_password_length = (\d+)$/m);

    expect(
      match,
      "minimum_password_length not found in config.toml",
    ).not.toBeNull();
    expect(Number(match?.[1])).toBe(MINIMUM_PASSWORD_LENGTH);
  });

  it("does not apply the new password rules to a sign in", () => {
    // Applying them would tell someone whose existing password is seven
    // characters long that their own password is invalid, and would leak the
    // rule to anyone probing the form.
    expect(existingPasswordSchema.safeParse("short").success).toBe(true);
    expect(existingPasswordSchema.safeParse("").success).toBe(false);
  });
});

/**
 * covers: spec 0005, value sourcing
 *
 * The address is normalised before it is used, so the same person typing their
 * address with different capitalisation or a stray space signs in to one
 * account rather than failing to find it, and the address echoed on
 * `/check-email` matches the one the message went to.
 */
describe("emailSchema", () => {
  it("trims and lowercases before validating", () => {
    const result = emailSchema.safeParse("  Kris@Example.COM ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("kris@example.com");
  });

  it.each(["", "not-an-email", "kris@", "@example.com", "kris example.com"])(
    "rejects %s",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("form schemas", () => {
  it("treats next as optional on sign in", () => {
    const result = signInSchema.safeParse({
      email: "kris@example.com",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("requires both passwords on a change", () => {
    expect(
      changePasswordSchema.safeParse({ password: "longenough" }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        password: "longenough",
      }).success,
    ).toBe(true);
  });
});
