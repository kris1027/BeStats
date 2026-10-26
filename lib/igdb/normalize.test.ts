import { describe, expect, it } from "vitest";
import {
  artUrl,
  companyNames,
  coverUrl,
  normalizeGame,
  normalizeSummary,
  pickGameTrailer,
  platformReleases,
  releaseDay,
  screenshotUrls,
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

describe("screenshotUrls (spec 0031, AC-6)", () => {
  it("dedupes by image id before sorting and capping at 12", () => {
    const ids = Array.from(
      { length: 14 },
      (_, i) => `s${String(i).padStart(2, "0")}`,
    );
    const urls = screenshotUrls(
      [...ids.reverse(), "s00", "s00"].map((image_id) => ({ image_id })),
    );
    expect(urls).toHaveLength(12);
    expect(urls[0]).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/s00.jpg",
    );
    expect(urls[1]).toMatch(/\/s01\.jpg$/);
    expect(urls[11]).toMatch(/\/s11\.jpg$/);
  });

  it("drops blank ids and answers an empty list with no screenshots", () => {
    expect(
      screenshotUrls([{ image_id: "  " }, { image_id: " sc9 " }, null]),
    ).toEqual(["https://images.igdb.com/igdb/image/upload/t_1080p/sc9.jpg"]);
    expect(screenshotUrls(null)).toEqual([]);
    expect(screenshotUrls(undefined)).toEqual([]);
  });
});

describe("a game's hero backdrop (spec 0031, AC-3)", () => {
  it("takes the lowest artwork over any screenshot", () => {
    const game = normalizeGame({
      id: 1,
      name: "G",
      artworks: [{ image_id: "ar9" }, { image_id: "ar2" }],
      screenshots: [{ image_id: "aa1" }],
    });
    expect(game.artUrl).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/ar2.jpg",
    );
  });

  it("falls back to the lowest screenshot when there is no artwork", () => {
    const game = normalizeGame({
      id: 1,
      name: "G",
      screenshots: [{ image_id: "sc7" }, { image_id: "sc3" }],
    });
    expect(game.artUrl).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/sc3.jpg",
    );
  });

  it("is null with neither, so the hero keeps its no backdrop layout", () => {
    expect(normalizeGame({ id: 1, name: "G" }).artUrl).toBeNull();
  });
});

describe("pickGameTrailer (spec 0031, AC-4)", () => {
  const video = (id: number, name: string, video_id = "abcdefghijk") => ({
    id,
    name,
    video_id,
  });

  it("takes the lowest id among trailers, in any case", () => {
    expect(
      pickGameTrailer([
        video(30, "Launch Trailer", "launch12345"),
        video(20, "REVEAL TRAILER", "reveal12345"),
        video(10, "Developer Diary"),
      ]),
    ).toEqual({ key: "reveal12345", name: "REVEAL TRAILER" });
  });

  it("skips a gameplay trailer and a bad id, so neither hides a good one", () => {
    expect(
      pickGameTrailer([
        video(1, "Gameplay Trailer"),
        video(2, "Trailer", "bad id!"),
        video(3, "Story Trailer", "story123456"),
      ]),
    ).toEqual({ key: "story123456", name: "Story Trailer" });
  });

  it("answers null with only gameplay videos or none", () => {
    expect(pickGameTrailer([video(1, "Gameplay Demo")])).toBeNull();
    expect(pickGameTrailer([video(1, "Gameplay Trailer")])).toBeNull();
    expect(pickGameTrailer(null)).toBeNull();
  });

  it("accepts a YouTube id of 6 to 20 safe characters and nothing outside", () => {
    expect(pickGameTrailer([video(1, "Trailer", "abcde")])).toBeNull();
    expect(pickGameTrailer([video(1, "Trailer", "a".repeat(21))])).toBeNull();
    expect(pickGameTrailer([video(1, "Trailer", "a_b-c6")])?.key).toBe(
      "a_b-c6",
    );
    expect(
      pickGameTrailer([video(1, "Trailer", "a".repeat(20))])?.key,
    ).toHaveLength(20);
  });

  it("skips a video with no name, and trims the name it keeps", () => {
    expect(
      pickGameTrailer([
        { id: 1, name: null, video_id: "noname12345" },
        video(2, "  Launch Trailer  ", "launch12345"),
      ]),
    ).toEqual({ key: "launch12345", name: "Launch Trailer" });
  });
});

