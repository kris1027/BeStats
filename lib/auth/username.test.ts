import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUTH_OUTCOME, authMessage } from "./messages";
import {
  isUsernameLocked,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameSchema,
  usernameUnlocksAt,
} from "./username";

/** covers: prompts/account-username.md, R1, R8 */
describe("usernameSchema", () => {
  it.each(["ab", "kris_01", "Kris.B-1", "a".repeat(30)])(
    "accepts %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    "a",
    "a".repeat(31),
    "has space",
    "tab\there",
    "émile",
    "kris@home",
    ".dot",
    "dot.",
    "-dash",
    "dash-",
    "ADMIN",
    "bestats",
  ])("refuses %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it("refuses a reserved name with the taken message", () => {
    expect(usernameSchema.safeParse("Admin").error?.issues[0]?.message).toBe(
      authMessage(AUTH_OUTCOME.usernameTaken),
    );
  });

  it("trims the edges before judging", () => {
    expect(usernameSchema.parse("  kris  ")).toBe("kris");
  });
});

describe("the weekly lock", () => {
  const changedAt = new Date("2026-10-11T12:00:00Z");

  it("unlocks exactly seven days later", () => {
    expect(usernameUnlocksAt(changedAt).toISOString()).toBe(
      "2026-10-18T12:00:00.000Z",
    );
  });

  it("holds until that moment and not after", () => {
    expect(isUsernameLocked(changedAt, new Date("2026-10-18T11:59:59Z"))).toBe(
      true,
    );
    expect(isUsernameLocked(changedAt, new Date("2026-10-18T12:00:00Z"))).toBe(
      false,
    );
  });
});

/**
 * The database enforces the same rules for every writer. Read the schema file
 * and fail if the two copies drift apart.
 */
describe("the SQL rules match", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/schemas/02-tables.sql"),
    "utf8",
  );

  it("has the same length bounds", () => {
    expect(sql).toContain(`{${USERNAME_MIN_LENGTH},${USERNAME_MAX_LENGTH}}$'`);
  });

  // The two format checks are compiled and run over the same names as Zod, so
  // a change to the character class or the edge rule on either side fails
  // here. These patterns use no syntax where POSIX and JavaScript differ.
  it("has the same character and edge rules", () => {
    const check = sql.match(
      /profiles_username_format_check\s*check \(username ~ '([^']+)' and username !~ '([^']+)'\)/,
    );
    expect(check).not.toBeNull();
    const [, allowed = "", refused = ""] = check ?? [];
    const sqlAccepts = (value: string) =>
      new RegExp(allowed).test(value) && !new RegExp(refused).test(value);

    for (const value of [
      "ab",
      "kris_01",
      "Kris.B-1",
      "a.b",
      "a-b",
      "_a_",
      "a".repeat(30),
      "a",
      "a".repeat(31),
      "has space",
      "émile",
      "kris@home",
      "a/b",
      ".dot",
      "dot.",
      "-dash",
      "dash-",
      "..",
    ]) {
      expect(usernameSchema.safeParse(value).success, value).toBe(
        sqlAccepts(value),
      );
    }
  });

  it("has the same reserved names", () => {
    const block = sql.match(
      /profiles_username_reserved_check[\s\S]*?array\[([\s\S]*?)\]/,
    );
    const names = [...(block?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect([...names].sort()).toEqual([...RESERVED_USERNAMES].sort());
  });
});
