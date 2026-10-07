import { describe, expect, it } from "vitest";

import {
  isTypedPath,
  mediaTypeForLocation,
  parseMediaTypeParam,
  typedHref,
} from "./media-type";

/** covers: feature 22 */

describe("parseMediaTypeParam", () => {
  it("reads an absent type as tv, the default", () => {
    expect(parseMediaTypeParam(undefined)).toBe("tv");
    expect(parseMediaTypeParam(null)).toBe("tv");
  });

  it.each(["tv", "movie"] as const)("accepts %s", (type) => {
    expect(parseMediaTypeParam(type)).toBe(type);
  });

  it.each([["foo"], [""], ["TV"], [["tv", "movie"]]])(
    "refuses %j rather than correcting it",
    (value) => {
      expect(parseMediaTypeParam(value)).toBeNull();
    },
  );
});

describe("mediaTypeForLocation", () => {
  it.each([
    ["/shows", null, "tv"],
    ["/shows/1399", null, "tv"],
    ["/movies", null, "movie"],
    ["/movies/550", "tv", "movie"],
    ["/watchlist", "movie", "movie"],
    ["/upcoming", null, "tv"],
    ["/watched", "foo", "tv"],
    ["/search", "movie", "movie"],
    ["/account", "movie", null],
    ["/moviesque", null, null],
    [null, null, null],
  ] as const)("%s with type %s is %s", (pathname, type, expected) => {
    expect(mediaTypeForLocation(pathname, type)).toBe(expected);
  });
});

describe("typedHref", () => {
  it("always writes the type", () => {
    expect(typedHref("/watchlist", "tv")).toBe("/watchlist?type=tv");
    expect(typedHref("/upcoming", "movie")).toBe("/upcoming?type=movie");
  });

  it("drops every other parameter of a list page", () => {
    expect(
      typedHref("/watched", "movie", new URLSearchParams("type=tv&page=4")),
    ).toBe("/watched?type=movie");
  });

  it("keeps a search's query, year and rating, not its genres or page", () => {
    expect(
      typedHref(
        "/search",
        "movie",
        new URLSearchParams(
          "type=tv&q=a+b&genre=18&genre=35&year=1999&rating=8&page=2",
        ),
      ),
    ).toBe("/search?type=movie&q=a+b&year=1999&rating=8");
  });

  it("knows the typed pages", () => {
    expect(isTypedPath("/search")).toBe(true);
    expect(isTypedPath("/watchlist/x")).toBe(false);
    expect(isTypedPath(null)).toBe(false);
  });
});
