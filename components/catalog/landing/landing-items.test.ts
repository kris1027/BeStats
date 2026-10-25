import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0028, AC-3, AC-6, AC-8, AC-11
 *
 * The one place a tagged list page becomes the landing's `LandingItem`s, and
 * the read every landing section shares. A game's cover is its poster, its
 * IGDB art its backdrop and its rating IGDB's; a failed TMDB or IGDB read is
 * one section's null, and anything else is a bug that surfaces. The list read
 * is replaced; both error classes are the real ones.
 */
const read = vi.fn();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/igdb", async () => ({
  IgdbError: (await import("@/lib/igdb/errors")).IgdbError,
}));
vi.mock("@/lib/tmdb", async () => ({
  TmdbError: (await import("@/lib/tmdb/errors")).TmdbError,
}));
vi.mock("@/lib/catalog-list-read", () => ({
  readTaggedCatalogList: (...args: unknown[]) => read(...args),
}));

const { IgdbError, IgdbValidationError } = await import("@/lib/igdb/errors");
const { TmdbError } = await import("@/lib/tmdb/errors");
const { catalogList } = await import("@/lib/catalog/lists");
const { itemIds, landingItems, newLandingItems, readLandingList } =
  await import("./landing-items");

type Page = Parameters<typeof landingItems>[0];

function game(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Game ${id}`,
    coverUrl: `https://images.igdb.com/igdb/image/upload/t_cover_big/c${id}.jpg`,
    artUrl: `https://images.igdb.com/igdb/image/upload/t_1080p/a${id}.jpg`,
    releaseDate: "2026-11-19",
    releaseYear: 2026,
    communityRating: 8.4,
    communityRatingCount: 250,
    genreIds: [12, 31],
    platformIds: [6],
    hidden: false,
    ...extra,
  };
}

function gamePage(results: unknown[]): Page {
  return {
    mediaType: "game",
    paged: {
      page: 1,
      results,
      hasNextPage: false,
      totalResults: results.length,
    },
  } as Page;
}

function moviePage(results: unknown[]): Page {
  return {
    mediaType: "movie",
    paged: { page: 1, results, totalPages: 1, totalResults: results.length },
  } as Page;
}

function tvPage(results: unknown[]): Page {
  return {
    mediaType: "tv",
    paged: { page: 1, results, totalPages: 1, totalResults: results.length },
  } as Page;
}

afterEach(() => read.mockReset());

describe("landingItems", () => {
  it("draws a game from its cover, its IGDB art and IGDB's rating (AC-6, AC-8)", () => {
    const [item] = landingItems(gamePage([game(1942)]), 0, 1);

    expect(item).toEqual({
      mediaType: "game",
      id: 1942,
      title: "Game 1942",
      href: "/games/1942",
      posterUrl: game(1942).coverUrl,
      backdropUrl: game(1942).artUrl,
      rating: { source: "igdb", value: 8.4 },
      releaseDate: "2026-11-19",
      year: 2026,
      genreIds: [12, 31],
    });
  });

  it("keeps a game's missing art, date and rating as nulls, never invented", () => {
    const [item] = landingItems(
      gamePage([
        game(7, {
          coverUrl: null,
          artUrl: null,
          releaseDate: null,
          releaseYear: null,
          communityRating: null,
        }),
      ]),
      0,
      1,
    );

    expect(item).toMatchObject({
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
      year: null,
      rating: { source: "igdb", value: null },
    });
  });

  it("labels a movie's rating as TMDB's and links it under /movies", () => {
    const [item] = landingItems(
      moviePage([
        {
          id: 550,
          title: "Fight Club",
          posterUrl: null,
          backdropUrl: null,
          releaseDate: "1999-10-15",
          releaseYear: 1999,
          tmdbRating: 8.4,
          genreIds: [18],
        },
      ]),
      0,
      1,
    );

    expect(item).toMatchObject({
      mediaType: "movie",
      href: "/movies/550",
      rating: { source: "tmdb", value: 8.4 },
      releaseDate: "1999-10-15",
    });
  });

  it("gives a show no release date and its first air year", () => {
    const [item] = landingItems(
      tvPage([
        {
          id: 1399,
          name: "Game of Thrones",
          posterUrl: null,
          backdropUrl: null,
          firstAirYear: 2011,
          tmdbRating: 8.5,
          genreIds: [],
        },
      ]),
      0,
      1,
    );

    expect(item).toMatchObject({
      mediaType: "tv",
      href: "/shows/1399",
      releaseDate: null,
      year: 2011,
      rating: { source: "tmdb", value: 8.5 },
    });
  });

  it("takes only the titles from start up to end, in IGDB's order", () => {
    const page = gamePage([1, 2, 3, 4, 5].map((id) => game(id)));

    expect(itemIds(landingItems(page, 1, 3))).toEqual([2, 3]);
  });

  it("returns nothing for an empty page", () => {
    expect(landingItems(gamePage([]), 0, 9)).toEqual([]);
  });
});

describe("newLandingItems", () => {
  it("skips games already shown and still fills its count", () => {
    const page = gamePage([1, 2, 3, 4, 5].map((id) => game(id)));

    expect(itemIds(newLandingItems(page, [2, 3], 3))).toEqual([1, 4, 5]);
  });

  it("returns fewer than the count when the page runs out, never padding (AC-3)", () => {
    const page = gamePage([1, 2].map((id) => game(id)));

    expect(itemIds(newLandingItems(page, [], 10))).toEqual([1, 2]);
  });
});

describe("readLandingList (AC-3, AC-11)", () => {
  const TRENDING = catalogList("game", "trending");

  it("reads the list's page, page 1 by default", async () => {
    const page = gamePage([game(1)]);
    read.mockResolvedValue(page);

    await expect(readLandingList(TRENDING)).resolves.toBe(page);
    expect(read).toHaveBeenCalledWith(TRENDING, 1);
  });

  it("asks for the page it is given", async () => {
    read.mockResolvedValue(gamePage([]));

    await readLandingList(TRENDING, 2);

    expect(read).toHaveBeenCalledWith(TRENDING, 2);
  });

  it.each([
    ["an IGDB failure", () => new IgdbError("timeout", "games", "timed out")],
    [
      "a TMDB failure",
      () => new TmdbError("upstream", "/trending/movie/day", "down", 502),
    ],
  ])(
    "answers %s with null, so only that section fails",
    async (_name, make) => {
      read.mockRejectedValue(make());

      await expect(readLandingList(TRENDING)).resolves.toBeNull();
    },
  );

  it("rethrows an IGDB validation error, a bug rather than an outage", async () => {
    read.mockRejectedValue(new IgdbValidationError("page", "bad page"));

    await expect(readLandingList(TRENDING)).rejects.toBeInstanceOf(
      IgdbValidationError,
    );
  });

  it("rethrows any other error", async () => {
    read.mockRejectedValue(new TypeError("boom"));

    await expect(readLandingList(TRENDING)).rejects.toThrow("boom");
  });
});
