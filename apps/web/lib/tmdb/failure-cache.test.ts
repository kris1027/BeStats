import { afterEach, describe, expect, it, vi } from "vitest";

import { isTmdbNotFound, TmdbError, type TmdbErrorKind } from "./errors";

/**
 * covers: spec 0006, AC-10
 *
 * `failureProfile` alone proves the rule; this proves the cached reads the two
 * movie routes use actually apply it. A "Try again" that replays a failure
 * pinned for minutes looks exactly like a working retry in review, and only
 * shows up once TMDB is down, so the wiring is pinned here.
 *
 * `cacheLife` is the boundary (it only means something inside Next), and the
 * fetchers are replaced so no request or retry delay is involved. Outside Next
 * the `use cache` directive is an inert string, so the scope runs every call.
 */
const cacheLife = vi.fn();
const fetchMovie = vi.fn();
const fetchDiscoverMovies = vi.fn();
const fetchTvShow = vi.fn();
const fetchShowCast = vi.fn();
const fetchSeason = vi.fn();
const fetchTvList = vi.fn();
const fetchMovieList = vi.fn();

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => cacheLife(profile),
}));
vi.mock("./movies", () => ({
  fetchMovie: (id: number) => fetchMovie(id),
}));
vi.mock("./tv", () => ({
  fetchTvShow: (id: number) => fetchTvShow(id),
  fetchShowCast: (id: number) => fetchShowCast(id),
  fetchSeason: (id: number, n: number) => fetchSeason(id, n),
}));
vi.mock("./lists", () => ({
  fetchTvList: (kind: string, options: unknown) => fetchTvList(kind, options),
  fetchMovieList: (kind: string, options: unknown) =>
    fetchMovieList(kind, options),
}));
vi.mock("./search", () => ({
  fetchDiscoverMovies: (options: unknown) => fetchDiscoverMovies(options),
  fetchDiscoverTvShows: vi.fn(),
  fetchSearchMovies: vi.fn(),
  fetchSearchTvShows: vi.fn(),
}));

const {
  discoverMovies,
  getMovie,
  getMovieList,
  getSeason,
  getShowCast,
  getTvList,
  getTvShow,
} = await import("./reads");

afterEach(() => {
  cacheLife.mockReset();
  fetchMovie.mockReset();
  fetchDiscoverMovies.mockReset();
  fetchTvShow.mockReset();
  fetchShowCast.mockReset();
  fetchSeason.mockReset();
  fetchTvList.mockReset();
  fetchMovieList.mockReset();
});

const TRANSIENT: TmdbErrorKind[] = ["timeout", "rate_limited", "upstream"];
const SETTLED: TmdbErrorKind[] = ["not_found", "unauthorized", "bad_response"];

describe("getMovie cache lifetime", () => {
  it("caches a movie for days", async () => {
    fetchMovie.mockResolvedValue({ id: 550, title: "Fight Club" });

    await getMovie(550);

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("days");
  });

  it.each(TRANSIENT)(
    "caches a %s failure for seconds, so Try again really retries",
    async (kind) => {
      fetchMovie.mockRejectedValue(new TmdbError(kind, "/movie/550", "x"));

      await expect(getMovie(550)).rejects.toBeInstanceOf(TmdbError);

      expect(cacheLife).toHaveBeenCalledExactlyOnceWith("seconds");
    },
  );

  it.each(SETTLED)("caches a %s failure for minutes", async (kind) => {
    fetchMovie.mockRejectedValue(new TmdbError(kind, "/movie/550", "x"));

    await expect(getMovie(550)).rejects.toBeInstanceOf(TmdbError);

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("minutes");
  });

  it("rebuilds the failure outside the scope with its kind intact", async () => {
    fetchMovie.mockRejectedValue(
      new TmdbError("not_found", "/movie/999", "gone", 404),
    );

    const error = await getMovie(999).catch((caught: unknown) => caught);

    expect(isTmdbNotFound(error)).toBe(true);
    expect(error).toMatchObject({ endpoint: "/movie/999", status: 404 });
  });
});

