import {
  v1SimilarGamesSchema,
  v1TitleExtrasSchema,
} from "@bestats/core/api/v1/extras";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ctx, errorOf, req, VERSION } from "./test-kit";

/**
 * covers: prompts/mobile-look-title-extras.md, AC-1 to AC-4 (the answers the
 * app's sections are drawn from) and AC-6 (status and cache headers), plus
 * decision 1 (the connection's country picks the age rating and providers).
 *
 * TMDB and IGDB are the boundaries: the cached reads are replaced, and the
 * region rule, the mapping and `withV1` run for real. Every success body
 * parses with its core schema.
 */
class FakeTmdbError extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}
class FakeIgdbError extends Error {}

const getMovieExtras = vi.fn();
const getTvExtras = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  getMovieExtras,
  getTvExtras,
  TmdbError: FakeTmdbError,
}));
const loadMovie = vi.fn();
vi.mock("@/lib/tmdb/load-movie", () => ({ loadMovie }));
const loadShow = vi.fn();
vi.mock("@/lib/tmdb/load-show", () => ({ loadShow }));
const getGamesByIds = vi.fn();
vi.mock("@/lib/igdb", () => ({ getGamesByIds, IgdbError: FakeIgdbError }));
const loadGame = vi.fn();
vi.mock("@/lib/igdb/load-game", () => ({ loadGame }));

const { GET: getMovieExtrasRoute } = await import("./movies/[id]/extras/route");
const { GET: getShowExtrasRoute } = await import("./shows/[id]/extras/route");
const { GET: getSimilar } = await import("./games/[id]/similar/route");

const provider = (id: number, name: string) => ({
  id,
  name,
  logoUrl: `https://image.tmdb.org/t/p/w92/${id}.png`,
});

const movieSummary = (id: number) => ({
  id,
  title: `Movie ${id}`,
  originalTitle: `Movie ${id}`,
  overview: null,
  releaseDate: "2020-01-01",
  releaseYear: 2020,
  posterUrl: null,
  backdropUrl: null,
  tmdbRating: 7,
  tmdbVoteCount: 10,
  genreIds: [],
});

const MOVIE_EXTRAS = {
  trailer: { key: "dQw4w9WgXcQ", name: "Official Trailer" },
  recommendations: {
    mediaType: "movie",
    paged: {
      page: 1,
      results: Array.from({ length: 20 }, (_, index) =>
        movieSummary(index + 1),
      ),
      totalPages: 2,
      totalResults: 40,
    },
  },
  watchProviders: {
    PL: {
      link: "https://www.themoviedb.org/movie/1/watch?locale=PL",
      stream: [provider(8, "Netflix")],
      free: [],
      rentOrBuy: [provider(2, "Apple TV")],
    },
  },
  ageRatings: { PL: "13", US: "PG-13" },
};

const SHOW_EXTRAS = {
  trailer: null,
  recommendations: {
    mediaType: "tv",
    paged: {
      page: 1,
      results: [
        {
          id: 9,
          name: "Show 9",
          originalName: "Show 9",
          overview: null,
          firstAirDate: "2019-02-03",
          firstAirYear: 2019,
          posterUrl: null,
          backdropUrl: null,
          tmdbRating: 8,
          tmdbVoteCount: 3,
          genreIds: [],
        },
      ],
      totalPages: 1,
      totalResults: 1,
    },
  },
  watchProviders: {},
  ageRatings: {},
};

