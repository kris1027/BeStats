import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import genres from "./__fixtures__/genres.json";
import {
  installIgdbMock,
  restoreIgdbMock,
  settle,
} from "./__fixtures__/helpers";
import searchWitcher from "./__fixtures__/search-witcher.json";
import { catalogWhereClause } from "./catalog-filter";
import { fetchDiscoverGames as fetchValidDiscoverGames } from "./discover";
import { IgdbValidationError } from "./errors";
import { fetchGameGenres, fetchGamePlatforms } from "./reference";
import { fetchSearchGames as fetchValidSearchGames } from "./search";
import type { DiscoverGamesOptions, SearchGamesOptions } from "./types";
import { validateDiscoverOptions, validateSearchOptions } from "./validation";

/** The inner read, given the input `reads.ts` would check first. */
const fetchSearchGames = async (options: SearchGamesOptions) =>
  fetchValidSearchGames(validateSearchOptions(options));
/** The inner read, given the input `reads.ts` would check first. */
const fetchDiscoverGames = async (options: DiscoverGamesOptions) =>
  fetchValidDiscoverGames(validateDiscoverOptions(options));

/**
 * Search, discover and the reference lists (spec 0023, AC-10, AC-12 to
 * AC-14). The bodies are asserted as written, because what IGDB is asked is
 * the whole guarantee that every result meets every filter.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

const FILTER = `(${catalogWhereClause()})`;

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Game ${index + 1}`,
  }));
}

describe("fetchSearchGames", () => {
  it("searches in relevance order with the catalog filter and no sort", async () => {
    const mock = installIgdbMock({
      igdb: [{ body: searchWitcher, headers: { "x-count": "5" } }],
    });

    const { value } = await settle(fetchSearchGames({ query: " witcher " }));

    expect(mock.body()).toBe(
      `search "witcher"; fields name,cover.image_id,first_release_date,rating,rating_count,genres,platforms,themes,game_type,version_parent; where ${FILTER}; limit 21;`,
    );
    expect(value?.results.map((game) => game.id)).toEqual(
      searchWitcher.map((game) => game.id),
    );
    expect(value).toMatchObject({
      page: 1,
      hasNextPage: false,
      totalResults: 5,
    });
  });

  it("adds every filter to the same query", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [] }] });

    await settle(
      fetchSearchGames({
        query: "zelda",
        genreIds: [31, 12, 12],
        platformIds: [130],
        year: 2017,
        minRating: 7.5,
        page: 3,
      }),
    );

    const from = Date.UTC(2017, 0, 1) / 1000;
    const to = Date.UTC(2018, 0, 1) / 1000;
    expect(mock.body()).toContain(
      `where ${FILTER} & (genres = (12,31)) & (platforms = (130)) & (rating >= 75) & (first_release_date >= ${from} & first_release_date < ${to}); limit 21; offset 40;`,
    );
  });

  it("asks for 21, returns 20, and knows there is a next page", async () => {
    installIgdbMock({ igdb: [{ body: rows(21) }] });
    const { value } = await settle(fetchSearchGames({ query: "game" }));
    expect(value?.results).toHaveLength(20);
    expect(value?.hasNextPage).toBe(true);
    expect(value?.totalResults).toBeNull();
  });

  it("drops a result without an id or name", async () => {
    installIgdbMock({ igdb: [{ body: [{ id: 1 }, ...rows(2)] }] });
    const { value } = await settle(fetchSearchGames({ query: "game" }));
    expect(value?.results.map((game) => game.id)).toEqual([1, 2]);
  });

  it("writes a minimum rating of 0 as no minimum", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [] }] });
    await settle(fetchSearchGames({ query: "game", minRating: 0 }));
    expect(mock.body()).not.toContain("rating >=");
  });

  it.each([
    [{ query: "" }, "query"],
    [{ query: "a", page: 51 }, "page"],
    [{ query: "a", page: 0 }, "page"],
    [
      { query: "a", genreIds: Array.from({ length: 21 }, (_, i) => i + 1) },
      "genreIds",
    ],
    [{ query: "a", platformIds: [1.5] }, "platformIds"],
    [{ query: "a", year: 1949 }, "year"],
    [{ query: "a", year: new Date().getUTCFullYear() + 6 }, "year"],
    [{ query: "a", minRating: 11 }, "minRating"],
  ])("refuses %j before any request", async (options, field) => {
    const mock = installIgdbMock();
    const error = await fetchSearchGames(options).catch((caught) => caught);
    expect(error).toBeInstanceOf(IgdbValidationError);
    expect((error as IgdbValidationError).field).toBe(field);
    expect(mock.mock).not.toHaveBeenCalled();
  });
});

describe("fetchDiscoverGames", () => {
  it.each([
    ["rating_desc", "rating desc", "rating != null"],
    ["rating_count_desc", "rating_count desc", "rating_count != null"],
    ["release_desc", "first_release_date desc", "first_release_date != null"],
    ["release_asc", "first_release_date asc", "first_release_date != null"],
    ["hypes_desc", "hypes desc", "hypes != null"],
  ] as const)(
    "sorts %s and requires its field",
    async (sort, clause, required) => {
      const mock = installIgdbMock({ igdb: [{ body: [] }] });
      await settle(fetchDiscoverGames({ sort }));
      expect(mock.body()).toContain(`(${required}); sort ${clause}; limit 21;`);
      expect(mock.body()).not.toContain("search");
    },
  );

  it("reads the date window as inclusive UTC days", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [] }] });

    await settle(
      fetchDiscoverGames({
        sort: "release_desc",
        releasedFrom: "2026-08-18",
        releasedTo: "2026-10-17",
        minRatingCount: 10,
        minHypes: 5,
      }),
    );

    const from = Date.UTC(2026, 7, 18) / 1000;
    const toExclusive = Date.UTC(2026, 9, 18) / 1000;
    expect(mock.body()).toContain(
      `(first_release_date >= ${from}) & (first_release_date < ${toExclusive}) & (rating_count >= 10) & (hypes >= 5)`,
    );
  });

  it.each([
    [{ sort: "newest" }, "sort"],
    [{ sort: "rating_desc", releasedFrom: "2026-02-30" }, "releasedFrom"],
    [{ sort: "rating_desc", releasedTo: "17-10-2026" }, "releasedTo"],
    [
      {
        sort: "rating_desc",
        releasedFrom: "2026-10-18",
        releasedTo: "2026-10-17",
      },
      "releasedFrom",
    ],
    [{ sort: "rating_desc", minRatingCount: -1 }, "minRatingCount"],
    [{ sort: "rating_desc", minHypes: 0.5 }, "minHypes"],
  ])("refuses %j before any request", async (options, field) => {
    const mock = installIgdbMock();
    const error = await fetchDiscoverGames(
      options as Parameters<typeof fetchDiscoverGames>[0],
    ).catch((caught) => caught);
    expect((error as IgdbValidationError).field).toBe(field);
    expect(mock.mock).not.toHaveBeenCalled();
  });
});

describe("the reference lists", () => {
  it("reads genres in one request, sorted by name", async () => {
    const mock = installIgdbMock({
      igdb: [{ body: [...genres].reverse() }],
    });

    const { value } = await settle(fetchGameGenres());

    expect(mock.igdbCalls[0].url).toBe("https://api.igdb.com/v4/genres");
    expect(mock.body()).toBe("fields name; sort name asc; limit 500;");
    expect(value).toHaveLength(genres.length);
    const names = value?.map((genre) => genre.name) ?? [];
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("reads platforms from their own endpoint and drops nameless rows", async () => {
    const mock = installIgdbMock({
      igdb: [{ body: [{ id: 6, name: "PC (Microsoft Windows)" }, { id: 3 }] }],
    });
    const { value } = await settle(fetchGamePlatforms());
    expect(mock.igdbCalls[0].url).toBe("https://api.igdb.com/v4/platforms");
    expect(value).toEqual([{ id: 6, name: "PC (Microsoft Windows)" }]);
  });
});
