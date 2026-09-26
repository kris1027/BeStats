import { describe, expect, it } from "vitest";

import { formatCalculatedRating } from "@/lib/format";

import { ratingsBySeason, seasonRating, showRating } from "./ratings";

/** covers: spec 0012, AC-1, AC-2, AC-3, AC-17 */

/** `count` episodes all rated `rating` in one season. */
function rows(seasonNumber: number, rating: number, count: number) {
  return Array.from({ length: count }, () => ({ seasonNumber, rating }));
}

describe("seasonRating (AC-1)", () => {
  it("is the mean of the rated episodes", () => {
    expect(seasonRating([8, 7, 9])).toEqual({ mean: 8, ratedEpisodes: 3 });
  });

  it("keeps full precision", () => {
    expect(seasonRating([7, 7, 8])?.mean).toBe(22 / 3);
  });

  it("rests on a single rated episode", () => {
    expect(seasonRating([6])).toEqual({ mean: 6, ratedEpisodes: 1 });
  });

  it("is null with no ratings, never zero", () => {
    expect(seasonRating([])).toBeNull();
  });
});

describe("ratingsBySeason", () => {
  it("groups by season and leaves unrated seasons out", () => {
    const seasons = ratingsBySeason([
      { seasonNumber: 1, rating: 8 },
      { seasonNumber: 2, rating: 6 },
      { seasonNumber: 1, rating: 6 },
    ]);
    expect([...seasons.keys()].sort()).toEqual([1, 2]);
    expect(seasons.get(1)).toEqual({ mean: 7, ratedEpisodes: 2 });
    expect(seasons.has(3)).toBe(false);
  });

  it("is empty when nothing is rated", () => {
    expect(ratingsBySeason([]).size).toBe(0);
  });

  it("keeps each season's count, so the card and basis rest on the right number", () => {
    const seasons = ratingsBySeason([...rows(0, 9, 1), ...rows(3, 5, 4)]);
    expect(seasons.get(0)).toEqual({ mean: 9, ratedEpisodes: 1 });
    expect(seasons.get(3)).toEqual({ mean: 5, ratedEpisodes: 4 });
  });
});

describe("showRating (AC-2)", () => {
  it("weighs every season equally: the AGENTS.md example gives 7", () => {
    const result = showRating(
      ratingsBySeason([...rows(1, 8, 10), ...rows(2, 6, 2)]),
    );
    expect(result).toEqual({ mean: 7, ratedSeasons: 2, specialsRated: false });
  });

  it("is unchanged by unequal season lengths", () => {
    const short = showRating(
      ratingsBySeason([...rows(1, 8, 1), ...rows(2, 6, 1)]),
    );
    const long = showRating(
      ratingsBySeason([...rows(1, 8, 40), ...rows(2, 6, 3)]),
    );
    expect(long.mean).toBe(short.mean);
  });

  it("averages season means, not episodes", () => {
    // Episodes: (10 + 6) / 2 = 8 and 5; the episode mean would be 7.
    const result = showRating(
      ratingsBySeason([
        { seasonNumber: 1, rating: 10 },
        { seasonNumber: 1, rating: 6 },
        { seasonNumber: 2, rating: 5 },
      ]),
    );
    expect(result.mean).toBe(6.5);
  });

  it("leaves Specials out but reports that they are rated", () => {
    const result = showRating(
      ratingsBySeason([...rows(0, 10, 3), ...rows(1, 6, 2)]),
    );
    expect(result).toEqual({ mean: 6, ratedSeasons: 1, specialsRated: true });
  });

  it("is Not rated when only Specials are rated", () => {
    const result = showRating(ratingsBySeason(rows(0, 9, 2)));
    expect(result).toEqual({
      mean: null,
      ratedSeasons: 0,
      specialsRated: true,
    });
  });

  it("counts gaps in the season numbers as nothing, not as zero", () => {
    // Seasons 2 to 4 are unrated: the mean rests on seasons 1 and 5 only.
    const result = showRating(
      ratingsBySeason([...rows(1, 9, 2), ...rows(5, 4, 1)]),
    );
    expect(result).toEqual({
      mean: 6.5,
      ratedSeasons: 2,
      specialsRated: false,
    });
  });

  it("keeps full precision through both means", () => {
    // Season 1: 22 / 3; season 2: 8. The show mean is (22 / 3 + 8) / 2.
    const result = showRating(
      ratingsBySeason([
        { seasonNumber: 1, rating: 7 },
        { seasonNumber: 1, rating: 7 },
        { seasonNumber: 1, rating: 8 },
        { seasonNumber: 2, rating: 8 },
      ]),
    );
    expect(result.mean).toBe((22 / 3 + 8) / 2);
    expect(formatCalculatedRating(result.mean)).toBe("7.7");
  });

  it("is Not rated with no ratings at all", () => {
    expect(showRating(new Map())).toEqual({
      mean: null,
      ratedSeasons: 0,
      specialsRated: false,
    });
  });
});

describe("formatCalculatedRating (AC-3)", () => {
  it("reads Not rated for none", () => {
    expect(formatCalculatedRating(null)).toBe("Not rated");
  });

  it("reads Not rated for a show with no rated regular season, never 0.0", () => {
    const { mean } = showRating(ratingsBySeason(rows(0, 3, 1)));
    expect(formatCalculatedRating(mean)).toBe("Not rated");
  });

  it.each([
    [7, "7.0"],
    [10, "10.0"],
    [1, "1.0"],
    [7.25, "7.3"],
    [8.05, "8.1"],
    [7.95, "8.0"],
    [22 / 3, "7.3"],
    [23 / 3, "7.7"],
    [6.5, "6.5"],
  ])("shows %s as %s", (value, expected) => {
    expect(formatCalculatedRating(value)).toBe(expected);
  });
});
