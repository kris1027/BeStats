import {
  v1GenresSchema,
  v1ListSchema,
  v1PlatformsSchema,
  v1SearchSchema,
} from "@bestats/core/api/v1/browse";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ctx, errorOf, req, VERSION } from "./test-kit";

/**
 * covers: spec 0035, API surface (`/genres`, `/search`, `/lists/{type}/{list}`),
 * Caching; AGENTS.md section 10 (every result meets every filter, the count
 * is exact or marked partial)
 *
 * TMDB and IGDB are the boundaries: the cached module reads and the search
 * reads the web's `/search` page makes are replaced, and the core parsers,
 * modes and paging run for real. Every success body parses with its core
 * schema.
 */
class FakeTmdbError extends Error {}
class FakeIgdbError extends Error {}

const getMovieGenres = vi.fn();
const getTvGenres = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getMovieGenres,
  getTvGenres,
  TmdbError: FakeTmdbError,
}));
const getGameGenres = vi.fn();
const getGamePlatforms = vi.fn();
vi.mock("@/lib/igdb", () => ({
  getGameGenres,
  getGamePlatforms,
  IgdbError: FakeIgdbError,
}));

const readSearchGridPage = vi.fn();
vi.mock("@/lib/search/read", () => ({ readSearchGridPage }));
const scanFilteredSearch = vi.fn();
vi.mock("@/lib/search/scan", () => ({ scanFilteredSearch }));
const readGameSearchPage = vi.fn();
vi.mock("@/lib/search/game-read", () => ({ readGameSearchPage }));
const readGameLists = vi.fn();
vi.mock("@/lib/search/lists", () => ({ readGameLists }));

const readTaggedCatalogGridPage = vi.fn();
vi.mock("@/lib/catalog-list-read", () => ({
  readTaggedCatalogGridPage,
  lastListPage: (result: {
    mediaType: string;
    paged: { totalPages?: number; totalResults: number | null };
  }) =>
    result.mediaType === "game"
      ? result.paged.totalResults === null
        ? null
        : Math.ceil(result.paged.totalResults / 24)
      : result.paged.totalPages,
  lastGamePage: (paged: { totalResults: number | null }) =>
    paged.totalResults === null ? null : Math.ceil(paged.totalResults / 24),
}));

const { GET: getGenres } = await import("./genres/route");
const { GET: getPlatforms } = await import("./platforms/route");
const { GET: getSearch } = await import("./search/route");
const { GET: getList } = await import("./lists/[type]/[list]/route");

const PUBLIC_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

