import { describe, expect, it } from "vitest";

import {
  CATALOG_LISTS,
  catalogList,
  catalogListsFor,
  isCatalogListSlug,
  listPageHref,
  listPath,
  MOVIE_LIST_SLUGS,
  TV_LIST_SLUGS,
} from "./lists";

/** covers: spec 0021, AC-1, AC-9, AC-13 */
describe("the list registry", () => {
  it("holds the five TV rows in AC-1 order", () => {
    expect(catalogListsFor("tv").map((list) => list.rowTitle)).toEqual([
      "Trending this week",
      "Popular",
      "Airing today",
      "On the air",
      "Top rated",
    ]);
    expect(catalogListsFor("tv").map((list) => list.slug)).toEqual([
      ...TV_LIST_SLUGS,
    ]);
  });

  it("holds the five movie rows in AC-1 order", () => {
    expect(catalogListsFor("movie").map((list) => list.rowTitle)).toEqual([
      "Trending this week",
      "Popular",
      "Now playing",
      "Upcoming",
      "Top rated",
    ]);
    expect(catalogListsFor("movie").map((list) => list.slug)).toEqual([
      ...MOVIE_LIST_SLUGS,
    ]);
  });

  it("names every list once", () => {
    const keys = CATALOG_LISTS.map((list) => `${list.mediaType}/${list.slug}`);
    expect(new Set(keys).size).toBe(10);
  });

  it("finds an entry by media type and slug", () => {
    expect(catalogList("movie", "now-playing").heading).toBe(
      "Movies now playing",
    );
    expect(catalogList("tv", "airing-today").pageNoun).toBe(
      "shows airing today",
    );
  });
});

describe("list URLs (AC-9)", () => {
  it("puts a list under its catalog", () => {
    expect(listPath(catalogList("tv", "top-rated"))).toBe("/shows/top-rated");
    expect(listPath(catalogList("movie", "upcoming"))).toBe("/movies/upcoming");
  });

  it("writes page 1 as the bare path and page N as ?page=N", () => {
    expect(listPageHref(catalogList("tv", "popular"), 1)).toBe(
      "/shows/popular",
    );
    expect(listPageHref(catalogList("movie", "trending"), 4)).toBe(
      "/movies/trending?page=4",
    );
  });
});

describe("isCatalogListSlug (AC-13)", () => {
  it.each([
    ["tv", "trending"],
    ["tv", "airing-today"],
    ["tv", "on-the-air"],
    ["movie", "now-playing"],
    ["movie", "upcoming"],
  ] as const)("accepts %s %s", (mediaType, slug) => {
    expect(isCatalogListSlug(mediaType, slug)).toBe(true);
  });

  it.each([
    ["tv", "upcoming"],
    ["tv", "now-playing"],
    ["movie", "airing-today"],
    ["movie", "on-the-air"],
    ["tv", "Popular"],
    ["tv", "popular.jpg"],
    ["tv", "1396"],
    ["tv", ""],
  ] as const)("refuses %s %s", (mediaType, segment) => {
    expect(isCatalogListSlug(mediaType, segment)).toBe(false);
  });
});
