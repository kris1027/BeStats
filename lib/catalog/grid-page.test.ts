import { describe, expect, it, vi } from "vitest";

import type { Paged } from "@/lib/tmdb/types";

import {
  combineGridPage,
  GRID_PAGE_SIZE,
  gridPageWindow,
  lastGridPage,
  readGridPage,
} from "./grid-page";

/**
 * covers: spec 0022 AC-21, AC-22
 *
 * The window arithmetic is the whole risk: an off by one skips or repeats a
 * title between pages and nothing looks broken. So every test builds TMDB
 * pages of real 1 based result positions and checks positions, not counts.
 */

type Item = { id: number };

/** TMDB page `n` of a list of `total` results, ids being 1 based positions. */
function tmdbPage(n: number, total = 10_000): Paged<Item> {
  const start = (n - 1) * 20 + 1;
  const end = Math.min(n * 20, total);
  return {
    page: n,
    results: Array.from(
      { length: Math.max(end - start + 1, 0) },
      (_, index) => ({ id: start + index }),
    ),
    totalPages: Math.ceil(total / 20),
    totalResults: total,
  };
}

const ids = (page: Paged<Item>) => page.results.map((item) => item.id);

describe("gridPageWindow", () => {
  it.each([
    [1, [1, 2], 0],
    [2, [2, 3], 4],
    [3, [3, 4], 8],
    [4, [4, 5], 12],
    [5, [5, 6], 16],
    [6, [7, 8], 0],
  ])("page %i reads TMDB pages %j skipping %i", (page, tmdbPages, skip) => {
    expect(gridPageWindow(page)).toEqual({ tmdbPages, skip });
  });

  it("never asks for a TMDB page past 500", () => {
    expect(gridPageWindow(417)).toEqual({ tmdbPages: [500], skip: 4 });
  });
});

describe("lastGridPage", () => {
  it.each([
    [0, 0, 0],
    [7, 1, 1],
    [24, 2, 1],
    [25, 2, 2],
    [47, 3, 2],
    [10_000, 500, 417],
    // TMDB reports more results than its 500 pages serve.
    [20_001, 500, 417],
  ])(
    "%i results on %i TMDB pages end at grid page %i",
    (results, pages, last) => {
      expect(lastGridPage(results, pages)).toBe(last);
    },
  );
});

describe("combineGridPage", () => {
  it("joins consecutive pages without a gap or a repeat", () => {
    const seen: number[] = [];
    for (let page = 1; page <= 10; page++) {
      const { tmdbPages } = gridPageWindow(page);
      seen.push(
        ...ids(
          combineGridPage(
            page,
            tmdbPages.map((n) => tmdbPage(n)),
          ),
        ),
      );
    }
    expect(seen).toEqual(Array.from({ length: 240 }, (_, index) => index + 1));
  });

  it("fills a full page and reports the grid's page count", () => {
    const page = combineGridPage(2, [tmdbPage(2), tmdbPage(3)]);
    expect(page.results).toHaveLength(GRID_PAGE_SIZE);
    expect(page.totalPages).toBe(417);
    expect(page.totalResults).toBe(10_000);
    expect(page.page).toBe(2);
  });

  it("shows the 16 titles of the last page under the cap", () => {
    expect(ids(combineGridPage(417, [tmdbPage(500)]))).toEqual(
      Array.from({ length: 16 }, (_, index) => 9985 + index),
    );
  });

  it("keeps a short last page short", () => {
    const page = combineGridPage(2, [tmdbPage(2, 30), tmdbPage(3, 30)]);
    expect(ids(page)).toEqual([25, 26, 27, 28, 29, 30]);
    expect(page.totalPages).toBe(2);
  });

  it("keeps a title TMDB returned on both pages once", () => {
    const second = tmdbPage(2);
    second.results[0] = { id: 3 };
    const page = combineGridPage(1, [tmdbPage(1), second]);
    expect(ids(page).filter((id) => id === 3)).toHaveLength(1);
    expect(page.results).toHaveLength(GRID_PAGE_SIZE);
  });

  it("is empty with no results", () => {
    const page = combineGridPage(1, [tmdbPage(1, 0), tmdbPage(2, 0)]);
    expect(page.results).toEqual([]);
    expect(page.totalPages).toBe(0);
  });
});

describe("readGridPage", () => {
  it("reads both TMDB pages", async () => {
    const read = vi.fn(async (n: number) => tmdbPage(n));
    const page = await readGridPage(3, read);
    expect(read.mock.calls.map(([n]) => n)).toEqual([3, 4]);
    expect(ids(page)[0]).toBe(49);
  });

  it("fails the whole page when either half fails", async () => {
    const failure = new Error("TMDB down");
    const read = vi.fn(async (n: number) => {
      if (n === 2) throw failure;
      return tmdbPage(n);
    });
    await expect(readGridPage(1, read)).rejects.toBe(failure);
  });
});
