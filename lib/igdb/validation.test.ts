import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IgdbValidationError } from "./errors";
import type { DiscoverGamesOptions, SearchGamesOptions } from "./types";
import {
  assertGameId,
  canonicalGameIds,
  validateDiscoverOptions,
  validateSearchOptions,
} from "./validation";

/**
 * The input guards on their own (spec 0023, AC-11, AC-12b). The refusals that
 * reach the reads are already pinned in `search.test.ts`; this file pins the
 * edges that must still pass, and the canonical forms that let equal requests
 * share one cache entry.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function fieldOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(IgdbValidationError);
    return (error as IgdbValidationError).field;
  }
  return undefined;
}

describe("assertGameId", () => {
  it("returns a positive integer unchanged", () => {
    expect(assertGameId(1942)).toBe(1942);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1942", null])(
    "refuses %s on the id field",
    (id) => {
      expect(fieldOf(() => assertGameId(id))).toBe("id");
    },
  );
});

describe("canonicalGameIds (AC-11)", () => {
  it("dedupes and sorts numerically, not as text", () => {
    expect(canonicalGameIds([100, 9, 1942, 9, 20])).toEqual([9, 20, 100, 1942]);
  });

  it("accepts an empty list", () => {
    expect(canonicalGameIds([])).toEqual([]);
  });

  it("counts the limit after deduping, so 501 entries of 500 ids pass", () => {
    const ids = [...Array.from({ length: 500 }, (_, i) => i + 1), 1];
    expect(canonicalGameIds(ids)).toHaveLength(500);
  });

  it("refuses 501 distinct ids", () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(fieldOf(() => canonicalGameIds(ids))).toBe("ids");
  });

  it("refuses a list holding one bad id", () => {
    expect(fieldOf(() => canonicalGameIds([1, 2, 0]))).toBe("ids");
    expect(fieldOf(() => canonicalGameIds([1, "2"]))).toBe("ids");
  });
});

describe("validateSearchOptions (AC-12b)", () => {
  it("drops absent options and defaults the page to 1", () => {
    expect(validateSearchOptions({ query: "  witcher  " })).toEqual({
      query: "witcher",
      page: 1,
    });
  });

  it("returns canonical filter ids and drops an empty list", () => {
    expect(
      validateSearchOptions({
        query: "a",
        genreIds: [31, 12, 31],
        platformIds: [],
      }),
    ).toEqual({ query: "a", genreIds: [12, 31], page: 1 });
  });

  it.each([
    ["page 50", { page: 50 }],
    ["20 genre ids", { genreIds: Array.from({ length: 20 }, (_, i) => i + 1) }],
    ["year 1950", { year: 1950 }],
    ["the current UTC year plus 5", { year: 2031 }],
    ["minRating 0", { minRating: 0 }],
    ["minRating 10", { minRating: 10 }],
    ["minRating 7.5", { minRating: 7.5 }],
  ])("accepts %s, the edge of its range", (_, extra) => {
    expect(() =>
      validateSearchOptions({ query: "a", ...extra } as SearchGamesOptions),
    ).not.toThrow();
  });

  it("bounds the year by the clock, so it moves with the date", () => {
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    expect(() =>
      validateSearchOptions({ query: "a", year: 2032 }),
    ).not.toThrow();
  });

  it.each([
    ["a non text query", { query: 42 }, "query"],
    [
      "a NaN minimum rating",
      { query: "a", minRating: Number.NaN },
      "minRating",
    ],
    ["a negative minimum rating", { query: "a", minRating: -0.1 }, "minRating"],
    ["a fractional year", { query: "a", year: 2017.5 }, "year"],
    ["a text page", { query: "a", page: "2" }, "page"],
    [
      "21 platform ids",
      { query: "a", platformIds: Array.from({ length: 21 }, (_, i) => i + 1) },
      "platformIds",
    ],
  ])("refuses %s, naming the field", (_, options, field) => {
    expect(
      fieldOf(() =>
        validateSearchOptions(options as unknown as SearchGamesOptions),
      ),
    ).toBe(field);
  });

  it("names the field and never echoes the value", () => {
    try {
      validateSearchOptions({ query: "a", year: 1234 });
    } catch (error) {
      expect((error as Error).message).not.toContain("1234");
    }
  });
});

describe("validateDiscoverOptions (AC-12b, AC-13)", () => {
  it("drops absent options and defaults the page to 1", () => {
    expect(validateDiscoverOptions({ sort: "hypes_desc" })).toEqual({
      sort: "hypes_desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("keeps a page size of 24 and fills an absent one with 20 (spec 0028, AC-5)", () => {
    expect(
      validateDiscoverOptions({ sort: "hypes_desc", pageSize: 24 }),
    ).toMatchObject({ pageSize: 24 });
    expect(
      validateDiscoverOptions({ sort: "hypes_desc", pageSize: 20 }),
    ).toEqual(validateDiscoverOptions({ sort: "hypes_desc" }));
  });

  it("accepts a one day window, from equal to to", () => {
    expect(
      validateDiscoverOptions({
        sort: "release_desc",
        releasedFrom: "2026-10-17",
        releasedTo: "2026-10-17",
      }),
    ).toMatchObject({ releasedFrom: "2026-10-17", releasedTo: "2026-10-17" });
  });

  it("accepts a real leap day and refuses one that does not exist", () => {
    expect(() =>
      validateDiscoverOptions({
        sort: "rating_desc",
        releasedFrom: "2028-02-29",
      }),
    ).not.toThrow();
    expect(
      fieldOf(() =>
        validateDiscoverOptions({
          sort: "rating_desc",
          releasedFrom: "2026-02-29",
        }),
      ),
    ).toBe("releasedFrom");
  });

  it("accepts minimum counts of 0", () => {
    expect(
      validateDiscoverOptions({
        sort: "rating_count_desc",
        minRatingCount: 0,
        minHypes: 0,
      }),
    ).toMatchObject({ minRatingCount: 0, minHypes: 0 });
  });

  it.each([
    ["a missing sort", {}, "sort"],
    [
      "a day with a time",
      { sort: "rating_desc", releasedTo: "2026-10-17T00:00:00Z" },
      "releasedTo",
    ],
    [
      "month 13",
      { sort: "rating_desc", releasedFrom: "2026-13-01" },
      "releasedFrom",
    ],
    ["page 51", { sort: "rating_desc", page: 51 }, "page"],
    ["a page size of 30", { sort: "rating_desc", pageSize: 30 }, "pageSize"],
    [
      "a minimum rating of 11",
      { sort: "rating_desc", minRating: 11 },
      "minRating",
    ],
  ])("refuses %s, naming the field", (_, options, field) => {
    expect(
      fieldOf(() =>
        validateDiscoverOptions(options as unknown as DiscoverGamesOptions),
      ),
    ).toBe(field);
  });

  it("never reads today into the window", () => {
    expect(
      validateDiscoverOptions({ sort: "release_desc" }),
    ).not.toHaveProperty("releasedTo");
  });
});
