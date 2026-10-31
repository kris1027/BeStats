import { describe, expect, it } from "vitest";

import {
  defaultLibraryType,
  defaultLibraryTypeAt,
  hasLibraryPage,
  LIBRARY_PATHS,
  legacyLibraryRedirects,
  libraryPageAt,
  libraryPageName,
  libraryPages,
  libraryPath,
  libraryPathName,
  shownLibraryPage,
} from "./library-list";

/** covers: prompts/library-page-names.md, AC-1 */
describe("libraryPageName", () => {
  it.each([
    ["watchlist", "tv", "Up next"],
    ["upcoming", "tv", "Upcoming"],
    ["watched", "tv", "Watched"],
    ["watchlist", "movie", "Watchlist"],
    ["upcoming", "movie", "Coming soon"],
    ["watched", "movie", "Watched"],
    ["watchlist", "game", "Want to play"],
    ["upcoming", "game", "Playing"],
    ["watched", "game", "Finished"],
  ] as const)("names %s on the %s tab %j", (list, type, name) => {
    expect(libraryPageName(list, type)).toBe(name);
  });
});

/** covers: prompts/game-coming-soon.md, R4, R5 */
describe("the games Coming soon page", () => {
  it("is named Coming soon, on every tab that asks", () => {
    expect(libraryPageName("coming-soon", "game")).toBe("Coming soon");
    expect(libraryPageName("coming-soon", "tv")).toBe("Coming soon");
  });

  it("lists each tab's pages in navbar order", () => {
    expect(libraryPages("game")).toEqual([
      "coming-soon",
      "watchlist",
      "upcoming",
      "watched",
    ]);
    expect(libraryPages("tv")).toEqual(["watchlist", "upcoming", "watched"]);
    expect(libraryPages("movie")).toEqual(["watchlist", "upcoming", "watched"]);
  });

  it("exists only on the games tab", () => {
    expect(hasLibraryPage("coming-soon", "game")).toBe(true);
    expect(hasLibraryPage("coming-soon", "tv")).toBe(false);
    expect(hasLibraryPage("coming-soon", "movie")).toBe(false);
    expect(hasLibraryPage("watchlist", "movie")).toBe(true);
  });

  it("falls back to games, where every other page falls back to shows", () => {
    expect(defaultLibraryType("coming-soon")).toBe("game");
    expect(defaultLibraryType("watched")).toBe("tv");
  });
});

/** covers: prompts/library-page-urls.md, AC-1 */
describe("the library routes", () => {
  const ROUTES = [
    ["watchlist", "tv", "/up-next"],
    ["upcoming", "tv", "/upcoming"],
    ["watched", "tv", "/watched"],
    ["watchlist", "movie", "/watchlist"],
    ["upcoming", "movie", "/coming-soon"],
    ["watched", "movie", "/watched"],
    ["coming-soon", "game", "/coming-soon"],
    ["watchlist", "game", "/want-to-play"],
    ["upcoming", "game", "/playing"],
    ["watched", "game", "/finished"],
  ] as const;

  it.each(ROUTES)(
    "puts %s on the %s tab at %s, and back",
    (page, type, path) => {
      expect(libraryPath(page, type)).toBe(path);
      expect(libraryPageAt(path, type)).toBe(page);
    },
  );

  it("are eight routes, each once", () => {
    expect([...LIBRARY_PATHS].sort()).toEqual(
      [...new Set(ROUTES.map(([, , path]) => path))].sort(),
    );
    expect(LIBRARY_PATHS).toHaveLength(8);
  });

  it("finds no page where a tab has none", () => {
    for (const path of LIBRARY_PATHS) {
      for (const type of ["tv", "movie", "game"] as const) {
        const owned = ROUTES.some(([, t, p]) => t === type && p === path);
        expect(libraryPageAt(path, type) !== null).toBe(owned);
      }
    }
  });

  it("falls back to the first tab with a page at the route", () => {
    expect(defaultLibraryTypeAt("/up-next")).toBe("tv");
    expect(defaultLibraryTypeAt("/watched")).toBe("tv");
    expect(defaultLibraryTypeAt("/watchlist")).toBe("movie");
    expect(defaultLibraryTypeAt("/coming-soon")).toBe("movie");
    expect(defaultLibraryTypeAt("/finished")).toBe("game");
  });

  it("names a route on a tab without it as its default tab does", () => {
    expect(libraryPathName("/playing", "game")).toBe("Playing");
    expect(libraryPathName("/playing", "tv")).toBe("Playing");
    expect(libraryPathName("/coming-soon", "tv")).toBe("Coming soon");
    expect(libraryPathName("/watchlist", "game")).toBe("Watchlist");
  });

  it("reads a route on a tab without it as its default tab's page", () => {
    expect(shownLibraryPage("/coming-soon", "game")).toEqual({
      page: "coming-soon",
      type: "game",
    });
    expect(shownLibraryPage("/coming-soon", "tv")).toEqual({
      page: "upcoming",
      type: "movie",
    });
    expect(shownLibraryPage("/playing", "movie")).toEqual({
      page: "upcoming",
      type: "game",
    });
  });

  it("redirects exactly the old URLs whose page moved", () => {
    expect(legacyLibraryRedirects()).toEqual([
      { source: "/watchlist", type: "tv", destination: "/up-next" },
      { source: "/upcoming", type: "movie", destination: "/coming-soon" },
      { source: "/watchlist", type: "game", destination: "/want-to-play" },
      { source: "/upcoming", type: "game", destination: "/playing" },
      { source: "/watched", type: "game", destination: "/finished" },
    ]);
  });
});
