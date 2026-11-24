import { describe, expect, it } from "vitest";

import { filterByName, isPickerFull } from "./picker";

/** covers: spec 0029, AC-10 */

const PLATFORMS = [
  { id: 130, name: "Nintendo Switch" },
  { id: 48, name: "PlayStation 4" },
  { id: 6, name: "PC (Microsoft Windows)" },
];

describe("filterByName", () => {
  it("keeps every row when the filter is blank", () => {
    expect(filterByName(PLATFORMS, "  ")).toEqual(PLATFORMS);
  });

  it("matches anywhere in the name, ignoring case and outer spaces", () => {
    expect(filterByName(PLATFORMS, " switch ")).toEqual([PLATFORMS[0]]);
    expect(filterByName(PLATFORMS, "WINDOWS")).toEqual([PLATFORMS[2]]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterByName(PLATFORMS, "xbox")).toEqual([]);
  });
});

describe("isPickerFull", () => {
  it("is full once the cap is reached", () => {
    expect(isPickerFull([1, 2], 2)).toBe(true);
    expect(isPickerFull([1], 2)).toBe(false);
  });

  it("is never full without a cap", () => {
    expect(isPickerFull([1, 2, 3], null)).toBe(false);
    expect(isPickerFull([1, 2, 3], undefined)).toBe(false);
  });
});