const ACTION = { id: 28, name: "Action" };
const MATRIX = {
  id: 603,
  title: "The Matrix",
  year: 1999,
  releaseDate: "1999-03-31",
  posterUrl: "https://image.tmdb.org/t/p/w500/m.jpg",
  tmdbRating: 8.2,
  tmdbVoteCount: 26000,
  genreIds: [28],
};
/** The same movie as a list read returns it, a `MovieSummary`. */
const MATRIX_SUMMARY = {
  id: 603,
  title: "The Matrix",
  posterUrl: MATRIX.posterUrl,
  releaseDate: "1999-03-31",
  releaseYear: 1999,
  overview: null,
  tmdbRating: 8.2,
  tmdbVoteCount: 26000,
  genreIds: [28],
  backdropUrl: null,
};
const GAME = {
  id: 1942,
  name: "The Witcher 3",
  coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/a.jpg",
  fullCoverUrl: null,
  artUrl: null,
  releaseDate: "2015-05-19",
  releaseYear: 2015,
  communityRating: 93,
  communityRatingCount: 3000,
  genreIds: [12],
  platformIds: [6],
  hidden: false,
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getMovieGenres.mockResolvedValue([ACTION]);
  getTvGenres.mockResolvedValue([{ id: 18, name: "Drama" }]);
  getGameGenres.mockResolvedValue([{ id: 12, name: "Role-playing (RPG)" }]);
  readGameLists.mockResolvedValue({
    genres: [{ id: 12, name: "Role-playing (RPG)" }],
    platforms: [{ id: 6, name: "PC" }],
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("GET /api/v1/genres", () => {
  it.each([
    ["movie", getMovieGenres, ACTION],
    ["tv", getTvGenres, { id: 18, name: "Drama" }],
    ["game", getGameGenres, { id: 12, name: "Role-playing (RPG)" }],
  ] as const)(
    "answers %s genres from the web's cached list",
    async (type, read, genre) => {
      const response = await getGenres(
        req(`/api/v1/genres?type=${type}`, VERSION),
        ctx(),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, s-maxage=86400",
      );
      expect(v1GenresSchema.parse(await response.json())).toEqual({
        type,
        genres: [genre],
      });
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it("refuses an unknown type with 400 before any read", async () => {
    const response = await getGenres(
      req("/api/v1/genres?type=music", VERSION),
      ctx(),
    );
    expect(response.status).toBe(400);
    expect(getMovieGenres).not.toHaveBeenCalled();
  });

  it("answers a catalog failure with 502 no-store", async () => {
    getGameGenres.mockRejectedValue(new FakeIgdbError("down"));
    const response = await getGenres(
      req("/api/v1/genres?type=game", VERSION),
      ctx(),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await errorOf(response)).code).toBe("catalog_unavailable");
  });
});

describe("GET /api/v1/platforms", () => {
  it("answers IGDB's platforms from the web's cached list, for a day", async () => {
    getGamePlatforms.mockResolvedValue([
      { id: 6, name: "PC", slug: "win" },
      { id: 130, name: "Nintendo Switch" },
    ]);
    const response = await getPlatforms(
      req("/api/v1/platforms", VERSION),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=86400",
    );
    expect(v1PlatformsSchema.parse(await response.json())).toEqual({
      platforms: [
        { id: 6, name: "PC" },
        { id: 130, name: "Nintendo Switch" },
      ],
    });
    expect(getGamePlatforms).toHaveBeenCalledOnce();
  });

  it("answers an IGDB failure with 502 no-store", async () => {
    getGamePlatforms.mockRejectedValue(new FakeIgdbError("down"));
    const response = await getPlatforms(
      req("/api/v1/platforms", VERSION),
      ctx(),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await errorOf(response)).code).toBe("catalog_unavailable");
  });
});

describe("GET /api/v1/search", () => {
  const search = (query: string) =>
    getSearch(req(`/api/v1/search?${query}`, VERSION), ctx());

  it("answers a plain title search through the web's grid read, in TMDB's order", async () => {
    readSearchGridPage.mockResolvedValue({
      page: 1,
      results: [MATRIX],
      totalPages: 3,
      totalResults: 60,
    });
    const response = await search("type=movie&q=matrix");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_CACHE);
    const body = v1SearchSchema.parse(await response.json());
    expect(body).toMatchObject({
      type: "movie",
      mode: "search",
      page: 1,
      total: 60,
      totalIsExact: true,
      nextPage: 2,
      scanned: null,
    });
    expect(body.results[0]).toEqual({
      id: 603,
      title: "The Matrix",
      year: 1999,
      releaseDate: "1999-03-31",
      posterUrl: MATRIX.posterUrl,
      communityRating: 8.2,
    });
    expect(readSearchGridPage).toHaveBeenCalledWith(
      "search",
      expect.objectContaining({ type: "movie", q: "matrix", page: 1 }),
    );
  });

  it("scans for a query with a genre and marks the count partial", async () => {
    scanFilteredSearch.mockResolvedValue({
      kind: "ok",
      results: [MATRIX],
      fromIndex: 1,
      toIndex: 100,
      totalResults: 140,
      nextPage: 6,
    });
    const body = v1SearchSchema.parse(
      await (await search("type=movie&q=matrix&genre=28")).json(),
    );
    expect(body).toMatchObject({
      mode: "filtered_search",
      total: 140,
      totalIsExact: false,
      nextPage: 6,
      scanned: { fromIndex: 1, toIndex: 100 },
    });
    expect(scanFilteredSearch).toHaveBeenCalledWith(
      expect.objectContaining({ genreIds: [28] }),
    );
    expect(readSearchGridPage).not.toHaveBeenCalled();
  });

  it("takes repeated genres as the web does", async () => {
    getMovieGenres.mockResolvedValue([ACTION, { id: 12, name: "Adventure" }]);
    readSearchGridPage.mockResolvedValue({
      page: 1,
      results: [],
      totalPages: 0,
      totalResults: 0,
    });
    const response = await search("type=movie&genre=28&genre=12");
    expect(response.status).toBe(200);
    expect(readSearchGridPage).toHaveBeenCalledWith(
      "discover",
      expect.objectContaining({ genreIds: [12, 28] }),
    );
  });

  it.each([
    ["type=music&q=x", "an unknown type"],
    ["type=movie&genre=999", "a genre not in the movie list"],
    ["type=movie&year=12", "a malformed year"],
    ["type=tv&platform=6", "a platform on a TV search"],
    ["type=movie&q=a&q=b", "a repeated query"],
  ])("answers %s with 400 (%s)", async (query) => {
    const response = await search(query);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(readSearchGridPage).not.toHaveBeenCalled();
  });

  it("answers a page past the end with 404", async () => {
    readSearchGridPage.mockResolvedValue({
      page: 9,
      results: [],
      totalPages: 3,
      totalResults: 60,
    });
    const response = await search("type=movie&q=matrix&page=9");
    expect(response.status).toBe(404);
  });

  it("still searches without the genre list when no genre is asked for", async () => {
    getTvGenres.mockRejectedValue(new FakeTmdbError("down"));
    readSearchGridPage.mockResolvedValue({
      page: 1,
      results: [],
      totalPages: 0,
      totalResults: 0,
    });
    expect((await search("type=tv&q=dark")).status).toBe(200);
    expect((await search("type=tv&q=dark&genre=18")).status).toBe(502);
  });

  it("answers a TMDB failure with 502 no-store", async () => {
    readSearchGridPage.mockRejectedValue(new FakeTmdbError("down"));
    const response = await search("type=movie&q=matrix");
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers a games search from IGDB with its own count", async () => {
    readGameSearchPage.mockResolvedValue({
      page: 1,
      results: [GAME],
      hasNextPage: true,
      totalResults: 30,
    });
    const body = v1SearchSchema.parse(
      await (await search("type=game&q=witcher&platform=6")).json(),
    );
    expect(body).toMatchObject({
      type: "game",
      mode: "search",
      total: 30,
      totalIsExact: true,
      nextPage: 2,
    });
    expect(body.results[0]).toMatchObject({
      id: 1942,
      title: "The Witcher 3",
      posterUrl: GAME.coverUrl,
      communityRating: 93,
    });
    expect(readGameSearchPage).toHaveBeenCalledWith(
      "search",
      expect.objectContaining({ platformIds: [6] }),
    );
  });

  it("refuses a games page above IGDB's 50 before asking", async () => {
    const response = await search("type=game&page=51");
    expect(response.status).toBe(404);
    expect(readGameSearchPage).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/lists/{type}/{list}", () => {
  const list = (type: string, slug: string, query = "") =>
    getList(
      req(`/api/v1/lists/${type}/${slug}${query}`, VERSION),
      ctx({ type, list: slug }),
    );

  it("answers a page of a TMDB list through the web's grid read", async () => {
    readTaggedCatalogGridPage.mockResolvedValue({
      mediaType: "movie",
      paged: {
        page: 1,
        results: [MATRIX_SUMMARY],
        totalPages: 10,
        totalResults: 240,
      },
    });
    const response = await list("movie", "popular");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLIC_CACHE);
    const body = v1ListSchema.parse(await response.json());
    expect(body).toMatchObject({
      type: "movie",
      list: "popular",
      page: 1,
      total: 240,
      totalIsExact: true,
      nextPage: 2,
    });
    expect(body.results[0]).toMatchObject({ year: 1999, communityRating: 8.2 });
    expect(readTaggedCatalogGridPage).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", slug: "popular" }),
      1,
    );
  });

  it("follows IGDB's has more flag when a games list sent no count", async () => {
    readTaggedCatalogGridPage.mockResolvedValue({
      mediaType: "game",
      paged: {
        page: 2,
        results: [GAME],
        hasNextPage: true,
        totalResults: null,
      },
    });
    const body = v1ListSchema.parse(
      await (await list("game", "coming-soon", "?page=2")).json(),
    );
    expect(body).toMatchObject({
      total: null,
      totalIsExact: false,
      nextPage: 3,
    });
  });

  it.each([
    ["movie", "airing-today"],
    ["tv", "now-playing"],
    ["game", "nope"],
  ])("answers %s list %s with 404", async (type, slug) => {
    const response = await list(type, slug);
    expect(response.status).toBe(404);
    expect(readTaggedCatalogGridPage).not.toHaveBeenCalled();
  });

  it("answers a page past the end with 404, and page 1 of an empty list with 200", async () => {
    readTaggedCatalogGridPage.mockResolvedValue({
      mediaType: "tv",
      paged: { page: 1, results: [], totalPages: 0, totalResults: 0 },
    });
    expect((await list("tv", "airing-today")).status).toBe(200);
    expect((await list("tv", "airing-today", "?page=2")).status).toBe(404);
  });

  it("refuses a bad page with 400 and answers a failure with 502", async () => {
    expect((await list("tv", "popular", "?page=0")).status).toBe(400);
    readTaggedCatalogGridPage.mockRejectedValue(new FakeTmdbError("down"));
    const response = await list("tv", "popular");
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
