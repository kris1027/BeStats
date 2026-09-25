import { describe, expect, it, vi } from "vitest";

import { TmdbError } from "@/lib/tmdb/errors";

import { emptySearchParams, type SearchParams } from "./params";
import type { SearchPage, SearchResult } from "./read";
import { toQuickSearchResponse } from "./read";
import { matchesFilters, scanFilteredSearch } from "./scan";

/** covers: spec 0010, AC-10, AC-13, AC-14, AC-15, AC-18, AC-20 */

function result(
  id: number,
  overrides: Partial<SearchResult> = {},
): SearchResult {
  return {
    id,
    title: `Title ${id}`,
    year: 2020,
    posterUrl: null,
    tmdbRating: 8,
    tmdbVoteCount: 500,
    genreIds: [18, 878],
    ...overrides,
  };
}

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    ...emptySearchParams("movie"),
    q: "dune",
    genreIds: [878],
    ...overrides,
  };
}

/**
 * A fake TMDB search with `totalPages` pages of 20 results. `keep(id)` decides
 * which results carry genre 878, so a test controls how many each page keeps.
 */
function fakeSearch(
  totalPages: number,
  keep: (id: number) => boolean,
  totalResults = totalPages * 20,
) {
  const read = vi.fn(async (page: number): Promise<SearchPage> => {
    const results =
      page > totalPages
        ? []
        : Array.from({ length: 20 }, (_, index) => {
            const id = (page - 1) * 20 + index + 1;
            return result(id, { genreIds: keep(id) ? [878] : [18] });
          });
    return { page, results, totalPages, totalResults };
  });
  return read;
}

describe("matchesFilters", () => {
  it("requires every selected genre", () => {
    expect(
      matchesFilters(result(1), { genreIds: [18, 878], rating: null }),
    ).toBe(true);
    expect(
      matchesFilters(result(1, { genreIds: [18] }), {
        genreIds: [18, 878],
        rating: null,
      }),
    ).toBe(false);
  });

  it("requires the rating and 100 votes when a rating is set", () => {
    const filter = { genreIds: [], rating: 7 as const };
    expect(matchesFilters(result(1, { tmdbRating: 7 }), filter)).toBe(true);
    expect(matchesFilters(result(1, { tmdbRating: 6.9 }), filter)).toBe(false);
    expect(matchesFilters(result(1, { tmdbVoteCount: 99 }), filter)).toBe(
      false,
    );
    expect(matchesFilters(result(1, { tmdbRating: null }), filter)).toBe(false);
  });

  it("keeps a title with exactly 100 votes, the floor itself", () => {
    const filter = { genreIds: [], rating: 9 as const };
    expect(
      matchesFilters(result(1, { tmdbRating: 9, tmdbVoteCount: 100 }), filter),
    ).toBe(true);
  });

  it("needs both the genres and the rating when both are set", () => {
    const filter = { genreIds: [878], rating: 7 as const };
    expect(matchesFilters(result(1, { genreIds: [18] }), filter)).toBe(false);
    expect(matchesFilters(result(1, { tmdbRating: 5 }), filter)).toBe(false);
    expect(matchesFilters(result(1), filter)).toBe(true);
  });

  it("ignores votes when no rating is set", () => {
    expect(
      matchesFilters(result(1, { tmdbVoteCount: 0, tmdbRating: null }), {
        genreIds: [],
        rating: null,
      }),
    ).toBe(true);
  });
});

