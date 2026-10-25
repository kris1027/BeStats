import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0021, AC-2, AC-3; spec 0022, AC-21
 *
 * Popular stays on discover with only a page, the call the sitemap shares;
 * every other slug reads its TMDB list kind. The reads are replaced, so this
 * checks only which call each slug makes.
 */
const tmdb = vi.hoisted(() => ({
  discoverTvShows: vi.fn(),
  discoverMovies: vi.fn(),
  getTvList: vi.fn(),
  getMovieList: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => tmdb);

const igdb = vi.hoisted(() => ({
  discoverGames: vi.fn(),
  getPopularGames: vi.fn(),
}));
vi.mock("@/lib/igdb", () => igdb);
vi.mock("next/server", () => ({ connection: async () => {} }));

const { catalogList } = await import("@/lib/catalog/lists");
const {
  lastListPage,
  listHasNextPage,
  readCatalogList,
  readGameListPage,
  readTaggedCatalogGridPage,
  readTaggedCatalogList,
} = await import("./catalog-list-read");

afterEach(() => {
  for (const fn of Object.values(tmdb)) fn.mockReset();
  for (const fn of Object.values(igdb)) fn.mockReset();
  vi.useRealTimers();
});

describe("readCatalogList", () => {
  it("reads TV popular through discover with only the page", async () => {
    await readCatalogList(catalogList("tv", "popular"), 3);

    expect(tmdb.discoverTvShows).toHaveBeenCalledWith({ page: 3 });
    expect(tmdb.getTvList).not.toHaveBeenCalled();
  });

  it("reads movie popular through discover with only the page", async () => {
    await readCatalogList(catalogList("movie", "popular"), 1);

    expect(tmdb.discoverMovies).toHaveBeenCalledWith({ page: 1 });
  });

  it.each([
    ["trending", "trending"],
    ["airing-today", "airing_today"],
    ["on-the-air", "on_the_air"],
    ["top-rated", "top_rated"],
  ] as const)("maps the TV slug %s to the kind %s", async (slug, kind) => {
    await readCatalogList(catalogList("tv", slug), 2);

    expect(tmdb.getTvList).toHaveBeenCalledWith(kind, { page: 2 });
    expect(tmdb.discoverTvShows).not.toHaveBeenCalled();
  });

  it.each([
    ["trending", "trending"],
    ["now-playing", "now_playing"],
    ["upcoming", "upcoming"],
    ["top-rated", "top_rated"],
  ] as const)("maps the movie slug %s to the kind %s", async (slug, kind) => {
    await readCatalogList(catalogList("movie", slug), 1);

    expect(tmdb.getMovieList).toHaveBeenCalledWith(kind, { page: 1 });
  });
});

describe("readTaggedCatalogGridPage", () => {
  const page = (n: number) => ({
    page: n,
    results: Array.from({ length: 20 }, (_, index) => ({
      id: (n - 1) * 20 + index + 1,
    })),
    totalPages: 30,
    totalResults: 600,
  });

  it("reads the two TMDB pages that hold a 24 title page", async () => {
    tmdb.getTvList.mockImplementation(async (_kind, { page: n }) => page(n));

    const { mediaType, paged: result } = await readTaggedCatalogGridPage(
      catalogList("tv", "top-rated"),
      2,
    );

    expect(tmdb.getTvList.mock.calls).toEqual([
      ["top_rated", { page: 2 }],
      ["top_rated", { page: 3 }],
    ]);
    expect(result.results.map((show) => show.id)).toEqual(
      Array.from({ length: 24 }, (_, index) => 25 + index),
    );
    expect("totalPages" in result && result.totalPages).toBe(25);
    expect(mediaType).toBe("tv");
  });
});

/** covers: spec 0028, AC-2 to AC-4, AC-10 */
describe("readGameListPage", () => {
  const ranked = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

  it("slices a popularity list by 24, with the exact count", async () => {
    igdb.getPopularGames.mockResolvedValue(ranked(50));

    const paged = await readGameListPage(
      catalogList("game", "trending"),
      2,
      "2026-10-25",
    );

    expect(igdb.getPopularGames).toHaveBeenCalledWith("trending");
    expect(paged.results.map((game) => game.id)).toEqual(
      Array.from({ length: 24 }, (_, index) => 25 + index),
    );
    expect(paged).toMatchObject({ hasNextPage: true, totalResults: 50 });
  });

  it("reads Popular from the Playing list, and ends on the last slice", async () => {
    igdb.getPopularGames.mockResolvedValue(ranked(50));

    const paged = await readGameListPage(
      catalogList("game", "popular"),
      3,
      "2026-10-25",
    );

    expect(igdb.getPopularGames).toHaveBeenCalledWith("popular");
    expect(paged.results.map((game) => game.id)).toEqual([49, 50]);
    expect(paged.hasNextPage).toBe(false);
  });

  it("reads a discover list with its day's options and the page", async () => {
    await readGameListPage(catalogList("game", "coming-soon"), 2, "2026-10-25");

    expect(igdb.discoverGames).toHaveBeenCalledWith({
      sort: "hypes_desc",
      minHypes: 1,
      releasedFrom: "2026-10-26",
      releasedTo: "2027-02-22",
      pageSize: 24,
      page: 2,
    });
  });

  it("answers past page 50 empty, without asking IGDB", async () => {
    const paged = await readGameListPage(
      catalogList("game", "top-rated"),
      51,
      "2026-10-25",
    );

    expect(paged.results).toEqual([]);
    expect(igdb.discoverGames).not.toHaveBeenCalled();
  });

  it("reads today in UTC for the landing and the list page alike", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T23:30:00-05:00"));
    igdb.discoverGames.mockResolvedValue({ results: [] });

    await readTaggedCatalogList(catalogList("game", "recently-released"), 1);
    await readTaggedCatalogGridPage(
      catalogList("game", "recently-released"),
      1,
    );

    expect(igdb.discoverGames.mock.calls).toEqual([
      [expect.objectContaining({ releasedTo: "2026-10-26", page: 1 })],
      [expect.objectContaining({ releasedTo: "2026-10-26", page: 1 })],
    ]);
  });
});

describe("lastListPage (spec 0028, AC-10)", () => {
  const game = (totalResults: number | null) => ({
    mediaType: "game" as const,
    paged: { page: 1, results: [], hasNextPage: false, totalResults },
  });

  it("counts a games list's pages by 24, capped at 50, or null", () => {
    expect(lastListPage(game(49))).toBe(3);
    expect(lastListPage(game(48))).toBe(2);
    expect(lastListPage(game(100_000))).toBe(50);
    expect(lastListPage(game(null))).toBeNull();
  });
});

describe("listHasNextPage (spec 0028, AC-10)", () => {
  const game = (totalResults: number | null, hasNextPage: boolean) => ({
    mediaType: "game" as const,
    paged: { page: 1, results: [], hasNextPage, totalResults },
  });

  it("offers Next on a games list with no count while IGDB has more", () => {
    expect(listHasNextPage(game(null, true), 1)).toBe(true);
    expect(listHasNextPage(game(null, false), 1)).toBe(false);
  });

  it("never offers Next from page 50", () => {
    expect(listHasNextPage(game(null, true), 49)).toBe(true);
    expect(listHasNextPage(game(null, true), 50)).toBe(false);
  });

  it("leaves Next to the pager when the last page is known", () => {
    expect(listHasNextPage(game(100, true), 1)).toBe(false);
    expect(
      listHasNextPage(
        {
          mediaType: "tv",
          paged: { page: 1, results: [], totalPages: 3, totalResults: 60 },
        },
        1,
      ),
    ).toBe(false);
  });
});
