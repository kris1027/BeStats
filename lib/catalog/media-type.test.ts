import { describe, expect, it } from "vitest";

import {
  gameHref,
  isLibraryPath,
  isTypedPath,
  libraryHref,
  libraryTabSwitchHref,
  libraryTypeForLocation,
  mediaTypeForLocation,
  parseLibraryPageType,
  parseLibraryTypeParam,
  parseMediaTypeParam,
  shownLibraryType,
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
    ["/watchlist", null, "movie"],
    ["/search", "movie", "movie"],
    ["/account", "movie", null],
    ["/moviesque", null, null],
    [null, null, null],
  ] as const)("%s with type %s is %s", (pathname, type, expected) => {
    expect(mediaTypeForLocation(pathname, type)).toBe(expected);
  });
});

describe("libraryHref", () => {
  // covers: prompts/library-page-urls.md, AC-2
  it("opens each page at its own route on the tab, always writing the type", () => {
    expect(libraryHref("watchlist", "tv")).toBe("/up-next?type=tv");
    expect(libraryHref("watchlist", "movie")).toBe("/watchlist?type=movie");
    expect(libraryHref("watchlist", "game")).toBe("/want-to-play?type=game");
    expect(libraryHref("upcoming", "movie")).toBe("/coming-soon?type=movie");
    expect(libraryHref("upcoming", "game")).toBe("/playing?type=game");
    expect(libraryHref("watched", "game")).toBe("/finished?type=game");
  });

  // covers: prompts/game-coming-soon.md, R5
  it("sends a shows or movies link to Coming soon to that tab's first page", () => {
    expect(libraryHref("coming-soon", "game", { page: 2 })).toBe(
      "/coming-soon?type=game&page=2",
    );
    expect(libraryHref("coming-soon", "tv")).toBe("/up-next?type=tv");
    expect(libraryHref("coming-soon", "movie")).toBe("/watchlist?type=movie");
  });

  it("writes a page only from page 2", () => {
    expect(libraryHref("watchlist", "movie", { page: 1 })).toBe(
      "/watchlist?type=movie",
    );
    expect(libraryHref("watched", "tv", { page: 3 })).toBe(
      "/watched?type=tv&page=3",
    );
  });
});

describe("parseLibraryPageType", () => {
  // covers: prompts/library-page-urls.md, decision 3
  it("reads an absent type as the route's default tab", () => {
    expect(parseLibraryPageType("/up-next", undefined)).toBe("tv");
    expect(parseLibraryPageType("/watchlist", undefined)).toBe("movie");
    expect(parseLibraryPageType("/coming-soon", null)).toBe("movie");
    expect(parseLibraryPageType("/playing", undefined)).toBe("game");
  });

  it("keeps a named tab, even one without the page, and refuses the rest", () => {
    expect(parseLibraryPageType("/playing", "tv")).toBe("tv");
    expect(parseLibraryPageType("/watched", "game")).toBe("game");
    expect(parseLibraryPageType("/watched", "")).toBeNull();
  });
});

describe("shownLibraryType", () => {
  // covers: prompts/library-page-urls.md, decision 3
  it("falls back to the route's default tab, never null", () => {
    expect(shownLibraryType("/playing", undefined)).toBe("game");
    expect(shownLibraryType("/watched", "bogus")).toBe("tv");
    expect(shownLibraryType("/coming-soon", "game")).toBe("game");
    expect(shownLibraryType("/playing", "tv")).toBe("tv");
  });
});

describe("libraryTabSwitchHref", () => {
  it("drops every other parameter of a list page", () => {
    expect(
      libraryTabSwitchHref(
        "/watched",
        "movie",
        new URLSearchParams("type=tv&page=4"),
      ),
    ).toBe("/watched?type=movie");
  });

  // covers: prompts/library-page-urls.md, AC-3
  it("switches a library route to the matching page of the tab", () => {
    const from = (type: string) => new URLSearchParams({ type });
    expect(libraryTabSwitchHref("/playing", "tv", from("game"))).toBe(
      "/upcoming?type=tv",
    );
    expect(libraryTabSwitchHref("/coming-soon", "game", from("movie"))).toBe(
      "/playing?type=game",
    );
    expect(libraryTabSwitchHref("/coming-soon", "tv", from("game"))).toBe(
      "/up-next?type=tv",
    );
    expect(libraryTabSwitchHref("/watchlist", "game")).toBe(
      "/want-to-play?type=game",
    );
    expect(libraryTabSwitchHref("/playing", "tv", from("tv"))).toBe(
      "/upcoming?type=tv",
    );
    expect(libraryTabSwitchHref("/watched", "game", from("bogus"))).toBe(
      "/finished?type=game",
    );
  });
});

describe("typedHref", () => {
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

/** covers: spec 0027, AC-2 to AC-4; spec 0032, AC-12 */
describe("parseLibraryTypeParam", () => {
  it("always accepts game", () => {
    expect(parseLibraryTypeParam("game")).toBe("game");
  });

  it("reads everything else as parseMediaTypeParam does", () => {
    expect(parseLibraryTypeParam(undefined)).toBe("tv");
    expect(parseLibraryTypeParam("movie")).toBe("movie");
    expect(parseLibraryTypeParam("")).toBeNull();
    expect(parseLibraryTypeParam(["game", "game"])).toBeNull();
    expect(parseLibraryTypeParam("GAME")).toBeNull();
  });

  it("never lets game into the catalog parser", () => {
    expect(parseMediaTypeParam("game")).toBeNull();
  });
});

describe("libraryTypeForLocation", () => {
  it("is game on a library page asking for it", () => {
    for (const path of ["/watchlist", "/upcoming", "/watched"]) {
      expect(libraryTypeForLocation(path, "game")).toBe("game");
    }
  });

  it("is game on /search asking for it (spec 0029, AC-18)", () => {
    expect(libraryTypeForLocation("/search", "game")).toBe("game");
  });

  it("is never game on a catalog page", () => {
    expect(libraryTypeForLocation("/movies", "game")).toBe("movie");
  });

  // spec 0028, AC-14, AC-16
  it("is game on /games and below it", () => {
    for (const path of ["/games", "/games/trending", "/games/1942"]) {
      expect(libraryTypeForLocation(path, null)).toBe("game");
    }
    expect(libraryTypeForLocation("/gamesx", null)).toBeNull();
  });

  // covers: prompts/library-page-urls.md, decision 3
  it("is the route's default tab on a library route with no type", () => {
    expect(libraryTypeForLocation("/playing", null)).toBe("game");
    expect(libraryTypeForLocation("/coming-soon", null)).toBe("movie");
    expect(libraryTypeForLocation("/up-next", null)).toBe("tv");
  });

  it("matches mediaTypeForLocation for the catalogs", () => {
    expect(libraryTypeForLocation("/upcoming", "movie")).toBe("movie");
    expect(libraryTypeForLocation("/account", null)).toBeNull();
  });
});

describe("the library paths", () => {
  it("are the eight library routes and not /search", () => {
    for (const path of [
      "/up-next",
      "/upcoming",
      "/watched",
      "/watchlist",
      "/coming-soon",
      "/want-to-play",
      "/playing",
      "/finished",
    ]) {
      expect(isLibraryPath(path)).toBe(true);
      expect(isTypedPath(path)).toBe(true);
    }
    expect(isLibraryPath("/search")).toBe(false);
    expect(isLibraryPath(null)).toBe(false);
  });

  it("take game in libraryHref, and so does /search (spec 0029, AC-1)", () => {
    expect(libraryHref("watched", "game", { page: 2 })).toBe(
      "/finished?type=game&page=2",
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