describe("scanFilteredSearch", () => {
  it("reads one page when it already keeps 20", async () => {
    const read = fakeSearch(10, () => true);

    const scan = await scanFilteredSearch(params(), read);

    expect(read).toHaveBeenCalledTimes(1);
    expect(scan).toMatchObject({
      kind: "ok",
      fromIndex: 1,
      toIndex: 20,
      totalResults: 200,
      nextPage: 2,
    });
  });

  it("reads further pages in order, whole pages, and stops at the page that reaches 20", async () => {
    // Every fourth result matches: 5 per page, so page 4 reaches 20.
    const read = fakeSearch(10, (id) => id % 4 === 0);

    const scan = await scanFilteredSearch(params(), read);
    if (scan.kind !== "ok") throw new Error("expected results");

    expect(scan.results.map((r) => r.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => (index + 1) * 4),
    );
    expect(scan.toIndex).toBe(80);
    expect(scan.nextPage).toBe(5);
    // The first page alone, then the rest of the budget at once.
    expect(read.mock.calls.map(([page]) => page)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never shows a result that fails a filter", async () => {
    const read = fakeSearch(3, (id) => id % 3 === 0);

    const scan = await scanFilteredSearch(params(), read);
    if (scan.kind !== "ok") throw new Error("expected results");

    expect(scan.results.every((r) => r.genreIds.includes(878))).toBe(true);
  });

  it("stops after 5 pages, and after the last page TMDB serves", async () => {
    const read = fakeSearch(20, () => false);
    const scan = await scanFilteredSearch(params(), read);
    expect(read).toHaveBeenCalledTimes(5);
    expect(scan).toMatchObject({ results: [], toIndex: 100, nextPage: 6 });

    const short = fakeSearch(2, () => false, 33);
    const end = await scanFilteredSearch(params(), short);
    expect(short).toHaveBeenCalledTimes(2);
    expect(end).toMatchObject({ toIndex: 33, nextPage: null });
  });

  it("neither skips nor repeats a result across two cursor pages", async () => {
    const read = fakeSearch(12, (id) => id % 3 === 0);

    const first = await scanFilteredSearch(params(), read);
    if (first.kind !== "ok" || first.nextPage === null) throw new Error("x");
    const second = await scanFilteredSearch(
      params({ page: first.nextPage }),
      read,
    );
    if (second.kind !== "ok") throw new Error("expected results");

    const ids = [...first.results, ...second.results].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const expected = Array.from({ length: 240 }, (_, i) => i + 1)
      .filter((id) => id % 3 === 0)
      .slice(0, ids.length);
    expect(ids).toEqual(expected);
    expect(second.fromIndex).toBe((first.nextPage - 1) * 20 + 1);
  });

  it("decides a page past the end from the first read, before fetching more", async () => {
    const read = fakeSearch(3, () => false);

    const scan = await scanFilteredSearch(params({ page: 7 }), read);

    expect(scan).toEqual({ kind: "no_such_page" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("treats page 1 of a search with no results as empty, not missing", async () => {
    const read = fakeSearch(0, () => false, 0);

    const scan = await scanFilteredSearch(params(), read);

    expect(scan).toMatchObject({ kind: "ok", results: [], totalResults: 0 });
  });

  it("starts the range at 101 on cursor page 6 (value sourcing)", async () => {
    const read = fakeSearch(20, () => true);

    const scan = await scanFilteredSearch(params({ page: 6 }), read);

    expect(scan).toMatchObject({ kind: "ok", fromIndex: 101, toIndex: 120 });
    expect(read).toHaveBeenCalledWith(6);
  });

  it("never reads past page 500, even when TMDB reports more pages", async () => {
    const read = fakeSearch(1_000, () => false);

    const scan = await scanFilteredSearch(params({ page: 498 }), read);

    expect(read.mock.calls.map(([page]) => page)).toEqual([498, 499, 500]);
    expect(scan).toMatchObject({ kind: "ok", nextPage: null });
  });

  it("answers a cursor past page 500 as a missing page", async () => {
    const read = fakeSearch(1_000, () => true);

    const scan = await scanFilteredSearch(params({ page: 501 }), read);

    expect(scan).toEqual({ kind: "no_such_page" });
  });

  it("rethrows a TMDB failure on a page it needs", async () => {
    const read = fakeSearch(5, () => false);
    read.mockImplementation(async (page) => {
      if (page === 3) throw new TmdbError("timeout", "/search/movie", "slow");
      return { page, results: [], totalPages: 5, totalResults: 100 };
    });

    await expect(scanFilteredSearch(params(), read)).rejects.toBeInstanceOf(
      TmdbError,
    );
  });

  it("ignores a failure on a page it never reaches", async () => {
    const full = fakeSearch(5, () => true);
    const read = vi.fn(async (page: number) => {
      if (page === 1) {
        const first = await full(1);
        return { ...first, results: first.results.slice(0, 10) };
      }
      if (page === 4) throw new TmdbError("timeout", "/search/movie", "slow");
      return full(page);
    });

    const scan = await scanFilteredSearch(params(), read);

    expect(scan).toMatchObject({ kind: "ok", nextPage: 3 });
  });
});

describe("toQuickSearchResponse", () => {
  it("keeps TMDB's total and the first five, with small posters and links", () => {
    const page: SearchPage = {
      page: 1,
      totalPages: 1,
      totalResults: 95,
      results: Array.from({ length: 7 }, (_, index) =>
        result(index + 1, {
          posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg",
        }),
      ),
    };

    const body = toQuickSearchResponse("tv", page);

    expect(body.totalResults).toBe(95);
    expect(body.results).toHaveLength(5);
    expect(body.results[0]).toEqual({
      id: 1,
      title: "Title 1",
      year: 2020,
      posterUrl: "https://image.tmdb.org/t/p/w92/p.jpg",
      tmdbRating: 8,
      href: "/shows/1",
    });
  });
});
