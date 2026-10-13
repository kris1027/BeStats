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

const { catalogList } = await import("@/lib/catalog/lists");
const { readCatalogList, readTaggedCatalogGridPage } = await import(
  "./catalog-list-read"
);

afterEach(() => {
  for (const fn of Object.values(tmdb)) fn.mockReset();
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
    expect(result.totalPages).toBe(25);
    expect(mediaType).toBe("tv");
  });
});
