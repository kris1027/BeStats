import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameSummary, Paged } from "@/lib/igdb";

/**
 * covers: spec 0029, AC-1, AC-2, AC-4, AC-5, AC-8, AC-11, AC-12, AC-13
 *
 * The games branch of `SearchResults`, as `/search` renders it. The flag,
 * IGDB's reference lists and the one results read are the boundaries and are
 * replaced; the URL parser, the mode, the paging rules and every panel stay
 * real, so each test checks what the visitor would see for one URL. The TMDB
 * half and the session slots have their own suites and are stubbed out.
 */
const getGamesLibrary = vi.fn();
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  getGamesLibrary: () => getGamesLibrary(),
}));

class IgdbError extends Error {}
const getGameGenres = vi.fn();
const getGamePlatforms = vi.fn();
vi.mock("@/lib/igdb", () => ({
  IgdbError,
  getGameGenres: () => getGameGenres(),
  getGamePlatforms: () => getGamePlatforms(),
}));

const readGameSearchPage = vi.fn();
vi.mock("@/lib/search/game-read", () => ({
  readGameSearchPage: (...args: unknown[]) => readGameSearchPage(...args),
}));

const getMovieGenres = vi.fn();
vi.mock("@/lib/tmdb", () => ({
  TmdbError: class extends Error {},
  getMovieGenres: () => getMovieGenres(),
  getTvGenres: vi.fn(),
}));
const readSearchGridPage = vi.fn();
vi.mock("@/lib/search/read", () => ({
  readSearchGridPage: (...args: unknown[]) => readSearchGridPage(...args),
}));
vi.mock("@/lib/search/scan", () => ({ scanFilteredSearch: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-26",
}));
vi.mock("@/components/tracking/movie-card-slots", () => ({
  MovieCardBadge: () => null,
  MovieCardControls: () => null,
}));
vi.mock("@/components/tracking/show-card-slots", () => ({
  ShowCardBadge: () => null,
  ShowCardControls: () => null,
  ShowCardMeta: () => null,
}));

const { SearchResults } = await import("./search-results");

const GENRES = [
  { id: 8, name: "Platform" },
  { id: 12, name: "Role-playing (RPG)" },
];
const PLATFORMS = [
  { id: 130, name: "Nintendo Switch" },
  { id: 508, name: "Nintendo Switch 2" },
];

function game(id: number, extra: Partial<GameSummary> = {}): GameSummary {
  return {
    id,
    name: `Game ${id}`,
    coverUrl: null,
    artUrl: null,
    releaseDate: "2017-03-03",
    releaseYear: 2017,
    communityRating: 9.1,
    communityRatingCount: 120,
    genreIds: [],
    platformIds: [],
    hidden: false,
    ...extra,
  };
}

function paged(
  results: GameSummary[],
  totalResults: number | null,
  page = 1,
  hasNextPage = false,
): Paged<GameSummary> {
  return { page, results, totalResults, hasNextPage };
}

async function renderResults(
  raw: Record<string, string | string[] | undefined>,
) {
  return render(await SearchResults({ raw }));
}

