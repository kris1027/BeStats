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

  it("asks for nothing past grid page 417, so it reads as no such page", async () => {
    expect(gridPageWindow(418).tmdbPages).toEqual([]);
    const read = vi.fn(async (n: number) => tmdbPage(n));
    const page = await readGridPage(418, read);
    expect(read).not.toHaveBeenCalled();
    expect(page.totalPages).toBe(0);
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

  it("keeps a title TMDB repeated at a page edge once and stays full", () => {
    // TMDB's own quirk, seen live: page 2 opens with page 1's last title.
    const second = tmdbPage(2);
    second.results[0] = { id: 20 };
    const first = combineGridPage(1, [tmdbPage(1), second]);
    const next = combineGridPage(2, [second, tmdbPage(3)]);
    expect(ids(first).filter((id) => id === 20)).toHaveLength(1);
    expect(first.results).toHaveLength(GRID_PAGE_SIZE);
    // The filler is the next page's first title, as TMDB's repeat was.
    expect(ids(first).at(-1)).toBe(25);
    expect(ids(next)[0]).toBe(25);
  });

  it("stays one short when nothing past the window was read", () => {
    // Page 5 ends exactly at the end of TMDB page 6.
    const sixth = tmdbPage(6);
    sixth.results[0] = { id: 100 };
    const page = combineGridPage(5, [tmdbPage(5), sixth]);
    expect(page.results).toHaveLength(GRID_PAGE_SIZE - 1);
  });

  it("splits a short TMDB page between its two grid pages with no repeat or gap", () => {
    // The list read dropped one adult title from TMDB page 2.
    const second = tmdbPage(2);
    second.results.splice(2, 1);
    const first = combineGridPage(1, [tmdbPage(1), second]);
    const next = combineGridPage(2, [second, tmdbPage(3)]);
    const shown = [...ids(first), ...ids(next)];
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toEqual(
      [...ids(tmdbPage(1)), ...ids(second), ...ids(tmdbPage(3))].slice(
        0,
        shown.length,
      ),
    );
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
