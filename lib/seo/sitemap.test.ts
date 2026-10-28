import { describe, expect, it } from "vitest";

import { sitemapEntries } from "./sitemap";

/**
 * covers: spec 0016, AC-6; spec 0032, AC-6; prompts/crawl-budget-cut.md
 *
 * The pure half of the sitemap: the order of every group, the dedupe within a
 * media type, and no game detail page. `app/sitemap.test.ts` covers the reads.
 */
const ORIGIN = "https://bestats.example";

function urls(...args: Parameters<typeof sitemapEntries>) {
  return sitemapEntries(...args).map(({ url }) => url);
}

describe("sitemapEntries", () => {
  it("puts the three landings, the list pages and the legal pages before the titles, then movies and shows", () => {
    expect(
      urls(ORIGIN, ["/movies/popular", "/games/popular"], [[1]], [[2]]),
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
    ]);
  });

  it("keeps a show that shares its number with a movie", () => {
    expect(urls(ORIGIN, [], [[7, 7]], [[7]]).slice(-2)).toEqual([
      `${ORIGIN}/movies/7`,
      `${ORIGIN}/shows/7`,
    ]);
  });

  it("lists no game detail page, which robots.txt disallows", () => {
    expect(
      urls(ORIGIN, ["/games/popular"], [[1]], [[2]]).filter((url) =>
        /\/games\/\d+$/.test(url),
      ),
    ).toEqual([]);
  });
});
