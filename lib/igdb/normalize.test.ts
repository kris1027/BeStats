import { describe, expect, it } from "vitest";
import {
  artUrl,
  coverUrl,
  normalizeGame,
  normalizeSummary,
  releaseDay,
} from "./normalize";

/**
 * The value sourcing rules of spec 0023 (AC-15, AC-16), on the pure mapping.
 * The end to end reads in `games.test.ts` cover the full shapes.
 */

describe("coverUrl", () => {
  it("builds the t_cover_big_2x URL from an image id", () => {
    expect(coverUrl("coaarl")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/coaarl.jpg",
    );
  });

  it("trims the id, and answers null for a blank or absent one", () => {
    expect(coverUrl(" coaarl ")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/coaarl.jpg",
    );
    expect(coverUrl("   ")).toBeNull();
    expect(coverUrl(null)).toBeNull();
    expect(coverUrl(undefined)).toBeNull();
  });
});

describe("artUrl (spec 0028, AC-6)", () => {
  const at = (id: string) =>
    `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`;

  it("picks the artwork with the lowest image id, whatever the order", () => {
    expect(
      artUrl({
        artworks: [
          { image_id: "arc" },
          { image_id: "ara" },
          { image_id: "arb" },
        ],
        screenshots: [{ image_id: "sc0" }],
      }),
    ).toBe(at("ara"));
  });

  it("falls back to the lowest screenshot when no artwork has an id", () => {
    expect(
      artUrl({
        artworks: [{ image_id: "  " }, null, {}],
        screenshots: [{ image_id: "scb" }, { image_id: "sca" }],
      }),
    ).toBe(at("sca"));
  });

  it("answers null with no art at all", () => {
    expect(artUrl({})).toBeNull();
    expect(artUrl({ artworks: [], screenshots: null })).toBeNull();
  });

  it("is carried on a summary, and survives an odd art list", () => {
    expect(
      normalizeSummary({ id: 1, name: "G", artworks: [{ image_id: "ar1" }] })
        .artUrl,
    ).toBe(at("ar1"));
    expect(normalizeSummary({ id: 1, name: "G" }).artUrl).toBeNull();
  });
});

describe("releaseDay", () => {
  it("reads 23:30 UTC on 31 December as that day and year", () => {
    expect(releaseDay(Date.UTC(2017, 11, 31, 23, 30) / 1000)).toEqual({
      releaseDate: "2017-12-31",
      releaseYear: 2017,
    });
  });

  it("reads a negative timestamp, before 1970", () => {
    expect(releaseDay(Date.UTC(1958, 9, 18) / 1000)).toEqual({
      releaseDate: "1958-10-18",
      releaseYear: 1958,
    });
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 1e20])(
    "answers null for %s instead of inventing a date",
    (value) => {
      expect(releaseDay(value)).toEqual({
        releaseDate: null,
        releaseYear: null,
      });
    },
  );
});

describe("gameType", () => {
  it.each([
    [0, "main_game"],
    [4, "standalone_expansion"],
    [8, "remake"],
    [9, "remaster"],
    [10, "expanded_game"],
    [1, "other"],
    [14, "other"],
    [99, "other"],
  ])("maps game_type %i to %s", (gameType, expected) => {
    expect(
      normalizeGame({ id: 1, name: "G", game_type: gameType }).gameType,
    ).toBe(expected);
  });

  it("answers null when IGDB sends no game_type", () => {
    expect(
      normalizeGame({ id: 1, name: "G", game_type: null }).gameType,
    ).toBeNull();
  });
});

describe("hidden (AC-10, AC-16)", () => {
  it.each([
    ["a main game", {}, false],
    ["no game_type", { game_type: null }, false],
    ["a DLC", { game_type: 1 }, true],
    ["an edition", { version_parent: 1942 }, true],
    [
      "the Erotic theme, expanded",
      { themes: [{ id: 42, name: "Erotic" }] },
      true,
    ],
    ["the Erotic theme, nameless", { themes: [{ id: 42 }] }, true],
    ["another theme", { themes: [{ id: 1, name: "Action" }] }, false],
  ])("is decided by the rule for %s", (_, fields, expected) => {
    const record = { id: 1, name: "G", game_type: 0, ...fields };
    expect(normalizeGame(record).hidden).toBe(expected);
  });

  it("reads bare theme ids on a summary record", () => {
    expect(normalizeSummary({ id: 1, name: "G", themes: [42] }).hidden).toBe(
      true,
    );
    expect(normalizeSummary({ id: 1, name: "G", themes: [1, 17] }).hidden).toBe(
      false,
    );
  });
});

describe("normalizeSummary", () => {
  it("keeps positive integer ids from bare ids or objects, and drops the rest", () => {
    const summary = normalizeSummary({
      id: 1,
      name: "G",
      genres: [12, { id: 31, name: "Adventure" }, 0, -3, 1.5, "8", null],
      platforms: [{ id: 6 }, { name: "No id" }],
    });
    expect(summary.genreIds).toEqual([12, 31]);
    expect(summary.platformIds).toEqual([6]);
  });

  it("scales the community rating to 10 at full precision", () => {
    const summary = normalizeSummary({
      id: 1,
      name: "G",
      rating: 87.654321,
      rating_count: 3,
    });
    expect(summary.communityRating).toBe(8.7654321);
    expect(summary.communityRatingCount).toBe(3);
  });

  it("treats a negative rating as missing", () => {
    expect(
      normalizeSummary({ id: 1, name: "G", rating: -5 }).communityRating,
    ).toBeNull();
  });
});
