import { afterEach, describe, expect, it } from "vitest";
import { restoreFetchMock } from "./__fixtures__/helpers";
import { fetchMoviesByIds, fetchTvShowsByIds } from "./batch";
import { mapWithConcurrency } from "./concurrency";
import { TMDB_CONCURRENCY_LIMIT } from "./constants";
import { TmdbError } from "./errors";
import { fetchShowEpisodes } from "./show-episodes";
import type { Movie, SeasonDetail, TvShow } from "./types";

/**
 * The batch helpers and `getShowEpisodes`, driven through injected readers so
 * no network is involved. The readers are the same seam the cached wrappers
 * use, so what is tested here is what runs in production.
 */

afterEach(restoreFetchMock);

function movie(id: number): Movie {
  return {
    id,
    title: `Movie ${id}`,
    posterUrl: null,
    releaseDate: null,
    releaseYear: null,
    overview: null,
    overviewLanguage: null,
    adult: false,
    tmdbRating: null,
    tmdbVoteCount: 0,
    backdropUrl: null,
    originalTitle: `Movie ${id}`,
    originalLanguage: "en",
    tagline: null,
    runtimeMinutes: null,
    genres: [],
    cast: [],
  };
}

function show(id: number, seasonNumbers: number[]): TvShow {
  return {
    id,
    name: `Show ${id}`,
    posterUrl: null,
    firstAirDate: null,
    firstAirYear: null,
    overview: null,
    tmdbRating: null,
    tmdbVoteCount: 0,
    backdropUrl: null,
    status: "Ended",
    inProduction: false,
    lastAirDate: null,
    numberOfSeasons: seasonNumbers.filter((n) => n !== 0).length,
    numberOfEpisodes: 0,
    genres: [],
    cast: [],
    seasons: seasonNumbers.map((seasonNumber) => ({
      seasonNumber,
      name: `Season ${seasonNumber}`,
      episodeCount: 2,
      airDate: null,
      posterUrl: null,
      isSpecials: seasonNumber === 0,
    })),
  };
}

function season(showId: number, seasonNumber: number): SeasonDetail {
  return {
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: null,
    airDate: null,
    posterUrl: null,
    episodes: [2, 1].map((episodeNumber) => ({
      id: seasonNumber * 100 + episodeNumber,
      showId,
      seasonNumber,
      episodeNumber,
      name: `S${seasonNumber}E${episodeNumber}`,
      overview: null,
      airDate: null,
      stillUrl: null,
      runtimeMinutes: null,
      tmdbRating: null,
    })),
  };
}

describe("mapWithConcurrency", () => {
  it("never exceeds the cap and keeps results in input order", async () => {
    let inFlight = 0;
    let peak = 0;

    const results = await mapWithConcurrency(
      Array.from({ length: 25 }, (_, index) => index),
      TMDB_CONCURRENCY_LIMIT,
      async (value) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return value * 2;
      },
    );

    expect(peak).toBeLessThanOrEqual(TMDB_CONCURRENCY_LIMIT);
    expect(results[0]).toBe(0);
    expect(results[24]).toBe(48);
  });
});

describe("fetchMoviesByIds", () => {
  it("returns what was found and reports what TMDB no longer has", async () => {
    let peak = 0;
    let inFlight = 0;

    const result = await fetchMoviesByIds([1, 2, 3], async (id) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      if (id === 2) {
        throw new TmdbError("not_found", `/movie/${id}`, "gone", 404);
      }
      return movie(id);
    });

    expect(result.found.map((item) => item.id)).toEqual([1, 3]);
    expect(result.missingIds).toEqual([2]);
    expect(peak).toBeLessThanOrEqual(TMDB_CONCURRENCY_LIMIT);
    // The summary shape only: detail fields do not leak through a list read.
    expect(Object.keys(result.found[0]).sort()).toEqual(
      [
        "id",
        "overview",
        "posterUrl",
        "releaseDate",
        "releaseYear",
        "title",
        "tmdbRating",
        "tmdbVoteCount",
      ].sort(),
    );
  });

  it("raises on a rejected credential rather than returning a short list", async () => {
    const failing = fetchMoviesByIds([1, 2], async (id) => {
      if (id === 2) {
        throw new TmdbError("unauthorized", `/movie/${id}`, "denied", 401);
      }
      return movie(id);
    });

    await expect(failing).rejects.toBeInstanceOf(TmdbError);
  });

  it("raises when a rate limit survived the retry budget", async () => {
    const failing = fetchTvShowsByIds([9], async () => {
      throw new TmdbError("rate_limited", "/tv/9", "slow down", 429);
    });

    await expect(failing).rejects.toMatchObject({ kind: "rate_limited" });
  });
});

describe("fetchShowEpisodes", () => {
  it("returns every regular episode in order, excluding season 0", async () => {
    const readSeasons: number[] = [];

    const result = await fetchShowEpisodes(1, {
      readTvShow: async (id) => show(id, [0, 1, 2, 3]),
      readSeason: async (showId, seasonNumber) => {
        readSeasons.push(seasonNumber);
        return season(showId, seasonNumber);
      },
    });

    expect(readSeasons.sort()).toEqual([1, 2, 3]);
    expect(result.complete).toBe(true);
    expect(result.failedSeasonNumbers).toEqual([]);
    expect(
      result.episodes.map((e) => `${e.seasonNumber}x${e.episodeNumber}`),
    ).toEqual(["1x1", "1x2", "2x1", "2x2", "3x1", "3x2"]);
    expect(result.episodes.every((episode) => episode.showId === 1)).toBe(true);
  });

  it("reports a partial read honestly instead of raising", async () => {
    const result = await fetchShowEpisodes(1, {
      readTvShow: async (id) => show(id, [0, 1, 2]),
      readSeason: async (showId, seasonNumber) => {
        if (seasonNumber === 2) {
          throw new TmdbError("upstream", "/tv/1/season/2", "boom", 500);
        }
        return season(showId, seasonNumber);
      },
    });

    // False is what lets scope feature 16 refuse to complete a show on partial
    // metadata, so the successfully read episodes still come back.
    expect(result.complete).toBe(false);
    expect(result.failedSeasonNumbers).toEqual([2]);
    expect(result.episodes).toHaveLength(2);
  });

  it("raises when the show itself does not exist", async () => {
    const failing = fetchShowEpisodes(1, {
      readTvShow: async () => {
        throw new TmdbError("not_found", "/tv/1", "gone", 404);
      },
    });

    await expect(failing).rejects.toMatchObject({ kind: "not_found" });
  });

  it("returns an empty, complete result for a show with no regular seasons", async () => {
    const result = await fetchShowEpisodes(1, {
      readTvShow: async (id) => show(id, [0]),
      readSeason: async () => {
        throw new Error("should not be called");
      },
    });

    expect(result.episodes).toEqual([]);
    expect(result.complete).toBe(true);
  });
});
