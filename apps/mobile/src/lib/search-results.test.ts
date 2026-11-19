import type { V1Search } from "@bestats/core/api/v1/browse";
import { emptySearchParams } from "@bestats/core/search/params";

import { searchView } from "./search-results";

/**
 * covers: AGENTS.md section 10 (exact or partial count, a filtered search
 * says which TMDB range it checked) and the web's empty copy
 * (prompts/mobile-app-shell-catalog.md, decision 7)
 */
function page(overrides: Partial<V1Search>): V1Search {
  return {
    type: "tv",
    mode: "search",
    page: 1,
    pageSize: 24,
    results: [
      {
        id: 1,
        title: "Dune",
        year: 2021,
        releaseDate: "2021-10-22",
        posterUrl: null,
        communityRating: 7.8,
      },
    ],
    total: 1,
    totalIsExact: true,
    nextPage: null,
    scanned: null,
    ...overrides,
  };
}

const dune = { ...emptySearchParams("movie"), q: "dune" };

test("browse names its source", () => {
  expect(
    searchView(emptySearchParams("tv"), [page({ mode: "browse" })], false),
  ).toEqual({ kind: "results", countLine: "Popular shows on TMDB" });
});

test("a plain search shows TMDB's capped total", () => {
  expect(
    searchView(dune, [page({ type: "movie", total: 12_000 })], true),
  ).toEqual({ kind: "results", countLine: "10,000+ movies" });
});

test("a games search counts with IGDB's exact total", () => {
  const params = { ...emptySearchParams("game"), q: "zelda" };
  expect(searchView(params, [page({ type: "game", total: 1 })], false)).toEqual(
    { kind: "results", countLine: "1 game" },
  );
});

test("a filtered search counts matches over every range read", () => {
  const params = { ...dune, rating: 7 as const };
  const view = searchView(
    params,
    [
      page({
        mode: "filtered_search",
        total: 300,
        totalIsExact: false,
        scanned: { fromIndex: 1, toIndex: 100 },
      }),
      page({
        mode: "filtered_search",
        page: 6,
        total: 300,
        totalIsExact: false,
        scanned: { fromIndex: 101, toIndex: 200 },
      }),
    ],
    true,
  );
  expect(view).toEqual({
    kind: "results",
    countLine: "2 matches in TMDB results 1–200 of 300 for “dune”",
  });
});

test("a filtered range that kept nothing says later results might match", () => {
  const params = { ...dune, rating: 9 as const };
  const view = searchView(
    params,
    [
      page({
        mode: "filtered_search",
        results: [],
        total: 300,
        scanned: { fromIndex: 1, toIndex: 100 },
      }),
    ],
    true,
  );
  expect(view).toEqual({
    kind: "scan_empty",
    title: "No matches in TMDB results 1–100",
    description:
      "None of these results for “dune” fit your filters. Later results might.",
  });
});

test("no match names the query, or the filters", () => {
  expect(searchView(dune, [page({ results: [], total: 0 })], false)).toEqual({
    kind: "no_matches",
    title: "No movies match “dune”",
    description: "Check the spelling, or try a shorter title.",
  });
  expect(
    searchView(
      { ...emptySearchParams("tv"), year: 1901 },
      [page({ mode: "discover", results: [], total: 0 })],
      false,
    ),
  ).toMatchObject({
    kind: "no_matches",
    title: "No shows match these filters",
  });
});

test("an empty Popular games list has its own state", () => {
  expect(
    searchView(
      emptySearchParams("game"),
      [page({ type: "game", mode: "browse", results: [], total: null })],
      false,
    ),
  ).toEqual({
    kind: "no_matches",
    title: "No popular games right now",
    description: "IGDB lists no popular games at the moment.",
  });
});

test("an empty Popular shows list never names a null query", () => {
  const view = searchView(
    emptySearchParams("tv"),
    [page({ mode: "browse", results: [], total: 0 })],
    false,
  );
  expect(view).toMatchObject({
    kind: "no_matches",
    title: "No popular shows right now",
  });
  expect(JSON.stringify(view)).not.toContain("null");
});
