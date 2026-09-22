import { describe, expect, it } from "vitest";

import { isPrivatePath, PRIVATE_PATH_PREFIXES } from "./private-paths";

/**
 * covers: spec 0005, AC-10
 *
 * The prefix list decides which routes the proxy redirects a signed out visitor
 * away from. It is seeded with routes that do not exist yet, on purpose: a
 * guarded 404 is harmless, an unguarded private page is a leak, and features 9,
 * 14 and 15 should inherit the guard rather than each remember to register.
 *
 * The prefix-but-not-really case is the one that matters. `startsWith` alone
 * would treat `/watchlists-public` as private because `/watchlist` is, and the
 * opposite mistake (a nested path slipping through) is worse.
 */
describe("isPrivatePath (AC-10)", () => {
  it.each([...PRIVATE_PATH_PREFIXES])("guards %s itself", (prefix) => {
    expect(isPrivatePath(prefix)).toBe(true);
  });

  it.each([...PRIVATE_PATH_PREFIXES])(
    "guards everything under %s",
    (prefix) => {
      expect(isPrivatePath(`${prefix}/settings`)).toBe(true);
      expect(isPrivatePath(`${prefix}/a/b/c`)).toBe(true);
    },
  );

  it.each([
    ["/shows", "the public catalog"],
    ["/movies/550", "a public title page"],
    ["/sign-in", "the sign in screen"],
    ["/", "the root"],
  ])("leaves %s public (%s)", (path) => {
    expect(isPrivatePath(path)).toBe(false);
  });

  it("does not guard a path that merely starts with the same characters", () => {
    expect(isPrivatePath("/watchlists-public")).toBe(false);
    expect(isPrivatePath("/accounts")).toBe(false);
  });

  it("carries the routes features 9, 14 and 15 will add", () => {
    // If one of these is ever removed, the page it belongs to ships unguarded.
    expect(PRIVATE_PATH_PREFIXES).toEqual(
      expect.arrayContaining([
        "/account",
        "/watchlist",
        "/upcoming",
        "/watched",
      ]),
    );
  });
});
