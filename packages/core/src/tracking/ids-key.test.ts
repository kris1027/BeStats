import { describe, expect, it } from "vitest";

import { idsKey, parseIdsKey } from "./ids-key";

/**
 * covers: spec 0011, AC-18; spec 0020, AC-6; spec 0030, AC-1
 *
 * Every grid and season read shares one request scoped read only if every
 * card builds the same key, so the key's order and repeat rules are pinned.
 */
describe("idsKey", () => {
  it("gives one key for the same ids in any order, with repeats dropped", () => {
    expect(idsKey([62087, 62085, 62086, 62085])).toBe("62085,62086,62087");
    expect(idsKey([1396, 1399])).toBe(idsKey([1399, 1396]));
  });

  it("sorts by number, not as text, so 9 comes before 10", () => {
    expect(idsKey([100, 10, 9])).toBe("9,10,100");
  });

  it("is empty for no ids", () => {
    expect(idsKey([])).toBe("");
  });
});

describe("parseIdsKey", () => {
  it("reads back the ids the key was built from", () => {
    expect(parseIdsKey(idsKey([603, 550, 550]))).toEqual([550, 603]);
  });

  it("is no ids for the empty key", () => {
    expect(parseIdsKey("")).toEqual([]);
  });
});
