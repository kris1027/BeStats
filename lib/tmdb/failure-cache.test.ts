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

vi.mock("next/cache", () => ({
  cacheLife: (profile: string) => cacheLife(profile),
}));
vi.mock("./movies", () => ({
  fetchMovie: (id: number) => fetchMovie(id),
}));
vi.mock("./search", () => ({
  fetchDiscoverMovies: (options: unknown) => fetchDiscoverMovies(options),
  fetchDiscoverTvShows: vi.fn(),
  fetchSearchMovies: vi.fn(),
  fetchSearchTvShows: vi.fn(),
}));

const { discoverMovies, getMovie } = await import("./reads");

afterEach(() => {
  cacheLife.mockReset();
  fetchMovie.mockReset();
  fetchDiscoverMovies.mockReset();
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
