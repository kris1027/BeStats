import { describe, expect, it } from "vitest";

import {
  defaultLibraryType,
  hasLibraryPage,
  libraryPageName,
  libraryPages,
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
