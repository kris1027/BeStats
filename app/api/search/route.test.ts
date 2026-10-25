import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IgdbError, IgdbValidationError } from "@/lib/igdb/errors";
import { TmdbError } from "@/lib/tmdb/errors";

/** covers: spec 0010, AC-20; spec 0029, AC-17 */

const readSearchPage = vi.hoisted(() => vi.fn());
const searchGames = vi.hoisted(() => vi.fn());
const games = vi.hoisted(() => ({ library: "on" as "on" | "off" }));

vi.mock("@/lib/search/read", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search/read")>();
  return { ...actual, readSearchPage };
});
vi.mock("@/lib/igdb", async () => {
  const errors = await import("@/lib/igdb/errors");
  return { ...errors, searchGames };
});
vi.mock("@/lib/env", () => ({
  getGamesLibrary: vi.fn(() => games.library),
}));

const { GET } = await import("./route");

function request(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/search?${query}`, { headers });
}

const PAGE = {
  page: 1,
  totalPages: 5,
  totalResults: 95,
  results: Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    title: `Dune ${index + 1}`,
    year: 2024,
    posterUrl: null,
    tmdbRating: 7.2,
    tmdbVoteCount: 300,
    genreIds: [18],
  })),
};

afterEach(() => {
  readSearchPage.mockReset();
  searchGames.mockReset();
  games.library = "on";
});

describe("GET /api/search", () => {
  it("answers five results and TMDB's total, cacheable by a CDN", async () => {
    readSearchPage.mockResolvedValue(PAGE);

    const response = await GET(request("type=tv&q=%20dune%20"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(readSearchPage).toHaveBeenCalledWith("tv", "dune", { page: 1 });
    const body = await response.json();
    expect(body.totalResults).toBe(95);
    expect(body.results).toHaveLength(5);
    expect(body.results[0]).toEqual({
      id: 1,
      title: "Dune 1",
      year: 2024,
      posterUrl: null,
      rating: 7.2,
      href: "/shows/1",
    });
  });

  it("links movie results to movie pages", async () => {
    readSearchPage.mockResolvedValue(PAGE);

    const body = await (await GET(request("type=movie&q=dune"))).json();

    expect(body.results[0].href).toBe("/movies/1");
  });

  it.each([
    "q=dune",
    "type=anime&q=dune",
    "type=tv",
    "type=tv&q=a",
    "type=tv&q=%20%20a%20",
    `type=tv&q=${"x".repeat(101)}`,
  ])("answers 400 for %s without asking TMDB", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "invalid" });
    expect(readSearchPage).not.toHaveBeenCalled();
  });

  it("asks TMDB with the trimmed query", async () => {
    readSearchPage.mockResolvedValue(PAGE);

    await GET(request("type=movie&q=%20%20dune%20"));

    expect(readSearchPage).toHaveBeenCalledWith("movie", "dune", { page: 1 });
  });

  it("lets an unexpected error through instead of dressing it as a TMDB failure", async () => {
    readSearchPage.mockRejectedValue(new TypeError("bug"));

    await expect(GET(request("type=tv&q=dune"))).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it("answers 502 with the failure kind when TMDB fails, never cached", async () => {
    readSearchPage.mockRejectedValue(
      new TmdbError("rate_limited", "/search/tv", "slow down", 429),
    );

    const response = await GET(request("type=tv&q=dune"));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "upstream",
      kind: "rate_limited",
    });
  });

  it("answers the same, with no Set-Cookie, when a session cookie is present", async () => {
    readSearchPage.mockResolvedValue(PAGE);

    const signedOut = await GET(request("type=tv&q=dune"));
    const signedIn = await GET(
      request("type=tv&q=dune", { cookie: "sb-project-auth-token=secret" }),
    );

    expect(signedIn.headers.get("set-cookie")).toBeNull();
    expect(await signedIn.json()).toEqual(await signedOut.json());
  });
});

describe("GET /api/search for games (spec 0029, AC-17)", () => {
  const GAMES = {
    page: 1,
    hasNextPage: true,
    totalResults: null,
    results: Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      name: `Zelda ${index + 1}`,
      coverUrl: null,
      releaseYear: index === 0 ? null : 1998,
      communityRating: 9.1,
    })),
  };

  it("answers five games from search page 1 with IGDB's count or null", async () => {
    searchGames.mockResolvedValue(GAMES);

    const response = await GET(request("type=game&q=zelda"));

    expect(response.status).toBe(200);
    expect(searchGames).toHaveBeenCalledWith({ query: "zelda", page: 1 });
    expect(readSearchPage).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.totalResults).toBeNull();
    expect(body.results).toHaveLength(5);
    expect(body.results[0]).toEqual({
      id: 1,
      title: "Zelda 1",
      year: null,
      posterUrl: null,
      rating: 9.1,
      href: "/games/1",
    });
  });

  it("answers 400 with the games library off, without asking IGDB", async () => {
    games.library = "off";
    const response = await GET(request("type=game&q=zelda"));
    expect(response.status).toBe(400);
    expect(searchGames).not.toHaveBeenCalled();
  });

  it("answers 400, never 500, for a query IGDB's cleaning refuses", async () => {
    searchGames.mockRejectedValue(
      new IgdbValidationError("query", "The search query is empty."),
    );
    const response = await GET(request("type=game&q=%01%01"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid" });
  });

  it("answers 502 with the kind when IGDB fails", async () => {
    searchGames.mockRejectedValue(new IgdbError("timeout", "games", "slow"));
    const response = await GET(request("type=game&q=zelda"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "upstream",
      kind: "timeout",
    });
  });
});