beforeEach(() => {
  getGamesLibrary.mockReturnValue("on");
  getGameGenres.mockResolvedValue(GENRES);
  getGamePlatforms.mockResolvedValue(PLATFORMS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SearchResults for games", () => {
  it("shows IGDB's count, one card per game with its year and a link to the game page (AC-8, AC-12)", async () => {
    readGameSearchPage.mockResolvedValue(
      paged([game(1, { name: "Zelda" }), game(2)], 1234),
    );

    await renderResults({ type: "game", q: "zelda" });

    expect(screen.getByText("1,234 games")).toBeInTheDocument();
    const grid = screen.getByRole("list", { name: "Search results" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(2);
    const link = within(grid).getByRole("link", { name: /Zelda/ });
    expect(link).toHaveAttribute("href", "/games/1");
    expect(within(grid).getAllByText("2017")).toHaveLength(2);
    expect(readGameSearchPage).toHaveBeenCalledWith(
      "search",
      expect.objectContaining({ type: "game", q: "zelda", page: 1 }),
    );
  });

  it("names IGDB's Popular list when nothing is set (AC-4)", async () => {
    readGameSearchPage.mockResolvedValue(paged([game(1)], 500));

    await renderResults({ type: "game" });

    expect(screen.getByText("Popular games on IGDB")).toBeInTheDocument();
    expect(readGameSearchPage).toHaveBeenCalledWith(
      "browse",
      expect.anything(),
    );
  });

  it("reads discover with every filter when only filters are set (AC-5, AC-7)", async () => {
    readGameSearchPage.mockResolvedValue(paged([game(1)], 3));

    await renderResults({
      type: "game",
      genre: ["8", "12"],
      platform: ["130", "508"],
      rating: "7",
    });

    expect(readGameSearchPage).toHaveBeenCalledWith(
      "discover",
      expect.objectContaining({
        genreIds: [8, 12],
        platformIds: [130, 508],
        rating: 7,
      }),
    );
    expect(screen.getByText("3 games")).toBeInTheDocument();
  });

  it("leaves the count line out when IGDB sends no count, and still offers Next (AC-8)", async () => {
    readGameSearchPage.mockResolvedValue(paged([game(1)], null, 1, true));

    await renderResults({ type: "game", q: "zelda" });

    expect(screen.queryByText(/\d games/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/search?type=game&q=zelda&page=2",
    );
  });

  it("answers a page above IGDB's 50 before any results request (AC-8)", async () => {
    await renderResults({ type: "game", q: "zelda", page: "51" });

    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/search?type=game&q=zelda");
    expect(readGameSearchPage).not.toHaveBeenCalled();
  });

  it("answers a page past the last one IGDB counts with the same panel (AC-8)", async () => {
    readGameSearchPage.mockResolvedValue(paged([game(1)], 30, 7));

    await renderResults({ type: "game", q: "zelda", page: "7" });

    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Search results" })).toBeNull();
  });

  it("answers an empty later page as a missing page, not as no matches (AC-8)", async () => {
    readGameSearchPage.mockResolvedValue(paged([], null, 3));

    await renderResults({ type: "game", q: "zelda", page: "3" });

    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
  });

  it.each([
    [{ platform: "0" }, "platform"],
    [{ platform: "999" }, "platform"],
    [{ genre: "77" }, "genre"],
    [{ year: "1949" }, "year"],
    [{ q: "\u0001" }, "q"],
    [{ genre: Array.from({ length: 21 }, (_, i) => String(100 + i)) }, "genre"],
  ])(
    "names the invalid parameter in %o before any results request (AC-2)",
    async (extra, param) => {
      // Every one of the 21 ids is known, so only the cap of 20 refuses them.
      getGameGenres.mockResolvedValue([
        ...GENRES,
        ...Array.from({ length: 21 }, (_, i) => ({
          id: 100 + i,
          name: `G${i}`,
        })),
      ]);

      await renderResults({ type: "game", ...extra });

      expect(screen.getByText("That filter isn't valid")).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`“${param}”`))).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Clear filters" }),
      ).toHaveAttribute("href", "/search?type=game");
      expect(readGameSearchPage).not.toHaveBeenCalled();
    },
  );

  it("refuses a platform on a movie search (AC-2)", async () => {
    getMovieGenres.mockResolvedValue([]);

    await renderResults({ type: "movie", platform: "6" });

    expect(screen.getByText("That filter isn't valid")).toBeInTheDocument();
    expect(screen.getByText(/“platform”/)).toBeInTheDocument();
    expect(readSearchGridPage).not.toHaveBeenCalled();
  });

  it("offers next year and refuses the year after, by the UTC clock (AC-2)", async () => {
    vi.useFakeTimers({
      now: new Date("2026-12-31T23:30:00Z"),
      toFake: ["Date"],
    });
    try {
      readGameSearchPage.mockResolvedValue(paged([game(1)], 1));
      await renderResults({ type: "game", year: "2027" });
      expect(readGameSearchPage).toHaveBeenCalledTimes(1);

      await renderResults({ type: "game", year: "2028" });
      expect(screen.getByText("That filter isn't valid")).toBeInTheDocument();
      expect(readGameSearchPage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says IGDB could not be reached when the read fails, with Try again on the same URL (AC-13)", async () => {
    readGameSearchPage.mockRejectedValue(new IgdbError("timeout"));

    await renderResults({ type: "game", q: "zelda" });

    expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
    expect(
      screen.getByText("IGDB didn't respond. Try again in a moment."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/search?type=game&q=zelda",
    );
  });

  it("rethrows an error that is not IGDB's, so the route's error boundary sees it", async () => {
    readGameSearchPage.mockRejectedValue(new TypeError("bug"));

    await expect(
      SearchResults({ raw: { type: "game", q: "zelda" } }),
    ).rejects.toThrow("bug");
  });

  it("still searches when the platform list fails and the URL names no platform (AC-11)", async () => {
    getGamePlatforms.mockRejectedValue(new IgdbError("down"));
    readGameSearchPage.mockResolvedValue(paged([game(1)], 1));

    await renderResults({ type: "game", q: "zelda" });

    expect(screen.getByRole("list", { name: "Search results" })).toBeVisible();
  });

  it("says IGDB could not be reached when the platform list fails and the URL names a platform (AC-11)", async () => {
    getGamePlatforms.mockRejectedValue(new IgdbError("down"));

    await renderResults({ type: "game", q: "zelda", platform: "130" });

    expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
    expect(readGameSearchPage).not.toHaveBeenCalled();
  });

  it("says IGDB could not be reached when the genre list fails and the URL names a genre (AC-11)", async () => {
    getGameGenres.mockRejectedValue(new IgdbError("down"));

    await renderResults({ type: "game", genre: "8" });

    expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
  });

  it("names the query when a search finds nothing (AC-13)", async () => {
    readGameSearchPage.mockResolvedValue(paged([], 0));

    await renderResults({ type: "game", q: "zzzqqqxx" });

    expect(screen.getByText("No games match “zzzqqqxx”")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/search?type=game",
    );
  });

  it("names platforms in the games copy when filters find nothing (AC-13)", async () => {
    readGameSearchPage.mockResolvedValue(paged([], 0));

    await renderResults({ type: "game", platform: "508" });

    expect(
      screen.getByText("No games match these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Try fewer genres or platforms, another year or a lower rating.",
      ),
    ).toBeInTheDocument();
  });

  it("says the Popular list is empty without offering filters to clear (AC-4)", async () => {
    readGameSearchPage.mockResolvedValue(paged([], 0));

    await renderResults({ type: "game" });

    expect(screen.getByText("No popular games right now")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });
});

describe("SearchResults and the games flag (AC-1)", () => {
  it("refuses type=game while the games library is off, before any IGDB request", async () => {
    getGamesLibrary.mockReturnValue("off");

    await renderResults({ type: "game", q: "zelda" });

    expect(screen.getByText("That filter isn't valid")).toBeInTheDocument();
    expect(screen.getByText(/“type”/)).toBeInTheDocument();
    expect(getGameGenres).not.toHaveBeenCalled();
    expect(readGameSearchPage).not.toHaveBeenCalled();
  });

  it("never reads the flag for a movie search, so an invalid flag cannot break it", async () => {
    getGamesLibrary.mockImplementation(() => {
      throw new Error("invalid NEXT_PUBLIC_GAMES_LIBRARY");
    });
    getMovieGenres.mockResolvedValue([]);
    readSearchGridPage.mockResolvedValue({
      results: [],
      totalResults: 0,
      totalPages: 0,
    });

    await renderResults({ type: "movie", q: "dune" });

    expect(getGamesLibrary).not.toHaveBeenCalled();
    expect(screen.getByText("No movies match “dune”")).toBeInTheDocument();
  });
});