describe("companyNames (spec 0031, AC-5)", () => {
  const entries = [
    { company: { id: 1, name: "CD Projekt RED" }, developer: true },
    { company: { id: 2, name: "WB Games" }, publisher: true },
    {
      company: { id: 1, name: "CD Projekt RED" },
      developer: true,
      publisher: true,
    },
    { company: { name: "Studio" }, developer: true },
    { company: { name: "studio" }, developer: true },
    { company: { id: 3, name: "  " }, developer: true },
  ];

  it("keeps IGDB's order and dedupes by id, else by name ignoring case", () => {
    expect(companyNames(entries, "developer")).toEqual([
      "CD Projekt RED",
      "Studio",
    ]);
  });

  it("puts a company flagged both ways in both lists", () => {
    expect(companyNames(entries, "publisher")).toEqual([
      "WB Games",
      "CD Projekt RED",
    ]);
  });
});

describe("franchises and similar games (spec 0031, AC-8, AC-9)", () => {
  it("puts the main franchise first and dedupes the rest by id", () => {
    const game = normalizeGame({
      id: 5,
      name: "G",
      franchise: { id: 2, name: "Main" },
      franchises: [
        { id: 1, name: "Other" },
        { id: 2, name: "Main" },
      ],
      similar_games: [9, 5, 8, 9],
    });
    expect(game.franchises).toEqual([
      { id: 2, name: "Main" },
      { id: 1, name: "Other" },
    ]);
    expect(game.similarGameIds).toEqual([9, 8]);
  });
});

