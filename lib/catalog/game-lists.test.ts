import { describe, expect, it } from "vitest";

import { gameListOptions, isPopularGameList, shiftUtcDay } from "./game-lists";

/** covers: spec 0028, AC-2 */
describe("gameListOptions", () => {
  it("windows Recently released over 60 inclusive days, across a year edge", () => {
    expect(gameListOptions("recently-released", "2027-01-15")).toEqual({
      sort: "hypes_desc",
      minHypes: 1,
      releasedFrom: "2026-11-17",
      releasedTo: "2027-01-15",
      pageSize: 24,
    });
  });

  it("windows Coming soon from tomorrow to 120 days out, across a month edge", () => {
    expect(gameListOptions("coming-soon", "2026-10-31")).toEqual({
      sort: "hypes_desc",
      minHypes: 1,
      releasedFrom: "2026-11-01",
      releasedTo: "2027-02-28",
      pageSize: 24,
    });
  });

  it("asks Top rated for at least 100 ratings and no window", () => {
    expect(gameListOptions("top-rated", "2026-10-25")).toEqual({
      sort: "rating_desc",
      minRatingCount: 100,
      pageSize: 24,
    });
  });
});

describe("shiftUtcDay", () => {
  it("steps through a leap day", () => {
    expect(shiftUtcDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftUtcDay("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("isPopularGameList", () => {
  it("is true only for the two popularity lists", () => {
    expect(isPopularGameList("trending")).toBe(true);
    expect(isPopularGameList("popular")).toBe(true);
    expect(isPopularGameList("top-rated")).toBe(false);
  });
});
