import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0022, AC-10, AC-17
 *
 * Two properties of the title page modules that rendering cannot pin cheaply:
 * the order the sections are written in, and that the metadata path never
 * reaches the region or the extras. A grep, in the shape of
 * `app/layout-purity.test.ts`, because both are about what a module names.
 * The rendered order and the prerendered shells are checked live by
 * `/check verify` and the `pnpm build` route table.
 */
const MOVIE_PAGE = readFileSync("app/movies/[id]/page.tsx", "utf8");
const SHOW_PAGE = readFileSync("app/shows/[id]/page.tsx", "utf8");

/** Each marker's offset in the source, failing loudly on a missing one. */
function offsets(source: string, markers: string[]): number[] {
  return markers.map((marker) => {
    const at = source.indexOf(marker);
    expect(at, `${marker} is missing`).toBeGreaterThanOrEqual(0);
    return at;
  });
}

/** True when the numbers only ever go up. */
function ascending(values: number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value > values[index - 1],
  );
}

/** The body of `generateMetadata`, up to the first top level closing brace. */
function metadataBody(source: string): string {
  const start = source.indexOf("export async function generateMetadata");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end);
}

describe("title page section order (AC-17)", () => {
  it("reads overview, crew, where to watch, cast, more like this, facts on a movie", () => {
    const order = offsets(MOVIE_PAGE, [
      "<MovieHero",
      'id="overview-heading"',
      "<MovieCrew",
      "<WhereToWatchSection",
      "<CastSection",
      "<MoreLikeThisSection",
      "<MovieFacts",
    ]);
    expect(ascending(order)).toBe(true);
  });

  it("puts the trailer and age chip in the movie hero", () => {
    const hero = MOVIE_PAGE.slice(
      MOVIE_PAGE.indexOf("<MovieHero"),
      MOVIE_PAGE.indexOf('id="overview-heading"'),
    );
    expect(hero).toContain("<TrailerSlot");
    expect(hero).toContain("<AgeRatingSlot");
  });

  it("reads overview, crew, seasons, where to watch, cast, more like this, facts on a show", () => {
    const order = offsets(SHOW_PAGE, [
      "<DetailHero",
      'id="overview-heading"',
      "<ShowCrew",
      'id="seasons-heading"',
      "<SeasonGrid",
      "<WhereToWatchSection",
      "<CastSection",
      "<MoreLikeThisSection",
      "<ShowFacts",
    ]);
    expect(ascending(order)).toBe(true);
  });

  it("puts the trailer and age chip in the show hero", () => {
    const hero = SHOW_PAGE.slice(
      SHOW_PAGE.indexOf("<DetailHero"),
      SHOW_PAGE.indexOf('id="overview-heading"'),
    );
    expect(hero).toContain("<TrailerSlot");
    expect(hero).toContain("<AgeRatingSlot");
  });
});

describe("the metadata path stays region and extras free (AC-10)", () => {
  it.each([
    ["the movie page", MOVIE_PAGE],
    ["the show page", SHOW_PAGE],
  ])(
    "generateMetadata on %s names no region, rating or extras",
    (_, source) => {
      expect(metadataBody(source)).not.toMatch(
        /getVisitorRegion|Extras|ageRating|AgeRating|watchProviders|headers\(/,
      );
    },
  );

  it("keeps the region out of the shell: only the extras slots read it", () => {
    for (const source of [MOVIE_PAGE, SHOW_PAGE]) {
      expect(source).not.toMatch(/getVisitorRegion|from "@\/lib\/region"/);
    }
  });
});
