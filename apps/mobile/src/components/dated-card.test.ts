/**
 * covers: spec 0028, AC-8 (only games' Coming soon cards print a release
 * date pill, the same UTC day the web prints), AGENTS.md section 9 (air
 * dates are UTC days).
 */
import type { V1CatalogItem } from "@bestats/core/api/v1/browse";
import { catalogList, catalogListsFor } from "@bestats/core/catalog/lists";
import { formatReleaseDate } from "@bestats/core/format";

import { cardDateLabel } from "./dated-card";

const TODAY = "2026-11-22";

function item(releaseDate: string | null): V1CatalogItem {
  return {
    id: 1,
    title: "A game",
    year: null,
    releaseDate,
    posterUrl: null,
    communityRating: null,
  };
}

describe("cardDateLabel", () => {
  const comingSoon = catalogList("game", "coming-soon");

  test("a Coming soon game prints core's short date", () => {
    const label = cardDateLabel(comingSoon, item("2026-12-05"), TODAY);
    expect(label).toBe(formatReleaseDate("2026-12-05", TODAY)?.shortDate);
    expect(label).toEqual(expect.any(String));
  });

  test("a date in another year prints the long form with its year", () => {
    expect(cardDateLabel(comingSoon, item("2027-02-10"), TODAY)).toContain(
      "2027",
    );
  });

  test("a Coming soon game with no date reads Date TBA", () => {
    expect(cardDateLabel(comingSoon, item(null), TODAY)).toBe("Date TBA");
  });

  test("an undated game is never shown as a guessed day", () => {
    expect(cardDateLabel(comingSoon, item(null), TODAY)).not.toMatch(/\d/);
  });

  test("other game lists print no pill", () => {
    const topRated = catalogList("game", "top-rated");
    expect(cardDateLabel(topRated, item("2026-12-05"), TODAY)).toBeNull();
  });

  test("movie and TV lists print no pill even with a date", () => {
    for (const mediaType of ["movie", "tv"] as const) {
      for (const list of catalogListsFor(mediaType)) {
        expect(cardDateLabel(list, item("2026-12-05"), TODAY)).toBeNull();
      }
    }
  });
});
