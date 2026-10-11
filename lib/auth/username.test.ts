import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
