import { describe, expect, it } from "vitest";

import {
  formatPartialCount,
  formatRange,
  formatResultCount,
  formatTotal,
} from "./count";
import { mapGenresAcrossTypes } from "./genres";

/** covers: spec 0010, AC-3, AC-12, AC-14, AC-24 */

describe("formatResultCount", () => {
  it("uses the singular for one", () => {
    expect(formatResultCount(1, "tv", "search")).toBe("1 show");
    expect(formatResultCount(1, "movie", "discover")).toBe("1 movie");
  });

  it("formats an exact total with thousands separators", () => {
    expect(formatResultCount(95, "tv", "search")).toBe("95 shows");
    expect(formatResultCount(9_999, "movie", "search")).toBe("9,999 movies");
    expect(formatResultCount(15_342, "tv", "discover")).toBe("15,342 shows");
    expect(formatResultCount(20_000, "tv", "discover")).toBe("20,000 shows");
  });

  it("reads each endpoint's cap as a floor, not a count", () => {
    expect(formatResultCount(10_000, "tv", "search")).toBe("10,000+ shows");
    expect(formatResultCount(20_001, "movie", "discover")).toBe(
      "20,000+ movies",
    );
  });

  it("does not apply the search cap to discover", () => {
    expect(formatResultCount(10_000, "tv", "discover")).toBe("10,000 shows");
  });
});

describe("formatTotal", () => {
  it("keeps a total above either cap at the cap's floor", () => {
    expect(formatTotal(10_001, "search")).toBe("10,000+");
    expect(formatTotal(250_000, "discover")).toBe("20,000+");
  });

  it("reads zero as an exact zero", () => {
    expect(formatTotal(0, "search")).toBe("0");
    expect(formatResultCount(0, "movie", "discover")).toBe("0 movies");
  });
});

describe("formatRange", () => {
  it("joins the range with an en dash and thousands separators", () => {
    expect(formatRange(9_981, 10_000)).toBe("9,981–10,000");
  });
});

describe("formatPartialCount", () => {
  it("labels the range read and TMDB's unfiltered total", () => {
    expect(
      formatPartialCount({
        matches: 12,
        fromIndex: 1,
        toIndex: 100,
        totalResults: 1_112,
        query: "dune",
      }),
    ).toBe("12 matches in TMDB results 1–100 of 1,112 for “dune”");
  });

  it("uses the singular and the search cap wording", () => {
    expect(
      formatPartialCount({
        matches: 1,
        fromIndex: 101,
        toIndex: 200,
        totalResults: 10_000,
        query: "the",
      }),
    ).toBe("1 match in TMDB results 101–200 of 10,000+ for “the”");
  });
});

describe("mapGenresAcrossTypes", () => {
  const tv = [
    { id: 18, name: "Drama" },
    { id: 10766, name: "Soap" },
    { id: 10759, name: "Action & Adventure" },
  ];
  const movie = [
    { id: 18, name: "Drama" },
    { id: 28, name: "Action" },
    { id: 12, name: "Adventure" },
  ];

  it("keeps a genre both lists name alike and drops the rest by name", () => {
    expect(mapGenresAcrossTypes([18, 10766], tv, movie)).toEqual({
      kept: [18],
      dropped: ["Soap"],
    });
  });

  it("maps to the other list's id, never a near name", () => {
    const films = [{ id: 99, name: "Drama" }];
    expect(mapGenresAcrossTypes([18, 10759], tv, films)).toEqual({
      kept: [99],
      dropped: ["Action & Adventure"],
    });
  });

  it("skips an id the source list does not know, naming nothing", () => {
    expect(mapGenresAcrossTypes([424242, 18], tv, movie)).toEqual({
      kept: [18],
      dropped: [],
    });
  });

  it("returns kept ids sorted, so the new URL is canonical", () => {
    const films = [
      { id: 50, name: "Drama" },
      { id: 5, name: "Soap" },
    ];
    expect(mapGenresAcrossTypes([18, 10766], tv, films).kept).toEqual([5, 50]);
  });

  it("collapses two source genres that land on one target id", () => {
    const shows = [
      { id: 1, name: "Drama" },
      { id: 2, name: "Drama" },
    ];
    expect(mapGenresAcrossTypes([1, 2], shows, movie)).toEqual({
      kept: [18],
      dropped: [],
    });
  });

  it("returns nothing for nothing", () => {
    expect(mapGenresAcrossTypes([], tv, movie)).toEqual({
      kept: [],
      dropped: [],
    });
  });
});
