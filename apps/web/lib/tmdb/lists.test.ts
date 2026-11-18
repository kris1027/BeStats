import { afterEach, describe, expect, it } from "vitest";
import { installFetchMock, restoreFetchMock } from "./__fixtures__/helpers";
import { fetchMovieList, fetchTvList } from "./lists";
import type { MovieListKind, TvListKind } from "./types";

/**
 * covers: spec 0021, AC-2, AC-8
 *
 * Each list kind reads its own endpoint, and only the date based lists carry
 * a place: `timezone` on two TV lists, `region` on two movie lists. An adult
 * result is dropped while TMDB's totals pass through unchanged.
 */

afterEach(restoreFetchMock);

function movie(id: number, adult?: boolean) {
  return {
    id,
    title: `Movie ${id}`,
    poster_path: null,
    release_date: "2026-10-01",
    overview: null,
    vote_average: 7,
    vote_count: 100,
    genre_ids: [18],
    ...(adult === undefined ? {} : { adult }),
  };
}

function show(id: number, adult?: boolean) {
  return {
    id,
    name: `Show ${id}`,
    poster_path: null,
    first_air_date: "2026-01-01",
    overview: null,
    vote_average: 8,
    vote_count: 50,
    genre_ids: [18],
    ...(adult === undefined ? {} : { adult }),
  };
}

function paged<T>(results: T[]) {
  return { page: 1, results, total_pages: 42, total_results: 830 };
}

describe("fetchTvList (AC-2)", () => {
  it.each<[TvListKind, string, string | null]>([
    ["trending", "/3/trending/tv/week", null],
    ["airing_today", "/3/tv/airing_today", "Europe/Warsaw"],
    ["on_the_air", "/3/tv/on_the_air", "Europe/Warsaw"],
    ["top_rated", "/3/tv/top_rated", null],
  ])(
    "reads %s from %s with timezone %s and no region",
    async (kind, path, timezone) => {
      const fetchMock = installFetchMock([{ body: paged([show(1)]) }]);

      await fetchTvList(kind, { page: 3 });

      const params = fetchMock.url().searchParams;
      expect(fetchMock.url().pathname).toBe(path);
      expect(params.get("timezone")).toBe(timezone);
      expect(params.has("region")).toBe(false);
      expect(params.get("page")).toBe("3");
      expect(params.get("language")).toBe("en-US");
    },
  );

  it("asks for page 1 when no page is given", async () => {
    const fetchMock = installFetchMock([{ body: paged([]) }]);

    await fetchTvList("top_rated");

    expect(fetchMock.url().searchParams.get("page")).toBe("1");
  });

  it("drops a result flagged adult and keeps TMDB's totals (AC-8)", async () => {
    installFetchMock([
      { body: paged([show(1), show(2, true), show(3, false)]) },
    ]);

    const list = await fetchTvList("trending");

    expect(list.results.map((item) => item.id)).toEqual([1, 3]);
    expect(list.results[0]?.name).toBe("Show 1");
    expect(list.totalPages).toBe(42);
    expect(list.totalResults).toBe(830);
  });

  it("refuses a page that is not a positive integer before any request", async () => {
    const fetchMock = installFetchMock([{ body: paged([]) }]);

    const error = await fetchTvList("trending", { page: 0 }).catch((e) => e);

    expect(error.kind).toBe("bad_response");
    expect(fetchMock.attempts).toBe(0);
  });
});

describe("fetchMovieList (AC-2)", () => {
  it.each<[MovieListKind, string, string | null]>([
    ["trending", "/3/trending/movie/week", null],
    ["now_playing", "/3/movie/now_playing", "PL"],
    ["upcoming", "/3/movie/upcoming", "PL"],
    ["top_rated", "/3/movie/top_rated", null],
  ])(
    "reads %s from %s with region %s and no timezone",
    async (kind, path, region) => {
      const fetchMock = installFetchMock([{ body: paged([movie(1)]) }]);

      await fetchMovieList(kind, { page: 2 });

      const params = fetchMock.url().searchParams;
      expect(fetchMock.url().pathname).toBe(path);
      expect(params.get("region")).toBe(region);
      expect(params.has("timezone")).toBe(false);
      expect(params.get("page")).toBe("2");
    },
  );

  it("drops a result flagged adult and keeps TMDB's totals (AC-8)", async () => {
    installFetchMock([{ body: paged([movie(1, true), movie(2)]) }]);

    const list = await fetchMovieList("now_playing");

    expect(list.results.map((item) => item.id)).toEqual([2]);
    expect(list.results[0]?.releaseDate).toBe("2026-10-01");
    expect(list.totalPages).toBe(42);
    expect(list.totalResults).toBe(830);
  });
});
