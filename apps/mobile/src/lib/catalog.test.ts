/**
 * covers: spec 0033, AC-13 (catalog keys sit outside the private root, so
 * sign out keeps them) and spec 0035, API surface (each public read goes to
 * its own `/api/v1` route, with no session).
 */
const mockApiRequest = jest.fn();
jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

import { emptySearchParams } from "@bestats/core/search/params";

import {
  CATALOG_QUERY_ROOT,
  catalogKeys,
  fetchGame,
  fetchGenres,
  fetchList,
  fetchSearch,
  fetchSeason,
  fetchShow,
} from "./catalog";
import { PRIVATE_QUERY_ROOT } from "./query-client";

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({});
});

/** The path and options of the one call a fetch made. */
function sent() {
  expect(mockApiRequest).toHaveBeenCalledTimes(1);
  const [path, , options] = mockApiRequest.mock.calls[0];
  return { path, options };
}

describe("catalogKeys", () => {
  test("every key starts with the catalog root, never the private one", () => {
    const keys = [
      catalogKeys.list("movie", "popular"),
      catalogKeys.search(emptySearchParams("tv")),
      catalogKeys.genres("game"),
      catalogKeys.show(1),
      catalogKeys.season(1, 2),
      catalogKeys.game(3),
      catalogKeys.movie(4),
    ];
    for (const key of keys) {
      expect(key[0]).toBe(CATALOG_QUERY_ROOT);
      expect(key[0]).not.toBe(PRIVATE_QUERY_ROOT);
    }
  });

  test("a movie and a show with the same TMDB id get different keys", () => {
    expect(catalogKeys.movie(42)).not.toEqual(catalogKeys.show(42));
  });

  test("a search key ignores the page, so every page shares one query", () => {
    const params = { ...emptySearchParams("movie"), q: "dune" };
    expect(catalogKeys.search({ ...params, page: 3 })).toEqual(
      catalogKeys.search(params),
    );
  });

  test("different filters give different search keys", () => {
    const base = emptySearchParams("movie");
    expect(catalogKeys.search({ ...base, year: 2021 })).not.toEqual(
      catalogKeys.search(base),
    );
  });
});

describe("public reads", () => {
  test("a list's first page sends no page param", () => {
    fetchList("movie", "popular", 1);
    expect(sent().path).toBe("/api/v1/lists/movie/popular");
  });

  test("a later list page sends its number", () => {
    fetchList("tv", "on-the-air", 3);
    expect(sent().path).toBe("/api/v1/lists/tv/on-the-air?page=3");
  });

  test("a list slug is URL encoded", () => {
    fetchList("game", "a/b c", 1);
    expect(sent().path).toBe("/api/v1/lists/game/a%2Fb%20c");
  });

  test("search sends the same query string the web's /search URL holds", () => {
    fetchSearch(
      { ...emptySearchParams("movie"), q: "dune", genreIds: [18, 12] },
      2,
    );
    expect(sent().path).toBe(
      "/api/v1/search?type=movie&q=dune&genre=12&genre=18&page=2",
    );
  });

  test("the page argument wins over the params' own page", () => {
    fetchSearch({ ...emptySearchParams("tv"), page: 5 }, 1);
    expect(sent().path).toBe("/api/v1/search?type=tv");
  });

  test("genres, show, season and game each hit their own route", () => {
    fetchGenres("game");
    fetchShow(1399);
    fetchSeason(1399, 0);
    fetchGame(7346);
    expect(mockApiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/genres?type=game",
      "/api/v1/shows/1399",
      "/api/v1/shows/1399/seasons/0",
      "/api/v1/games/7346",
    ]);
  });

  test("no public read asks for a session", () => {
    fetchList("movie", "popular", 1);
    fetchSearch(emptySearchParams("movie"), 1);
    fetchGenres("tv");
    fetchShow(1);
    fetchSeason(1, 1);
    fetchGame(1);
    for (const [, , options] of mockApiRequest.mock.calls) {
      expect(options?.auth).not.toBe(true);
    }
  });

  test("each read parses the answer with a schema", () => {
    fetchShow(1);
    const [, schema] = mockApiRequest.mock.calls[0];
    expect(typeof schema.parse).toBe("function");
  });
});
