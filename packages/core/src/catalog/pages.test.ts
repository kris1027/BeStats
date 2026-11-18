import { describe, expect, it } from "vitest";

import { lastReachablePage, parsePageParam } from "./pages";

/** covers: spec 0006, AC-2 */
describe("parsePageParam", () => {
  it("treats a missing page as page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("accepts a whole number from 1 to 500", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("500")).toBe(500);
  });

  it.each(["0", "-2", "abc", "2.5", "501", "", " "])("refuses %j", (value) => {
    expect(parsePageParam(value)).toBeNull();
  });

  it("refuses a repeated parameter", () => {
    expect(parsePageParam(["1", "2"])).toBeNull();
  });
});

describe("lastReachablePage", () => {
  it("is TMDB's own count when it is under the cap", () => {
    expect(lastReachablePage(12)).toBe(12);
  });

  it("stops at 500, the last page TMDB serves", () => {
    expect(lastReachablePage(48213)).toBe(500);
  });
});
