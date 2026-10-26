import { describe, expect, it } from "vitest";

import { GAME_SITEMAP_LIMIT, sitemapEntries } from "./sitemap";

/**
 * covers: spec 0016, AC-6; spec 0032, AC-6
 *
 * The pure half of the sitemap: the order of every group, the dedupe within a
 * media type and the games cap. `app/sitemap.test.ts` covers the reads.
 */
const ORIGIN = "https://bestats.example";

function urls(...args: Parameters<typeof sitemapEntries>) {
  return sitemapEntries(...args).map(({ url }) => url);
}

describe("sitemapEntries", () => {
  it("puts the three landings, the list pages and the legal pages before the titles, then movies, shows and games", () => {
    expect(
      urls(ORIGIN, ["/movies/popular", "/games/popular"], [[1]], [[2]], [3]),
    ).toEqual([
      `${ORIGIN}/movies`,
      `${ORIGIN}/shows`,
      `${ORIGIN}/games`,
      `${ORIGIN}/movies/popular`,
      `${ORIGIN}/games/popular`,
      `${ORIGIN}/privacy`,
      `${ORIGIN}/terms`,
      `${ORIGIN}/movies/1`,
      `${ORIGIN}/shows/2`,
      `${ORIGIN}/games/3`,
    ]);
  });

  it("dedupes game ids in rank order, then caps them at 200", () => {
    const ids = [5, 5, 6, ...Array.from({ length: 400 }, (_, i) => 1000 + i)];

    const games = urls(ORIGIN, [], [], [], ids).filter((url) =>
      url.startsWith(`${ORIGIN}/games/`),
    );

    expect(GAME_SITEMAP_LIMIT).toBe(200);
    expect(games).toHaveLength(200);
    expect(games.slice(0, 3)).toEqual([
      `${ORIGIN}/games/5`,
      `${ORIGIN}/games/6`,
      `${ORIGIN}/games/1000`,
    ]);
  });

  it("keeps a game that shares its number with a movie and a show", () => {
    expect(urls(ORIGIN, [], [[7]], [[7]], [7]).slice(-3)).toEqual([
      `${ORIGIN}/movies/7`,
      `${ORIGIN}/shows/7`,
      `${ORIGIN}/games/7`,
    ]);
  });

  it("lists no games at all when their read failed", () => {
    expect(
      urls(ORIGIN, [], [], [], []).filter((url) => /\/games\/\d+$/.test(url)),
    ).toEqual([]);
  });
});
