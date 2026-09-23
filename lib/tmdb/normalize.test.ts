import { describe, expect, it } from "vitest";

import { resolveOverview } from "./normalize";

/**
 * covers: spec 0006, AC-4, AC-5
 *
 * The fixture tests in `reads.test.ts` prove the fallback end to end on real
 * payloads. These pin the edges of the choice itself, where a wrong branch
 * would show a guessed language or invent an overview.
 */
describe("resolveOverview", () => {
  const french = { iso_639_1: "fr", data: { overview: "Un texte." } };

  it("prefers English, trimmed, even when the original language has one", () => {
    expect(resolveOverview("  An overview.  ", "fr", [french])).toEqual({
      overview: "An overview.",
      overviewLanguage: "en",
    });
  });

  it("treats a blank English overview as missing and falls back", () => {
    expect(resolveOverview(" \n ", "fr", [french])).toEqual({
      overview: "Un texte.",
      overviewLanguage: "fr",
    });
  });

  it.each([null, undefined])(
    "is absent, not invented, when translations are %s",
    (translations) => {
      expect(resolveOverview(null, "fr", translations)).toEqual({
        overview: null,
        overviewLanguage: null,
      });
    },
  );

  it("skips a matching entry with no data and uses the next one", () => {
    const result = resolveOverview("", "fr", [
      { iso_639_1: "fr", data: null },
      { iso_639_1: "fr", data: { overview: null } },
      { iso_639_1: "fr", data: { overview: "Le bon texte." } },
    ]);

    expect(result).toEqual({
      overview: "Le bon texte.",
      overviewLanguage: "fr",
    });
  });

  it("keeps the first usable match, so the choice is stable across reads", () => {
    const result = resolveOverview(null, "fr", [
      { iso_639_1: "fr", data: { overview: "Premier." } },
      { iso_639_1: "fr", data: { overview: "Second." } },
    ]);

    expect(result.overview).toBe("Premier.");
  });

  it("matches the language code exactly", () => {
    const result = resolveOverview(null, "fr", [
      { iso_639_1: "FR", data: { overview: "Majuscules." } },
    ]);

    expect(result).toEqual({ overview: null, overviewLanguage: null });
  });
});
