import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import game1942 from "./__fixtures__/game-1942.json";
import {
  installIgdbMock,
  restoreIgdbMock,
  settle,
} from "./__fixtures__/helpers";
import { type IgdbError, IgdbValidationError } from "./errors";
import { fetchGame as fetchValidGame } from "./games";
import { assertGameId } from "./validation";

/** The inner read, given the input `reads.ts` would check first. */
const fetchGame = async (id: number) => fetchValidGame(assertGameId(id));

/**
 * `getGame`'s inner read and the normalization behind it, against a payload
 * captured from IGDB on 2026-10-17 (spec 0023, AC-9, AC-15, AC-16).
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

const witcher = game1942[0];

async function readWith(record: unknown) {
  installIgdbMock({ igdb: [{ body: [record] }] });
  return settle(fetchGame(1942));
}

describe("fetchGame", () => {
  it("normalizes a game in exactly one request", async () => {
    const mock = installIgdbMock({ igdb: [{ body: game1942 }] });

    const { value: game } = await settle(fetchGame(1942));

    expect(mock.igdbCalls).toHaveLength(1);
    expect(mock.body()).toContain("where (id = 1942); limit 1;");
    expect(game).toMatchObject({
      id: 1942,
      name: "The Witcher 3: Wild Hunt",
      slug: "the-witcher-3-wild-hunt",
      coverUrl:
        "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/coaarl.jpg",
      releaseDate: "2015-05-19",
      releaseYear: 2015,
      gameType: "main_game",
      hidden: false,
    });
    expect(game?.communityRating).toBeCloseTo(witcher.rating / 10, 10);
    expect(game?.communityRatingCount).toBe(witcher.rating_count);
    expect(game?.platforms.length).toBeGreaterThan(0);
    expect(game?.genres[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
    });
    expect(game?.summary).toBeTruthy();
    // The fields spec 0031 added, from the same one request (AC-2).
    expect(game?.storyline).toBeTruthy();
    expect(game?.artUrl).toMatch(/\/t_1080p\/.+\.jpg$/);
    expect(game?.screenshotUrls).toHaveLength(12);
    expect(game?.trailer).toEqual({
      key: "5nLipy-Z4yo",
      name: "The Begining trailer",
    });
    expect(game?.similarGameIds).toEqual(witcher.similar_games);
    expect(game?.developers.length).toBeGreaterThan(0);
    expect(game?.publishers).toContain("WB Games");
    expect(game?.gameModes).toEqual([{ id: 1, name: "Single player" }]);
    expect(game?.franchises).toEqual([{ id: 452, name: "The Witcher" }]);
    expect(game?.series).toEqual([{ id: 62, name: "The Witcher" }]);
    expect(game?.gameEngines).toEqual([{ id: 24, name: "REDengine" }]);
    expect(game?.platformReleases[0]).toEqual({
      platform: "PC (Microsoft Windows)",
      release: { precision: "day", date: "2015-05-19" },
    });
    expect(game?.platformReleases.at(-1)?.platform).toBe("Nintendo Switch 2");
    expect(Object.keys(game ?? {}).some((key) => key.includes("_"))).toBe(
      false,
    );
  });

  it("raises not_found for an empty answer", async () => {
    installIgdbMock({ igdb: [{ body: [] }] });
    const { error } = await settle(fetchGame(1));
    expect((error as IgdbError).kind).toBe("not_found");
  });

  it("raises bad_response, with nothing partial, without an id or name", async () => {
    for (const record of [{ id: 1942 }, { name: "Nameless id" }]) {
      const { error, value } = await readWith(record);
      expect(value).toBeUndefined();
      expect((error as IgdbError).kind).toBe("bad_response");
      restoreIgdbMock();
      vi.useFakeTimers();
    }
  });

  it("keeps a game whose optional fields are malformed, reading them as null", async () => {
    const { error, value } = await readWith({
      id: 3,
      name: "Odd",
      first_release_date: "soon",
      rating: "high",
      rating_count: {},
      game_type: "main",
      slug: 5,
      summary: [],
      platforms: "PC",
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      id: 3,
      name: "Odd",
      releaseDate: null,
      communityRating: null,
      communityRatingCount: null,
      gameType: null,
      slug: null,
      summary: null,
      platforms: [],
      hidden: false,
    });
  });

  it("still hides an edition whose version_parent has an odd shape", async () => {
    const { value } = await readWith({
      id: 4,
      name: "Deluxe",
      version_parent: { id: 1942 },
    });
    expect(value?.hidden).toBe(true);
  });

  it("returns a game that fails the catalog filter, marked hidden", async () => {
    const { value } = await readWith({ id: 7, name: "A DLC", game_type: 1 });
    expect(value?.hidden).toBe(true);
    expect(value?.gameType).toBe("other");
  });

  it("throws IgdbValidationError for a bad id, before any request", async () => {
    const mock = installIgdbMock();
    for (const id of [0, -1, 1.5, Number.NaN]) {
      await expect(fetchGame(id)).rejects.toBeInstanceOf(IgdbValidationError);
    }
    expect(mock.mock).not.toHaveBeenCalled();
  });
});

describe("missing stays missing", () => {
  it("turns absent values into null, never zero or today", async () => {
    const { value } = await readWith({ id: 2, name: "Bare" });
    expect(value).toEqual({
      id: 2,
      name: "Bare",
      slug: null,
      coverUrl: null,
      releaseDate: null,
      releaseYear: null,
      platforms: [],
      genres: [],
      themes: [],
      summary: null,
      gameType: null,
      communityRating: null,
      communityRatingCount: null,
      hidden: false,
      storyline: null,
      artUrl: null,
      screenshotUrls: [],
      trailer: null,
      similarGameIds: [],
      developers: [],
      publishers: [],
      gameModes: [],
      playerPerspectives: [],
      franchises: [],
      series: [],
      gameEngines: [],
      platformReleases: [],
    });
  });

  it("keeps the read when every new list holds odd entries (spec 0031, AC-2)", async () => {
    const { value, error } = await readWith({
      id: 7,
      name: "Odd",
      storyline: 12,
      artworks: "junk",
      screenshots: [null, { image_id: 4 }, { image_id: "sc1" }],
      videos: [{ id: "x" }, "junk"],
      similar_games: ["a", -1, 9],
      involved_companies: [{ company: null }, { developer: true }],
      game_modes: [{ id: 1 }],
      franchise: "junk",
      franchises: { id: 1 },
      release_dates: [{ date_format: "day", platform: 6 }],
    });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      storyline: null,
      screenshotUrls: [
        "https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg",
      ],
      trailer: null,
      similarGameIds: [9],
      developers: [],
      gameModes: [],
      franchises: [],
      platformReleases: [],
    });
  });

  it("treats a rating or rating count of 0, and blank text, as missing", async () => {
    const { value } = await readWith({
      id: 3,
      name: "Unrated",
      rating: 0,
      rating_count: 0,
      summary: "  ",
      slug: "",
      cover: { image_id: "" },
    });
    expect(value?.communityRating).toBeNull();
    expect(value?.communityRatingCount).toBeNull();
    expect(value?.summary).toBeNull();
    expect(value?.slug).toBeNull();
    expect(value?.coverUrl).toBeNull();
  });

  it("reads the release day in UTC, also before 1970", async () => {
    const late = await readWith({
      id: 4,
      name: "Late",
      first_release_date: Date.UTC(2026, 11, 31, 23, 30) / 1000,
    });
    expect(late.value?.releaseDate).toBe("2026-12-31");
    expect(late.value?.releaseYear).toBe(2026);

    restoreIgdbMock();
    vi.useFakeTimers();
    const early = await readWith({
      id: 5,
      name: "Early",
      first_release_date: Date.UTC(1962, 0, 1) / 1000,
    });
    expect(early.value?.releaseDate).toBe("1962-01-01");
  });

  it("drops a platform, genre or theme without a name, and keeps the read", async () => {
    const { value } = await readWith({
      id: 6,
      name: "Partial",
      platforms: [{ id: 6, name: "PC" }, { id: 48 }, "junk"],
      genres: [{ id: 12, name: "" }],
      themes: [{ id: 42 }],
    });
    expect(value?.platforms).toEqual([{ id: 6, name: "PC" }]);
    expect(value?.genres).toEqual([]);
    expect(value?.themes).toEqual([]);
    // The nameless Erotic theme still counts for the filter.
    expect(value?.hidden).toBe(true);
  });
});
