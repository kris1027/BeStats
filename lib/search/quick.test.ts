import { describe, expect, it } from "vitest";

import { quickSearchRequestSchema, seeAllHref, titleHref } from "./quick";

/** covers: spec 0010, AC-2, AC-4, AC-20 */

describe("quickSearchRequestSchema", () => {
  it("trims the query before it checks the length", () => {
    const parsed = quickSearchRequestSchema.safeParse({
      type: "tv",
      q: "  dune  ",
    });
    expect(parsed.success && parsed.data).toEqual({ type: "tv", q: "dune" });
  });

  it("accepts exactly two characters and exactly 100", () => {
    expect(
      quickSearchRequestSchema.safeParse({ type: "movie", q: "du" }).success,
    ).toBe(true);
    expect(
      quickSearchRequestSchema.safeParse({ type: "movie", q: "x".repeat(100) })
        .success,
    ).toBe(true);
  });

  it("does not count padding toward the 100 character limit", () => {
    const q = ` ${"x".repeat(100)} `;
    expect(quickSearchRequestSchema.safeParse({ type: "tv", q }).success).toBe(
      true,
    );
  });

  it.each([
    [{ type: "tv", q: null }],
    [{ type: null, q: "dune" }],
    [{ type: "anime", q: "dune" }],
    [{ type: "tv", q: "d" }],
    [{ type: "tv", q: "   " }],
    [{ type: "tv", q: "x".repeat(101) }],
  ])("refuses %o", (input) => {
    expect(quickSearchRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("titleHref", () => {
  it("opens a movie on its movie page and a show on its show page", () => {
    expect(titleHref("movie", 438631)).toBe("/movies/438631");
    expect(titleHref("tv", 1396)).toBe("/shows/1396");
  });
});

describe("seeAllHref", () => {
  it("names the type and the trimmed query, in the canonical order", () => {
    expect(seeAllHref("tv", "  dune ")).toBe("/search?type=tv&q=dune");
  });

  it("encodes characters that would otherwise break the URL", () => {
    const href = seeAllHref("movie", "tom & jerry?");
    const url = new URL(href, "http://localhost");

    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("type")).toBe("movie");
    expect(url.searchParams.get("q")).toBe("tom & jerry?");
    expect([...url.searchParams.keys()]).toEqual(["type", "q"]);
  });

  it("keeps a non Latin query intact", () => {
    const url = new URL(seeAllHref("tv", "進撃の巨人"), "http://localhost");
    expect(url.searchParams.get("q")).toBe("進撃の巨人");
  });
});
