import { describe, expect, it } from "vitest";

import type { Genre } from "@/lib/tmdb/types";

import { searchMode } from "./mode";
import {
  type CatalogRef,
  emptySearchParams,
  type GameSearchParams,
  hasAnyFilter,
  parseGameSearchParams,
  parseSearchParams,
  searchHref,
  type TmdbSearchParams,
} from "./params";

/** covers: spec 0010, AC-7, AC-18; spec 0029, AC-1 to AC-3 */

const TV_GENRES: Genre[] = [
  { id: 18, name: "Drama" },
  { id: 35, name: "Comedy" },
  { id: 10766, name: "Soap" },
];
const YEAR = 2026;

function parse(raw: Record<string, string | string[] | undefined>) {
  return parseSearchParams(raw, { genres: TV_GENRES }, YEAR);
}

function params(overrides: Partial<TmdbSearchParams> = {}): TmdbSearchParams {
  return { ...emptySearchParams("tv"), ...overrides };
}

/** Ids 1 to 30, so the 20 id cap can be passed. */
const GAME_GENRES: CatalogRef[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  name: `Genre ${index + 1}`,
}));
const PLATFORMS: CatalogRef[] = [
  { id: 6, name: "PC (Microsoft Windows)" },
  { id: 130, name: "Nintendo Switch" },
  { id: 508, name: "Nintendo Switch 2" },
  ...Array.from({ length: 30 }, (_, index) => ({
    id: 1000 + index,
    name: `Platform ${index}`,
  })),
];

function parseGame(
  raw: Record<string, string | string[] | undefined>,
  gamesEnabled = true,
) {
  return parseSearchParams(
    { type: "game", ...raw },
    { genres: GAME_GENRES, platforms: PLATFORMS },
    YEAR,
    { gamesEnabled },
  );
}

function gameParams(
  overrides: Partial<GameSearchParams> = {},
): GameSearchParams {
  return { ...emptySearchParams("game"), ...overrides };
}

describe("parseSearchParams", () => {
  it("reads an empty URL as browsing shows, page 1", () => {
    expect(parse({})).toEqual({ ok: true, params: params() });
  });

  it("reads every parameter", () => {
    expect(
      parse({
        type: "tv",
        q: "  dune ",
        genre: ["35", "18", "35"],
        year: "2024",
        rating: "7",
        page: "3",
      }),
    ).toEqual({
      ok: true,
      params: {
        type: "tv",
        q: "dune",
        genreIds: [18, 35],
        platformIds: [],
        year: 2024,
        rating: 7,
        page: 3,
      },
    });
  });

  it("reads the blanks a GET form submits as not set", () => {
    expect(parse({ q: "  ", year: "", rating: "" })).toEqual({
      ok: true,
      params: params(),
    });
  });

  it("accepts next year and 1900, the edges of the year range", () => {
    expect(parse({ year: "2027" }).ok).toBe(true);
    expect(parse({ year: "1900" }).ok).toBe(true);
  });

  it("accepts a 100 character query and one character", () => {
    expect(parse({ q: "x".repeat(100) }).ok).toBe(true);
    expect(parse({ q: "x" }).ok).toBe(true);
  });

  it.each([
    [{ type: "anime" }, "type"],
    [{ type: ["tv", "movie"] }, "type"],
    [{ q: "x".repeat(101) }, "q"],
    [{ q: ["a", "b"] }, "q"],
    [{ genre: "999999" }, "genre"],
    [{ genre: "18.0" }, "genre"],
    [{ genre: ["18", "abc"] }, "genre"],
    [{ year: "1899" }, "year"],
    [{ year: "2028" }, "year"],
    [{ year: "20x4" }, "year"],
    [{ year: ["2020", "2021"] }, "year"],
    [{ rating: "7.5" }, "rating"],
    [{ rating: "4" }, "rating"],
    [{ rating: "10" }, "rating"],
    [{ rating: ["7", "8"] }, "rating"],
    [{ page: "0" }, "page"],
    [{ page: "501" }, "page"],
    [{ page: ["1", "2"] }, "page"],
    [{ platform: "6" }, "platform"],
    [{ type: "movie", platform: "6" }, "platform"],
  ] as const)("refuses %o and names %s", (raw, param) => {
    expect(parse(raw as Record<string, string | string[]>)).toEqual({
      ok: false,
      param,
    });
  });

  it("refuses a genre from the other catalog", () => {
    // 28 is the movie Action genre, which TV does not have.
    expect(parse({ type: "tv", genre: "28" })).toEqual({
      ok: false,
      param: "genre",
    });
  });

  it("trims the query, so padding never pushes it past 100 characters", () => {
    const result = parse({ q: `  ${"x".repeat(100)}  ` });
    expect(result.ok && result.params.q).toBe("x".repeat(100));
  });

  it("collapses a repeated genre and sorts the rest, so one filter has one URL", () => {
    const result = parse({ genre: ["35", "18", "35"] });
    expect(result.ok && result.params.genreIds).toEqual([18, 35]);
  });

  it("names the first bad parameter when several are bad", () => {
    expect(parse({ type: "anime", year: "1800", page: "0" })).toEqual({
      ok: false,
      param: "type",
    });
    expect(parse({ rating: "7.5", page: "0" })).toEqual({
      ok: false,
      param: "rating",
    });
  });

  it("ignores parameters it does not know", () => {
    expect(parse({ utm_source: "x" }).ok).toBe(true);
  });
});

