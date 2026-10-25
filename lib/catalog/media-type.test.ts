import { describe, expect, it } from "vitest";

import {
  gameHref,
  isLibraryPath,
  isTypedPath,
  libraryTypeForLocation,
  mediaTypeForLocation,
  parseLibraryTypeParam,
  parseMediaTypeParam,
  titleHref,
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
      typedHref("/watched", "movie", {
        current: new URLSearchParams("type=tv&page=4"),
      }),
    ).toBe("/watched?type=movie");
  });

  it("writes a page only from page 2", () => {
    expect(typedHref("/watchlist", "movie", { page: 1 })).toBe(
      "/watchlist?type=movie",
    );
    expect(typedHref("/watched", "tv", { page: 3 })).toBe(
      "/watched?type=tv&page=3",
    );
  });

  it("keeps a search's query, year and rating, not its genres or page", () => {
    expect(
      typedHref("/search", "movie", {
        current: new URLSearchParams(
          "type=tv&q=a+b&genre=18&genre=35&year=1999&rating=8&page=2",
        ),
      }),
    ).toBe("/search?type=movie&q=a+b&year=1999&rating=8");
  });

  it("knows the typed pages", () => {
    expect(isTypedPath("/search")).toBe(true);
    expect(isTypedPath("/watchlist/x")).toBe(false);
    expect(isTypedPath(null)).toBe(false);
  });
});

describe("titleHref", () => {
  it("opens a movie on its movie page and a show on its show page", () => {
    expect(titleHref("movie", 438631)).toBe("/movies/438631");
    expect(titleHref("tv", 1396)).toBe("/shows/1396");
  });
});

/** covers: spec 0027, AC-2 to AC-4 */
describe("parseLibraryTypeParam", () => {
  it("accepts game only while the games library is on", () => {
    expect(parseLibraryTypeParam("game", true)).toBe("game");
    expect(parseLibraryTypeParam("game", false)).toBeNull();
  });

  it("reads everything else as parseMediaTypeParam does", () => {
    for (const enabled of [true, false]) {
      expect(parseLibraryTypeParam(undefined, enabled)).toBe("tv");
      expect(parseLibraryTypeParam("movie", enabled)).toBe("movie");
      expect(parseLibraryTypeParam("", enabled)).toBeNull();
      expect(parseLibraryTypeParam(["game", "game"], enabled)).toBeNull();
      expect(parseLibraryTypeParam("GAME", enabled)).toBeNull();
    }
  });

  it("never lets game into the catalog parser", () => {
    expect(parseMediaTypeParam("game")).toBeNull();
  });
});

describe("libraryTypeForLocation", () => {
  it("is game on a library page asking for it while the flag is on", () => {
    for (const path of ["/watchlist", "/upcoming", "/watched"]) {
      expect(libraryTypeForLocation(path, "game", true)).toBe("game");
    }
  });

  it("is never game on /search, a catalog page or with the flag off", () => {
    expect(libraryTypeForLocation("/search", "game", true)).toBe("tv");
    expect(libraryTypeForLocation("/movies", "game", true)).toBe("movie");
    expect(libraryTypeForLocation("/watchlist", "game", false)).toBe("tv");
  });

  // spec 0028, AC-14, AC-16
  it("is game on /games and below it while the flag is on, and no type when off", () => {
    for (const path of ["/games", "/games/trending", "/games/1942"]) {
      expect(libraryTypeForLocation(path, null, true)).toBe("game");
      expect(libraryTypeForLocation(path, null, false)).toBeNull();
    }
    expect(libraryTypeForLocation("/gamesx", null, true)).toBeNull();
  });

  it("matches mediaTypeForLocation for the catalogs", () => {
    expect(libraryTypeForLocation("/upcoming", "movie", true)).toBe("movie");
    expect(libraryTypeForLocation("/account", null, true)).toBeNull();
  });
});

describe("the library paths", () => {
  it("are the three library pages and not /search", () => {
    expect(isLibraryPath("/watchlist")).toBe(true);
    expect(isLibraryPath("/upcoming")).toBe(true);
    expect(isLibraryPath("/watched")).toBe(true);
    expect(isLibraryPath("/search")).toBe(false);
    expect(isLibraryPath(null)).toBe(false);
  });

  it("take game in typedHref, and so does /search (spec 0029, AC-1)", () => {
    expect(typedHref("/watched", "game", { page: 2 })).toBe(
      "/watched?type=game&page=2",
    );
    expect(typedHref("/search", "game")).toBe("/search?type=game");
  });

  it("drops a year games cannot take on a switch to games (spec 0029, AC-14)", () => {
    const current = new URLSearchParams(
      "type=movie&q=dune&year=1940&genre=878&page=3",
    );
    expect(typedHref("/search", "game", { current })).toBe(
      "/search?type=game&q=dune",
    );
    expect(typedHref("/search", "movie", { current })).toBe(
      "/search?type=movie&q=dune&year=1940",
    );
    expect(
      typedHref("/search", "game", {
        current: new URLSearchParams("type=tv&year=1950&platform=6&rating=7"),
      }),
    ).toBe("/search?type=game&year=1950&rating=7");
  });
});

describe("gameHref", () => {
  it("opens a game on its game page", () => {
    expect(gameHref(1942)).toBe("/games/1942");
  });
});
