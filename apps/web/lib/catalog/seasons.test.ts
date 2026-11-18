import { describe, expect, it } from "vitest";

import { adjacentSeasons, orderSeasons } from "./seasons";

const seasons = (...numbers: number[]) =>
  numbers.map((seasonNumber) => ({ seasonNumber }));

/** covers: spec 0009, AC-7 */
describe("orderSeasons", () => {
  it("puts regular seasons in ascending order and specials last", () => {
    expect(
      orderSeasons(seasons(0, 3, 1, 2)).map((s) => s.seasonNumber),
    ).toEqual([1, 2, 3, 0]);
  });

  it("does not sort the cached input in place", () => {
    const input = seasons(0, 2, 1);
    orderSeasons(input);
    expect(input.map((s) => s.seasonNumber)).toEqual([0, 2, 1]);
  });

  it("handles a show with only specials, or none at all", () => {
    expect(orderSeasons(seasons(0)).map((s) => s.seasonNumber)).toEqual([0]);
    expect(orderSeasons([])).toEqual([]);
  });
});

/** covers: spec 0009, AC-12 */
describe("adjacentSeasons", () => {
  const ordered = orderSeasons(seasons(0, 1, 2, 3));

  it("finds both neighbours in the middle", () => {
    expect(adjacentSeasons(ordered, 2)).toEqual({
      previous: { seasonNumber: 1 },
      next: { seasonNumber: 3 },
    });
  });

  it("has no previous at the first season", () => {
    expect(adjacentSeasons(ordered, 1).previous).toBeNull();
  });

  it("moves from the last regular season to specials, and stops there", () => {
    expect(adjacentSeasons(ordered, 3).next).toEqual({ seasonNumber: 0 });
    expect(adjacentSeasons(ordered, 0)).toEqual({
      previous: { seasonNumber: 3 },
      next: null,
    });
  });

  it("gives nothing for a season not in the list", () => {
    expect(adjacentSeasons(ordered, 9)).toEqual({ previous: null, next: null });
  });
});