describe("searchHref", () => {
  it("always names the type and leaves out every empty value and page 1", () => {
    expect(searchHref(params())).toBe("/search?type=tv");
    expect(searchHref(params({ type: "movie", page: 1 }))).toBe(
      "/search?type=movie",
    );
  });

  it("writes every set value in one fixed order", () => {
    expect(
      searchHref(
        params({ q: "dune", genreIds: [35, 18], year: 2024, rating: 7 }),
        { page: 2 },
      ),
    ).toBe(
      "/search?type=tv&q=dune&genre=18&genre=35&year=2024&rating=7&page=2",
    );
  });

  it("round trips through parseSearchParams", () => {
    const original = params({
      q: "a & b",
      genreIds: [18],
      year: 2001,
      page: 4,
    });
    const url = new URL(searchHref(original), "http://localhost");
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      raw[key] = values.length > 1 ? values : values[0];
    }
    expect(parse(raw)).toEqual({ ok: true, params: original });
  });
});

describe("hasAnyFilter", () => {
  it("counts a query and every filter, not the type or the page", () => {
    expect(hasAnyFilter(params({ type: "movie", page: 3 }))).toBe(false);
    expect(hasAnyFilter(params({ q: "x" }))).toBe(true);
    expect(hasAnyFilter(params({ year: 2000 }))).toBe(true);
  });
});

describe("searchMode", () => {
  it.each([
    [{}, "browse"],
    [{ year: 2020 }, "discover"],
    [{ genreIds: [18] }, "discover"],
    [{ rating: 7 }, "discover"],
    [{ q: "dune" }, "search"],
    [{ q: "dune", year: 2021 }, "search"],
    [{ q: "dune", genreIds: [18] }, "filtered_search"],
    [{ q: "dune", rating: 7, year: 2021 }, "filtered_search"],
  ] as const)("reads %o as %s", (overrides, mode) => {
    expect(searchMode(params(overrides as Partial<TmdbSearchParams>))).toBe(
      mode,
    );
  });

  it.each([
    [{}, "browse"],
    [{ platformIds: [6] }, "discover"],
    [{ genreIds: [5] }, "discover"],
    [{ year: 2020 }, "discover"],
    [{ rating: 7 }, "discover"],
    [{ q: "zelda" }, "search"],
    [{ q: "zelda", genreIds: [5], rating: 7 }, "search"],
  ] as const)(
    "reads a games search of %o as %s, never filtered",
    (overrides, mode) => {
      expect(
        searchMode(gameParams(overrides as Partial<GameSearchParams>)),
      ).toBe(mode);
    },
  );
});