describe("discoverMovies cache lifetime (the landing grid)", () => {
  it("caches a page of results for minutes", async () => {
    fetchDiscoverMovies.mockResolvedValue({ page: 1, results: [] });

    await discoverMovies({ page: 1 });

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("minutes");
  });

  it.each(TRANSIENT)("caches a %s failure for seconds", async (kind) => {
    fetchDiscoverMovies.mockRejectedValue(
      new TmdbError(kind, "/discover/movie", "x"),
    );

    await expect(discoverMovies({ page: 3 })).rejects.toMatchObject({ kind });

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("seconds");
  });
});

/**
 * covers: spec 0009, AC-15, AC-20
 *
 * The show read drops to `hours` so a new season or status appears the same
 * day, the cast moves to its own `days` read, and the season keeps `hours`.
 * A TMDB outage on any of them must still be pinned for seconds only.
 */
describe("the show, cast and season cache lifetimes", () => {
  it("caches a show for hours, not days", async () => {
    fetchTvShow.mockResolvedValue({ id: 1396, name: "Breaking Bad" });

    await getTvShow(1396);

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it("caches a series cast for days", async () => {
    fetchShowCast.mockResolvedValue([]);

    await getShowCast(1396);

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("days");
  });

  it("caches a season for hours", async () => {
    fetchSeason.mockResolvedValue({ seasonNumber: 2, episodes: [] });

    await getSeason(1396, 2);

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it.each([
    ["getTvShow", () => getTvShow(1396), fetchTvShow],
    ["getShowCast", () => getShowCast(1396), fetchShowCast],
    ["getSeason", () => getSeason(1396, 2), fetchSeason],
  ] as const)(
    "%s caches a timeout for seconds and rethrows it as a TmdbError",
    async (_, read, fetcher) => {
      fetcher.mockRejectedValue(new TmdbError("timeout", "/tv/1396", "x"));

      await expect(read()).rejects.toMatchObject({ kind: "timeout" });

      expect(cacheLife).toHaveBeenCalledExactlyOnceWith("seconds");
    },
  );

  it("rebuilds a missing show as not found outside the scope", async () => {
    fetchTvShow.mockRejectedValue(
      new TmdbError("not_found", "/tv/999999999", "gone", 404),
    );

    const error = await getTvShow(999999999).catch((caught: unknown) => caught);

    expect(isTmdbNotFound(error)).toBe(true);
  });
});

/**
 * covers: spec 0021, AC-3, AC-17
 *
 * The landing rows' list reads live for `hours`, and a TMDB outage on one is
 * pinned for seconds only, so a row's Try again really retries. Each failure
 * comes back out of the scope as a `TmdbError`, which is what keeps it inside
 * its own row (AC-11).
 */
describe("the catalog list cache lifetimes", () => {
  it.each([
    ["getTvList", () => getTvList("trending", { page: 1 }), fetchTvList],
    [
      "getMovieList",
      () => getMovieList("now_playing", { page: 1 }),
      fetchMovieList,
    ],
  ] as const)("%s caches a page for hours", async (_, read, fetcher) => {
    fetcher.mockResolvedValue({ page: 1, results: [] });

    await read();

    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  it("passes the kind and page through to the fetcher", async () => {
    fetchTvList.mockResolvedValue({ page: 4, results: [] });
    fetchMovieList.mockResolvedValue({ page: 1, results: [] });

    await getTvList("airing_today", { page: 4 });
    await getMovieList("upcoming");

    expect(fetchTvList).toHaveBeenCalledWith("airing_today", { page: 4 });
    expect(fetchMovieList).toHaveBeenCalledWith("upcoming", {});
  });

  it.each(TRANSIENT)(
    "caches a %s list failure for seconds and rethrows it",
    async (kind) => {
      fetchTvList.mockRejectedValue(new TmdbError(kind, "/tv/top_rated", "x"));

      await expect(getTvList("top_rated", { page: 1 })).rejects.toMatchObject({
        kind,
      });

      expect(cacheLife).toHaveBeenCalledExactlyOnceWith("seconds");
    },
  );

  it.each(SETTLED)("caches a %s list failure for minutes", async (kind) => {
    fetchMovieList.mockRejectedValue(
      new TmdbError(kind, "/movie/top_rated", "x"),
    );

    const error = await getMovieList("top_rated", { page: 1 }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(TmdbError);
    expect(error).toMatchObject({ kind, endpoint: "/movie/top_rated" });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("minutes");
  });
});
