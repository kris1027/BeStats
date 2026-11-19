import { describe, expect, it } from "vitest";

import {
  browseCountLine,
  hasFilter,
  noMatchesMessage,
  scanEmptyMessage,
} from "./messages";
import { emptySearchParams } from "./params";

/** covers: spec 0010, AC-3, AC-15; spec 0029, AC-13 */

describe("hasFilter", () => {
  it("ignores the title query", () => {
    expect(hasFilter({ ...emptySearchParams("movie"), q: "dune" })).toBe(false);
  });

  it("counts game platforms as a filter", () => {
    expect(hasFilter({ ...emptySearchParams("game"), platformIds: [6] })).toBe(
      true,
    );
  });
});

describe("noMatchesMessage", () => {
  it("names the query when nothing is filtered", () => {
    expect(noMatchesMessage({ ...emptySearchParams("tv"), q: "xyz" })).toEqual({
      title: "No shows match “xyz”",
      description: "Check the spelling, or try a shorter title.",
    });
  });

  it("suggests loosening platforms on a filtered games search", () => {
    const message = noMatchesMessage({
      ...emptySearchParams("game"),
      platformIds: [6],
    });
    expect(message.title).toBe("No games match these filters");
    expect(message.description).toContain("platforms");
  });
});

describe("scanEmptyMessage", () => {
  it("names the range read and says later results might match", () => {
    expect(
      scanEmptyMessage({
        fromIndex: 1,
        toIndex: 100,
        query: "dune",
        hasMore: true,
      }),
    ).toEqual({
      title: "No matches in TMDB results 1–100",
      description:
        "None of these results for “dune” fit your filters. Later results might.",
    });
  });

  it("drops the later results line at the end", () => {
    expect(
      scanEmptyMessage({
        fromIndex: 1,
        toIndex: 40,
        query: "a",
        hasMore: false,
      }).description,
    ).toBe("None of these results for “a” fit your filters.");
  });
});

describe("browseCountLine", () => {
  it("names the catalog", () => {
    expect(browseCountLine("game")).toBe("Popular games on IGDB");
    expect(browseCountLine("movie")).toBe("Popular movies on TMDB");
  });
});