const game = (id: number, hidden = false) => ({
  id,
  name: `Game ${id}`,
  releaseYear: 2024,
  releaseDate: "2024-05-01",
  coverUrl: null,
  communityRating: 80,
  hidden,
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  loadMovie.mockResolvedValue({ kind: "found", movie: { id: 1 } });
  loadShow.mockResolvedValue({ kind: "found", show: { id: 2 } });
  getMovieExtras.mockResolvedValue(MOVIE_EXTRAS);
  getTvExtras.mockResolvedValue(SHOW_EXTRAS);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("GET /api/v1/movies/{id}/extras", () => {
  it("picks the connection's country and stays out of shared caches", async () => {
    const response = await getMovieExtrasRoute(
      req("/api/v1/movies/1/extras", {
        ...VERSION,
        "x-vercel-ip-country": "PL",
      }),
      ctx({ id: "1" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    const body = v1TitleExtrasSchema.parse(await response.json());
    expect(body.region).toEqual({ code: "PL", name: "Poland" });
    expect(body.ageRating).toBe("13");
    expect(body.watch?.stream.map((p) => p.name)).toEqual(["Netflix"]);
    expect(body.trailer?.key).toBe("dQw4w9WgXcQ");
    expect(body.recommendations).toHaveLength(12);
    expect(body.recommendations[0]).toEqual({
      id: 1,
      title: "Movie 1",
      year: 2020,
      releaseDate: "2020-01-01",
      posterUrl: null,
      communityRating: 7,
    });
  });

  it("falls back to the United States and never borrows another country", async () => {
    const response = await getMovieExtrasRoute(
      req("/api/v1/movies/1/extras", VERSION),
      ctx({ id: "1" }),
    );
    const body = v1TitleExtrasSchema.parse(await response.json());
    expect(body.region.code).toBe("US");
    expect(body.ageRating).toBe("PG-13");
    expect(body.watch).toBeNull();
  });

  it("answers 404 for a movie the detail read does not find", async () => {
    loadMovie.mockResolvedValue({ kind: "not_found" });
    const response = await getMovieExtrasRoute(
      req("/api/v1/movies/1/extras", VERSION),
      ctx({ id: "1" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await errorOf(response)).code).toBe("not_found");
  });

  it("answers 502 when the extras read fails", async () => {
    getMovieExtras.mockRejectedValue(new FakeTmdbError("network"));
    const response = await getMovieExtrasRoute(
      req("/api/v1/movies/1/extras", VERSION),
      ctx({ id: "1" }),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses a bad id before any read", async () => {
    const response = await getMovieExtrasRoute(
      req("/api/v1/movies/abc/extras", VERSION),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(400);
    expect(getMovieExtras).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/shows/{id}/extras", () => {
  it("maps show recommendations and leaves missing data null", async () => {
    const response = await getShowExtrasRoute(
      req("/api/v1/shows/2/extras", {
        ...VERSION,
        "x-vercel-ip-country": "PL",
      }),
      ctx({ id: "2" }),
    );
    const body = v1TitleExtrasSchema.parse(await response.json());
    expect(body.trailer).toBeNull();
    expect(body.ageRating).toBeNull();
    expect(body.watch).toBeNull();
    expect(body.recommendations).toEqual([
      {
        id: 9,
        title: "Show 9",
        year: 2019,
        releaseDate: "2019-02-03",
        posterUrl: null,
        communityRating: 8,
      },
    ]);
  });

  it("answers 404 for a show the detail read does not find", async () => {
    loadShow.mockResolvedValue({ kind: "not_found" });
    const response = await getShowExtrasRoute(
      req("/api/v1/shows/2/extras", VERSION),
      ctx({ id: "2" }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await errorOf(response)).code).toBe("not_found");
  });

  it("refuses a bad id before any read", async () => {
    const response = await getShowExtrasRoute(
      req("/api/v1/shows/abc/extras", VERSION),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(400);
    expect(getTvExtras).not.toHaveBeenCalled();
  });

  it("answers 502 when the show read fails", async () => {
    loadShow.mockResolvedValue({ kind: "failed" });
    const response = await getShowExtrasRoute(
      req("/api/v1/shows/2/extras", VERSION),
      ctx({ id: "2" }),
    );
    expect(response.status).toBe(502);
  });
});

describe("GET /api/v1/games/{id}/similar", () => {
  it("keeps the game's order and drops hidden and missing games", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { id: 5, similarGameIds: [3, 4, 6, 7] },
    });
    getGamesByIds.mockResolvedValue({
      found: [game(7), game(4, true), game(3)],
    });
    const response = await getSimilar(
      req("/api/v1/games/5/similar", VERSION),
      ctx({ id: "5" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    const body = v1SimilarGamesSchema.parse(await response.json());
    expect(body.results.map((item) => item.id)).toEqual([3, 7]);
  });

  it("makes no batch read with no similar ids", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { id: 5, similarGameIds: [] },
    });
    const response = await getSimilar(
      req("/api/v1/games/5/similar", VERSION),
      ctx({ id: "5" }),
    );
    expect(v1SimilarGamesSchema.parse(await response.json()).results).toEqual(
      [],
    );
    expect(getGamesByIds).not.toHaveBeenCalled();
  });

  it("refuses a bad id before any read", async () => {
    const response = await getSimilar(
      req("/api/v1/games/abc/similar", VERSION),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(400);
    expect(loadGame).not.toHaveBeenCalled();
    expect(getGamesByIds).not.toHaveBeenCalled();
  });

  it("answers 404 for a hidden game and 502 when IGDB fails", async () => {
    loadGame.mockResolvedValue({ kind: "not_found" });
    const missing = await getSimilar(
      req("/api/v1/games/5/similar", VERSION),
      ctx({ id: "5" }),
    );
    expect(missing.status).toBe(404);

    loadGame.mockResolvedValue({
      kind: "found",
      game: { id: 5, similarGameIds: [3] },
    });
    getGamesByIds.mockRejectedValue(new FakeIgdbError("down"));
    const failed = await getSimilar(
      req("/api/v1/games/5/similar", VERSION),
      ctx({ id: "5" }),
    );
    expect(failed.status).toBe(502);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
  });
});
