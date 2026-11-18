import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameSearchParams } from "./params";

/**
 * covers: spec 0029, AC-4 to AC-7
 *
 * The IGDB reads are replaced, so this checks only which call each mode
 * makes and with which options: every filter must reach IGDB, because IGDB
 * applying them is the whole guarantee that every game shown meets them.
 */
const igdb = vi.hoisted(() => ({
  discoverGames: vi.fn(),
  getPopularGames: vi.fn(),
  searchGames: vi.fn(),
}));
vi.mock("@/lib/igdb", () => igdb);
vi.mock("next/server", () => ({ connection: async () => {} }));

const { emptySearchParams } = await import("./params");
const { readGameSearchPage } = await import("./game-read");

function params(overrides: Partial<GameSearchParams> = {}): GameSearchParams {
  return { ...emptySearchParams("game"), ...overrides };
}

afterEach(() => {
  for (const fn of Object.values(igdb)) fn.mockReset();
});

describe("readGameSearchPage", () => {
  it("browses the cached Popular list, sliced into 24 game pages (AC-4)", async () => {
    igdb.getPopularGames.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({ id: index + 1 })),
    );

    const page = await readGameSearchPage("browse", params({ page: 2 }));

    expect(igdb.getPopularGames).toHaveBeenCalledWith("popular");
    expect(page.results.map((game) => game.id)).toEqual([
      25, 26, 27, 28, 29, 30,
    ]);
    expect(page).toMatchObject({ totalResults: 30, hasNextPage: false });
    expect(igdb.discoverGames).not.toHaveBeenCalled();
  });

  it("discovers most rated first, keeping unrated games, with every filter (AC-5, AC-7)", async () => {
    await readGameSearchPage(
      "discover",
      params({
        genreIds: [5, 8],
        platformIds: [130, 508],
        year: 2017,
        rating: 7,
        page: 3,
      }),
    );

    expect(igdb.discoverGames).toHaveBeenCalledWith({
      genreIds: [5, 8],
      platformIds: [130, 508],
      releasedFrom: "2017-01-01",
      releasedTo: "2017-12-31",
      minRating: 7,
      minRatingCount: 10,
      sort: "rating_count_desc",
      requireSortField: false,
      page: 3,
      pageSize: 24,
    });
  });

  it("sends no rating floor and no window when neither is set", async () => {
    await readGameSearchPage("discover", params({ platformIds: [508] }));

    const options = igdb.discoverGames.mock.calls[0][0];
    expect(options).not.toHaveProperty("minRating");
    expect(options).not.toHaveProperty("minRatingCount");
    expect(options).not.toHaveProperty("releasedFrom");
  });

  it("searches with the query and every filter, in relevance order (AC-6)", async () => {
    await readGameSearchPage(
      "search",
      params({ q: "mario", genreIds: [8], platformIds: [130], rating: 7 }),
    );

    expect(igdb.searchGames).toHaveBeenCalledWith({
      query: "mario",
      genreIds: [8],
      platformIds: [130],
      year: undefined,
      minRating: 7,
      minRatingCount: 10,
      page: 1,
      pageSize: 24,
    });
    expect(igdb.searchGames.mock.calls[0][0]).not.toHaveProperty("sort");
  });

  it("lets an IGDB failure through unchanged", async () => {
    const failure = new Error("upstream");
    igdb.searchGames.mockRejectedValue(failure);

    await expect(
      readGameSearchPage("search", params({ q: "zelda" })),
    ).rejects.toBe(failure);
  });
});
