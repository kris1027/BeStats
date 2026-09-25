import { describe, expect, it } from "vitest";

import type { Genre } from "@/lib/tmdb/types";

import { searchMode } from "./mode";
import {
  emptySearchParams,
  hasAnyFilter,
  parseSearchParams,
  parseSearchType,
  type SearchParams,
  searchHref,
} from "./params";

/** covers: spec 0010, AC-7, AC-18 */

const TV_GENRES: Genre[] = [
  { id: 18, name: "Drama" },
  { id: 35, name: "Comedy" },
  { id: 10766, name: "Soap" },
];
const YEAR = 2026;

function parse(raw: Record<string, string | string[] | undefined>) {
  return parseSearchParams(raw, TV_GENRES, YEAR);
}

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return { ...emptySearchParams("tv"), ...overrides };
}

describe("parseSearchParams", () => {
  it("reads an empty URL as browsing shows, page 1", () => {
    expect(parse({})).toEqual({ ok: true, params: params() });
  });

  it("reads every parameter", () => {
    expect(
      parse({
        type: "tv",
        q: "  dune ",
        genre: ["35", "18", "35"],
        year: "2024",
        rating: "7",
        page: "3",
      }),
    ).toEqual({
      ok: true,
      params: {
        type: "tv",
        q: "dune",
        genreIds: [18, 35],
        year: 2024,
        rating: 7,
        page: 3,
      },
    });
  });

  it("reads the blanks a GET form submits as not set", () => {
    expect(parse({ q: "  ", year: "", rating: "" })).toEqual({
      ok: true,
      params: params(),
    });
  });

  it("accepts next year and 1900, the edges of the year range", () => {
    expect(parse({ year: "2027" }).ok).toBe(true);
    expect(parse({ year: "1900" }).ok).toBe(true);
  });

  it("accepts a 100 character query and one character", () => {
    expect(parse({ q: "x".repeat(100) }).ok).toBe(true);
    expect(parse({ q: "x" }).ok).toBe(true);
  });

  it.each([
    [{ type: "anime" }, "type"],
    [{ type: ["tv", "movie"] }, "type"],
    [{ q: "x".repeat(101) }, "q"],
    [{ q: ["a", "b"] }, "q"],
    [{ genre: "999999" }, "genre"],
    [{ genre: "18.0" }, "genre"],
    [{ genre: ["18", "abc"] }, "genre"],
    [{ year: "1899" }, "year"],
    [{ year: "2028" }, "year"],
    [{ year: "20x4" }, "year"],
    [{ year: ["2020", "2021"] }, "year"],
    [{ rating: "7.5" }, "rating"],
    [{ rating: "4" }, "rating"],
    [{ rating: "10" }, "rating"],
    [{ rating: ["7", "8"] }, "rating"],
    [{ page: "0" }, "page"],
    [{ page: "501" }, "page"],
    [{ page: ["1", "2"] }, "page"],
  ] as const)("refuses %o and names %s", (raw, param) => {
    expect(parse(raw as Record<string, string | string[]>)).toEqual({
      ok: false,
      param,
    });
  });

  it("refuses a genre from the other catalog", () => {
    // 28 is the movie Action genre, which TV does not have.
    expect(parse({ type: "tv", genre: "28" })).toEqual({
      ok: false,
      param: "genre",
    });
  });

  it("trims the query, so padding never pushes it past 100 characters", () => {
    const result = parse({ q: `  ${"x".repeat(100)}  ` });
    expect(result.ok && result.params.q).toBe("x".repeat(100));
  });

  it("collapses a repeated genre and sorts the rest, so one filter has one URL", () => {
    const result = parse({ genre: ["35", "18", "35"] });
    expect(result.ok && result.params.genreIds).toEqual([18, 35]);
  });

  it("names the first bad parameter when several are bad", () => {
    expect(parse({ type: "anime", year: "1800", page: "0" })).toEqual({
      ok: false,
      param: "type",
    });
    expect(parse({ rating: "7.5", page: "0" })).toEqual({
      ok: false,
      param: "rating",
    });
  });

  it("ignores parameters it does not know", () => {
    expect(parse({ utm_source: "x" }).ok).toBe(true);
  });
});

describe("parseSearchType", () => {
  it("defaults to tv and refuses anything else", () => {
    expect(parseSearchType(undefined)).toBe("tv");
    expect(parseSearchType("movie")).toBe("movie");
    expect(parseSearchType("film")).toBeNull();
    expect(parseSearchType(["tv"])).toBeNull();
  });
});

describe("searchHref", () => {
  it("always names the type and leaves out every empty value and page 1", () => {
    expect(searchHref(params())).toBe("/search?type=tv");
    expect(searchHref(params({ type: "movie", page: 1 }))).toBe(
      "/search?type=movie",
    );
  });

  it("writes every set value in one fixed order", () => {
    expect(
      searchHref(
        params({ q: "dune", genreIds: [35, 18], year: 2024, rating: 7 }),
        { page: 2 },
      ),
    ).toBe(
      "/search?type=tv&q=dune&genre=18&genre=35&year=2024&rating=7&page=2",
    );
  });

  it("round trips through parseSearchParams", () => {
    const original = params({
      q: "a & b",
      genreIds: [18],
      year: 2001,
      page: 4,
    });
    const url = new URL(searchHref(original), "http://localhost");
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      raw[key] = values.length > 1 ? values : values[0];
    }
    expect(parse(raw)).toEqual({ ok: true, params: original });
  });
});

describe("hasAnyFilter", () => {
  it("counts a query and every filter, not the type or the page", () => {
    expect(hasAnyFilter(params({ type: "movie", page: 3 }))).toBe(false);
    expect(hasAnyFilter(params({ q: "x" }))).toBe(true);
    expect(hasAnyFilter(params({ year: 2000 }))).toBe(true);
  });
});

describe("searchMode", () => {
  it.each([
    [{}, "browse"],
    [{ year: 2020 }, "discover"],
    [{ genreIds: [18] }, "discover"],
    [{ rating: 7 }, "discover"],
    [{ q: "dune" }, "search"],
    [{ q: "dune", year: 2021 }, "search"],
    [{ q: "dune", genreIds: [18] }, "filtered_search"],
    [{ q: "dune", rating: 7, year: 2021 }, "filtered_search"],
  ] as const)("reads %o as %s", (overrides, mode) => {
    expect(searchMode(params(overrides as Partial<SearchParams>))).toBe(mode);
  });
});
