import { describe, expect, it } from "vitest";

import { libraryPageName } from "./library-list";

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
