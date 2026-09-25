import { afterEach, describe, expect, it, vi } from "vitest";

import type { MovieSummary, Paged, TvShowSummary } from "@/lib/tmdb/types";

import { emptySearchParams, type SearchParams } from "./params";

/** covers: spec 0010, AC-11, AC-12, AC-13, AC-16, AC-20 */

const tmdb = vi.hoisted(() => ({
  searchMovies: vi.fn(),
  searchTvShows: vi.fn(),
  discoverMovies: vi.fn(),
  discoverTvShows: vi.fn(),
}));

vi.mock("@/lib/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tmdb")>();
  return { ...actual, ...tmdb };
});

const { readDiscoverPage, readSearchPage, fromMovie, fromShow } = await import(
  "./read"
);

const MOVIE: MovieSummary = {
  id: 438631,
  title: "Dune",
  posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
  releaseDate: "2021-09-15",
  releaseYear: 2021,
  overview: "Paul Atreides...",
  tmdbRating: 7.8,
  tmdbVoteCount: 12000,
  genreIds: [878, 12],
} as MovieSummary;

const SHOW: TvShowSummary = {
  id: 90228,
  name: "Dune: Prophecy",
  posterUrl: null,
  firstAirDate: "2024-11-17",
  firstAirYear: 2024,
  overview: null,
  tmdbRating: null,
  tmdbVoteCount: 3,
  genreIds: [10765],
} as TvShowSummary;

function paged<T>(results: T[]): Paged<T> {
  return { page: 2, results, totalPages: 7, totalResults: 133 };
}

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return { ...emptySearchParams("tv"), ...overrides };
}

afterEach(() => {
  for (const fn of Object.values(tmdb)) fn.mockReset();
});

describe("fromMovie and fromShow", () => {
  it("reads a movie's title and release year into the shared shape", () => {
    expect(fromMovie(MOVIE)).toEqual({
      id: 438631,
      title: "Dune",
      year: 2021,
      posterUrl: "https://image.tmdb.org/t/p/w500/dune.jpg",
      tmdbRating: 7.8,
      tmdbVoteCount: 12000,
      genreIds: [878, 12],
    });
  });

  it("reads a show's name and first air year, keeping missing values null", () => {
    expect(fromShow(SHOW)).toEqual({
      id: 90228,
      title: "Dune: Prophecy",
      year: 2024,
      posterUrl: null,
      tmdbRating: null,
      tmdbVoteCount: 3,
      genreIds: [10765],
    });
  });
});

describe("readSearchPage", () => {
  it("asks movie search with the year and page, and keeps TMDB's envelope", async () => {
    tmdb.searchMovies.mockResolvedValue(paged([MOVIE]));

    const page = await readSearchPage("movie", "dune", {
      year: 2021,
      page: 2,
    });

    expect(tmdb.searchMovies).toHaveBeenCalledWith("dune", {
      year: 2021,
      page: 2,
    });
    expect(tmdb.searchTvShows).not.toHaveBeenCalled();
    expect(page).toMatchObject({ page: 2, totalPages: 7, totalResults: 133 });
    expect(page.results[0]?.title).toBe("Dune");
  });

  it("asks TV search for a show and maps its name to the title", async () => {
    tmdb.searchTvShows.mockResolvedValue(paged([SHOW]));

    const page = await readSearchPage("tv", "dune", { page: 1 });

    expect(tmdb.searchTvShows).toHaveBeenCalledWith("dune", { page: 1 });
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
    expect(page.results[0]?.title).toBe("Dune: Prophecy");
  });

  it("lets a TMDB failure through unchanged", async () => {
    const failure = new Error("upstream");
    tmdb.searchTvShows.mockRejectedValue(failure);

    await expect(readSearchPage("tv", "dune", { page: 1 })).rejects.toBe(
      failure,
    );
  });
});

describe("readDiscoverPage", () => {
  it("browses with no filters and no vote floor", async () => {
    tmdb.discoverTvShows.mockResolvedValue(paged([SHOW]));

    await readDiscoverPage(params());

    expect(tmdb.discoverTvShows).toHaveBeenCalledWith({
      genreIds: [],
      year: undefined,
      minRating: undefined,
      minVoteCount: undefined,
      page: 1,
    });
  });

  it("sends every filter upstream, with the 100 vote floor beside a rating", async () => {
    tmdb.discoverMovies.mockResolvedValue(paged([MOVIE]));

    const page = await readDiscoverPage(
      params({
        type: "movie",
        genreIds: [12, 878],
        year: 2021,
        rating: 7,
        page: 3,
      }),
    );

    expect(tmdb.discoverMovies).toHaveBeenCalledWith({
      genreIds: [12, 878],
      year: 2021,
      minRating: 7,
      minVoteCount: 100,
      page: 3,
    });
    expect(tmdb.discoverTvShows).not.toHaveBeenCalled();
    expect(page.results[0]?.year).toBe(2021);
  });

  it("adds no vote floor when only a genre or a year is set", async () => {
    tmdb.discoverTvShows.mockResolvedValue(paged([]));

    await readDiscoverPage(params({ genreIds: [18], year: 2020 }));

    expect(tmdb.discoverTvShows).toHaveBeenCalledWith(
      expect.objectContaining({
        minRating: undefined,
        minVoteCount: undefined,
      }),
    );
  });
});