describe("platformReleases (spec 0031, AC-10)", () => {
  const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
  const pc = { id: 6, name: "PC" };
  const ps5 = { id: 167, name: "PlayStation 5" };

  it("takes each platform's earliest dated entry across regions", () => {
    expect(
      platformReleases([
        { date: at("2020-05-01"), date_format: 0, platform: pc },
        { date: at("2020-03-20"), date_format: 0, platform: pc },
      ]),
    ).toEqual([
      {
        platformId: 6,
        platform: "PC",
        release: { precision: "day", date: "2020-03-20" },
      },
    ]);
  });

  it("keeps IGDB's precision, the quarter from date_format", () => {
    expect(
      platformReleases([
        { date: at("2027-03-31"), date_format: 3, platform: pc },
        { date: at("2027-12-31"), date_format: 2, platform: ps5 },
        {
          date: at("2028-06-30"),
          date_format: { id: 1 },
          platform: { id: 7, name: "Switch" },
        },
      ]),
    ).toEqual([
      {
        platformId: 6,
        platform: "PC",
        release: { precision: "quarter", year: 2027, quarter: 1 },
      },
      {
        platformId: 167,
        platform: "PlayStation 5",
        release: { precision: "year", date: "2027-12-31" },
      },
      {
        platformId: 7,
        platform: "Switch",
        release: { precision: "month", date: "2028-06-30" },
      },
    ]);
  });

  it("reads TBD as TBA even with a placeholder date, and sorts it last", () => {
    expect(
      platformReleases([
        { date: at("2025-12-31"), date_format: 7, platform: ps5 },
        { date: at("2030-01-01"), date_format: 0, platform: pc },
      ]),
    ).toEqual([
      {
        platformId: 6,
        platform: "PC",
        release: { precision: "day", date: "2030-01-01" },
      },
      {
        platformId: 167,
        platform: "PlayStation 5",
        release: { precision: "tba" },
      },
    ]);
  });

  it("prefers a dated entry over a TBD one on the same platform", () => {
    expect(
      platformReleases([
        { date_format: 7, platform: pc },
        { date: at("2021-01-01"), date_format: 0, platform: pc },
      ]),
    ).toEqual([
      {
        platformId: 6,
        platform: "PC",
        release: { precision: "day", date: "2021-01-01" },
      },
    ]);
  });

  it("skips no platform, a nameless one, an unknown or missing format, and no date", () => {
    expect(
      platformReleases([
        { date: at("2021-01-01"), date_format: 0 },
        { date: at("2021-01-01"), date_format: 0, platform: { id: 9 } },
        { date: at("2021-01-01"), date_format: 99, platform: pc },
        { date: at("2021-01-01"), platform: pc },
        { date_format: 0, platform: pc },
        "junk",
      ]),
    ).toEqual([]);
  });

  it("keeps two platforms IGDB names alike apart by id", () => {
    const day = at("2020-01-01");
    expect(
      platformReleases([
        { date: day, date_format: 0, platform: { id: 1, name: "Arcade" } },
        { date: day, date_format: 0, platform: { id: 2, name: "Arcade" } },
      ]).map((entry) => entry.platformId),
    ).toEqual([1, 2]);
  });

  it("breaks a tie by platform name ignoring case", () => {
    const day = at("2015-05-19");
    expect(
      platformReleases([
        { date: day, date_format: 0, platform: { id: 1, name: "xbox One" } },
        { date: day, date_format: 0, platform: { id: 2, name: "PC" } },
      ]).map((entry) => entry.platform),
    ).toEqual(["PC", "xbox One"]);
  });

  it("maps date_format 4 to 6 to Q2 to Q4", () => {
    expect(
      platformReleases([
        {
          date: at("2027-06-30"),
          date_format: 4,
          platform: { id: 1, name: "A" },
        },
        {
          date: at("2027-09-30"),
          date_format: 5,
          platform: { id: 2, name: "B" },
        },
        {
          date: at("2027-12-31"),
          date_format: 6,
          platform: { id: 3, name: "C" },
        },
      ]).map((entry) => entry.release),
    ).toEqual([
      { precision: "quarter", year: 2027, quarter: 2 },
      { precision: "quarter", year: 2027, quarter: 3 },
      { precision: "quarter", year: 2027, quarter: 4 },
    ]);
  });

  it("reads the year from the UTC timestamp, late on 31 December", () => {
    const lateNewYearsEve = Date.parse("2026-12-31T23:30:00Z") / 1000;
    expect(
      platformReleases([
        { date: lateNewYearsEve, date_format: 6, platform: pc },
        { date: lateNewYearsEve, date_format: 2, platform: ps5 },
      ]).map((entry) => entry.release),
    ).toEqual([
      { precision: "quarter", year: 2026, quarter: 4 },
      { precision: "year", date: "2026-12-31" },
    ]);
  });

  it("orders several TBA platforms by name after every dated one", () => {
    expect(
      platformReleases([
        { date_format: 7, platform: { id: 3, name: "xbox" } },
        { date_format: 7, platform: { id: 4, name: "Switch" } },
        { date: at("2040-01-01"), date_format: 0, platform: pc },
      ]).map((entry) => entry.platform),
    ).toEqual(["PC", "Switch", "xbox"]);
  });

  it("groups by platform id, keeping one line per platform", () => {
    expect(
      platformReleases([
        { date: at("2020-01-01"), date_format: 0, platform: pc },
        { date_format: 7, platform: pc },
        { date: at("2019-06-01"), date_format: 1, platform: pc },
      ]),
    ).toEqual([
      {
        platformId: 6,
        platform: "PC",
        release: { precision: "month", date: "2019-06-01" },
      },
    ]);
  });
});