describe("parseSearchParams for games (spec 0029)", () => {
  it("accepts type=game only while the games library is on (AC-1)", () => {
    expect(parseGame({}, false)).toEqual({ ok: false, param: "type" });
    expect(parseGame({})).toEqual({ ok: true, params: gameParams() });
  });

  it("reads every games parameter, platforms deduplicated and sorted (AC-2)", () => {
    expect(
      parseGame({
        q: " zelda ",
        genre: ["12", "5", "12"],
        platform: ["508", "130", "508"],
        year: "1950",
        rating: "9",
        page: "50",
      }),
    ).toEqual({
      ok: true,
      params: gameParams({
        q: "zelda",
        genreIds: [5, 12],
        platformIds: [130, 508],
        year: 1950,
        rating: 9,
        page: 50,
      }),
    });
  });

  it("counts 20 ids per list after removing repeats", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => String(index + 1));
    expect(parseGame({ genre: [...twenty, "1"] }).ok).toBe(true);
    expect(parseGame({ genre: [...twenty, "21"] })).toEqual({
      ok: false,
      param: "genre",
    });
    const platforms = Array.from({ length: 21 }, (_, i) => String(1000 + i));
    expect(parseGame({ platform: platforms })).toEqual({
      ok: false,
      param: "platform",
    });
  });

  it.each([
    [{ q: "\u0001" }, "q"],
    [{ q: "zel\u0001da" }, "q"],
    [{ genre: "31" }, "genre"],
    [{ platform: "0" }, "platform"],
    [{ platform: "7" }, "platform"],
    [{ year: "1949" }, "year"],
    [{ year: "2028" }, "year"],
    [{ rating: "4" }, "rating"],
    [{ page: "501" }, "page"],
  ] as const)("refuses %o and names %s", (raw, param) => {
    expect(parseGame(raw)).toEqual({ ok: false, param });
  });

  it("parses a URL whose platform list failed to load when it has no platform (AC-11)", () => {
    expect(
      parseSearchParams(
        { type: "game", genre: "5" },
        { genres: GAME_GENRES, platforms: [] },
        YEAR,
        { gamesEnabled: true },
      ).ok,
    ).toBe(true);
  });

  it("narrows a games parse, refusing a URL that is not a games search (AC-1)", () => {
    const lists = { genres: GAME_GENRES, platforms: PLATFORMS };
    const parsed = parseGameSearchParams(
      { type: "game", q: "zelda" },
      lists,
      YEAR,
    );
    expect(parsed).toEqual({ ok: true, params: gameParams({ q: "zelda" }) });
    expect(parseGameSearchParams({ type: "tv" }, lists, YEAR)).toEqual({
      ok: false,
      param: "type",
    });
    expect(
      parseGameSearchParams(
        { type: "game", platform: "130" },
        { genres: GAME_GENRES, platforms: null },
        YEAR,
      ),
    ).toEqual({ ok: false, param: "platform" });
  });

  it("writes platforms after the genres and round trips (AC-2)", () => {
    const original = gameParams({
      q: "mario",
      genreIds: [8],
      platformIds: [508, 130],
      rating: 7,
    });
    const href = searchHref(original);
    expect(href).toBe(
      "/search?type=game&q=mario&genre=8&platform=130&platform=508&rating=7",
    );
    const url = new URL(href, "http://localhost");
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      raw[key] = values.length > 1 ? values : values[0];
    }
    expect(parseGame(raw)).toEqual({
      ok: true,
      params: { ...original, platformIds: [130, 508] },
    });
  });

  it("counts a platform as a filter", () => {
    expect(hasAnyFilter(gameParams({ platformIds: [6] }))).toBe(true);
  });
});
