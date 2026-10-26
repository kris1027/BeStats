import { describe, expect, it } from "vitest";
import { catalogWhereClause, isCatalogVisible } from "./catalog-filter";
import { igdbRequest } from "./client";
import {
  IGDB_ART_LADDER,
  IGDB_COVER_LADDER,
  IGDB_DATE_FORMAT,
  IGDB_EROTIC_THEME_ID,
  IGDB_GAME_FIELDS,
  IGDB_IMAGE_BASE,
  IGDB_POPULARITY_TYPES,
  IGDB_SUMMARY_FIELDS,
  IGDB_VISIBLE_GAME_TYPES,
} from "./constants";
import { fetchDiscoverGames as fetchValidDiscoverGames } from "./discover";
import { getIgdbCredentials } from "./env";
import { fetchGame as fetchValidGame } from "./games";
import { platformReleases } from "./normalize";
import { fetchPopularGames as fetchValidPopularGames } from "./popularity";
import { buildQuery, type Condition, cond } from "./query";
import { fetchGameGenres, fetchGamePlatforms } from "./reference";
import { gameDetailSchema, recordsSchema } from "./schemas";
import { fetchSearchGames as fetchValidSearchGames } from "./search";
import { getIgdbToken } from "./token";
import type {
  DiscoverGamesOptions,
  PopularGamesKind,
  SearchGamesOptions,
} from "./types";
import {
  assertGameId,
  assertPopularKind,
  validateDiscoverOptions,
  validateSearchOptions,
} from "./validation";

/** The inner read, given the input `reads.ts` would check first. */
const fetchGame = async (id: number) => fetchValidGame(assertGameId(id));
/** The inner read, given the input `reads.ts` would check first. */
const fetchSearchGames = async (options: SearchGamesOptions) =>
  fetchValidSearchGames(validateSearchOptions(options));
/** The inner read, given the input `reads.ts` would check first. */
const fetchDiscoverGames = async (options: DiscoverGamesOptions) =>
  fetchValidDiscoverGames(validateDiscoverOptions(options));

/** The inner read, given the input `reads.ts` would check first. */
const fetchPopularGames = async (kind: PopularGamesKind) =>
  fetchValidPopularGames(assertPopularKind(kind));

/**
 * LIVE CHECK. This file talks to the real Twitch and IGDB APIs.
 *
 * It is the facts gate of spec 0023 (AC-18): the pinned ids and query syntax
 * came from knowledge, because IGDB's docs site refused automated reads, so
 * this proves them against IGDB itself. It is not part of `pnpm test`, and its
 * result is never a substitute for the fixture suite, or the other way round.
 *
 * Run: `pnpm igdb:live`. Without credentials it skips rather than fails.
 */

// Vitest does not load `.env.local` the way `next dev` does. Node's own loader
// reads it without this file naming either variable (AC-2), and never
// overrides a value already in the environment.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No env file is a normal state, for example in CI.
}

function credentialsConfigured(): boolean {
  try {
    getIgdbCredentials();
    return true;
  } catch {
    return false;
  }
}

const hasCredentials = credentialsConfigured();

/** The Witcher 3, a stable main game with a cover, rating and themes. */
const KNOWN_GAME_ID = 1942;

/** Every hidden game type IGDB had on 2026-10-17, by id. */
const KNOWN_HIDDEN_GAME_TYPES: Record<number, string> = {
  1: "DLC",
  2: "Expansion",
  3: "Bundle",
  5: "Mod",
  6: "Episode",
  7: "Season",
  11: "Port",
  12: "Fork",
  13: "Pack / Addon",
  14: "Update",
};

const VISIBLE_NAMES: Record<number, string> = {
  0: "Main Game",
  4: "Standalone Expansion",
  8: "Remake",
  9: "Remaster",
  10: "Expanded Game",
};

type LiveRecord = {
  id: number;
  name?: string;
  game_type?: number | null;
  version_parent?: number | null;
  themes?: number[] | null;
  genres?: number[] | null;
  platforms?: number[] | null;
};

async function games(body: string) {
  const { data, totalCount } = await igdbRequest("games", body, recordsSchema);
  return { data: data as LiveRecord[], totalCount };
}

/** A record the way `isCatalogVisible` reads it. */
function asCatalog(record: LiveRecord) {
  return {
    gameType: record.game_type ?? null,
    versionParent: record.version_parent ?? null,
    themeIds: record.themes ?? [],
  };
}

/** Whether a game id comes back once the catalog filter is in the query. */
async function passesQueryFilter(id: number): Promise<boolean> {
  const { data } = await games(
    buildQuery({
      fields: ["name"],
      where: [cond.is("id", id), catalogWhereClause()],
      limit: 1,
    }),
  );
  return data.length === 1;
}

/** One sample record matching a condition, or null when IGDB has none. */
async function sample(where: Condition): Promise<LiveRecord | null> {
  const { data } = await games(
    buildQuery({ fields: IGDB_SUMMARY_FIELDS, where: [where], limit: 1 }),
  );
  return data[0] ?? null;
}

describe.skipIf(!hasCredentials)("IGDB live check (real network)", () => {
  it("is issued a token by Twitch", async () => {
    const token = await getIgdbToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it("reads a known game and still parses it", async () => {
    const game = await fetchGame(KNOWN_GAME_ID);
    expect(game.name).toBe("The Witcher 3: Wild Hunt");
    expect(game.releaseDate).toBe("2015-05-19");
    expect(game.gameType).toBe("main_game");
    expect(game.hidden).toBe(false);
    expect(game.communityRating).toBeGreaterThan(5);
    expect(game.platforms.length).toBeGreaterThan(0);
    expect(game.genres.length).toBeGreaterThan(0);
  });

  it("reads every field spec 0031 added, in the shapes it parses (AC-14)", async () => {
    const { data } = await games(
      buildQuery({
        fields: IGDB_GAME_FIELDS,
        where: [cond.is("id", KNOWN_GAME_ID)],
        limit: 1,
      }),
    );
    const record = gameDetailSchema.parse(data[0]);
    expect(record.storyline).toBeTruthy();
    for (const list of [
      record.artworks,
      record.screenshots,
      record.videos,
      record.similar_games,
      record.involved_companies,
      record.game_modes,
      record.player_perspectives,
      record.franchises,
      record.collections,
      record.game_engines,
      record.release_dates,
    ]) {
      expect(list?.length).toBeGreaterThan(0);
    }
    for (const entry of record.involved_companies as {
      company: { name: string };
      developer: unknown;
      publisher: unknown;
    }[]) {
      expect(typeof entry.developer).toBe("boolean");
      expect(typeof entry.publisher).toBe("boolean");
      expect(entry.company.name).toBeTruthy();
    }
    for (const video of record.videos as { video_id: string }[]) {
      expect(video.video_id).toMatch(/^[A-Za-z0-9_-]{6,20}$/);
    }
    for (const date of record.release_dates as {
      date_format: number;
      platform: { id: number; name: string };
    }[]) {
      expect(Object.keys(IGDB_DATE_FORMAT).map(Number)).toContain(
        date.date_format,
      );
      expect(date.platform.name).toBeTruthy();
    }

    const game = await fetchGame(KNOWN_GAME_ID);
    expect(game.trailer).not.toBeNull();
    expect(game.developers).toContain("CD Projekt RED");
    expect(game.platformReleases.length).toBeGreaterThan(0);
  });

  it("matches the pinned date_format ids to IGDB's date_formats (AC-14)", async () => {
    const { data } = await igdbRequest(
      "date_formats",
      buildQuery({
        fields: ["format"],
        sort: { field: "id", direction: "asc" },
        limit: 50,
      }),
      recordsSchema,
    );
    const formats = Object.fromEntries(
      (data as { id: number; format: string }[]).map((row) => [
        row.id,
        row.format,
      ]),
    );
    expect(formats).toMatchObject({
      0: "YYYYMMDD",
      1: "YYYYMM",
      2: "YYYY",
      3: "YYYYQ1",
      4: "YYYYQ2",
      5: "YYYYQ3",
      6: "YYYYQ4",
      7: "TBD",
    });
    expect(Object.keys(IGDB_DATE_FORMAT).map(Number)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("puts a quarter entry's UTC timestamp inside its stated quarter (AC-14)", async () => {
    for (const formatId of [3, 4, 5, 6]) {
      const { data } = await igdbRequest(
        "release_dates",
        buildQuery({
          fields: ["date", "date_format", "y", "platform.name"],
          where: [cond.is("date_format", formatId), cond.notNull("date")],
          sort: { field: "id", direction: "desc" },
          limit: 1,
        }),
        recordsSchema,
      );
      const row = data[0] as { date: number; y: number } | undefined;
      if (row === undefined) continue;
      const day = new Date(row.date * 1000);
      const quarter = formatId - 2;
      expect(day.getUTCFullYear()).toBe(row.y);
      expect(Math.floor(day.getUTCMonth() / 3) + 1).toBe(quarter);
      const [release] = platformReleases([
        { ...row, platform: { id: 1, name: "Live" } },
      ]);
      expect(release?.release).toEqual({
        precision: "quarter",
        year: row.y,
        quarter,
      });
    }
  });

  it("matches the pinned game type ids to their names, and reports new ones", async () => {
    const { data } = await igdbRequest(
      "game_types",
      buildQuery({
        fields: ["type"],
        sort: { field: "id", direction: "asc" },
        limit: 500,
      }),
      recordsSchema,
    );
    const types = data as { id: number; type: string }[];
    for (const id of Object.keys(IGDB_VISIBLE_GAME_TYPES).map(Number)) {
      expect(types.find((type) => type.id === id)?.type).toBe(
        VISIBLE_NAMES[id],
      );
    }
    const unpinned = types.filter(
      (type) =>
        !(type.id in VISIBLE_NAMES) && !(type.id in KNOWN_HIDDEN_GAME_TYPES),
    );
    if (unpinned.length > 0) {
      console.warn(
        `IGDB has game types this module has not seen: ${JSON.stringify(unpinned)}. They normalize to "other" and stay hidden.`,
      );
    }
  });

  it("matches the pinned Erotic theme id to its name", async () => {
    const { data } = await igdbRequest(
      "themes",
      buildQuery({
        fields: ["name"],
        where: [cond.is("id", IGDB_EROTIC_THEME_ID)],
        limit: 1,
      }),
      recordsSchema,
    );
    expect((data[0] as { name: string }).name).toBe("Erotic");
  });

  it("excludes an edition and an Erotic themed game, by query and by rule", async () => {
    const edition = await sample(
      cond.all([cond.notNull("version_parent"), cond.is("game_type", 0)]),
    );
    const erotic = await sample(cond.anyOf("themes", [IGDB_EROTIC_THEME_ID]));
    for (const record of [edition, erotic]) {
      expect(record).not.toBeNull();
      const id = (record as LiveRecord).id;
      expect(await passesQueryFilter(id)).toBe(false);
      expect(isCatalogVisible(asCatalog(record as LiveRecord))).toBe(false);
      expect((await fetchGame(id)).hidden).toBe(true);
    }
  });

  it("keeps a game with no themes, by query and by rule", async () => {
    const record = await sample(
      cond.all([
        cond.isNull("themes"),
        cond.is("game_type", 0),
        cond.isNull("version_parent"),
      ]),
    );
    expect(record).not.toBeNull();
    const game = record as LiveRecord;
    expect(await passesQueryFilter(game.id)).toBe(true);
    expect(isCatalogVisible(asCatalog(game))).toBe(true);
    expect((await fetchGame(game.id)).hidden).toBe(false);
  });

  it("keeps a game with no game type, by query and by rule", async () => {
    // Written without the catalog clause, so the query filter below is a
    // real test rather than a restatement of how the sample was found.
    const record = await sample(
      cond.all([
        cond.isNull("game_type"),
        cond.isNull("version_parent"),
        cond.either([
          cond.isNull("themes"),
          cond.noneOf("themes", [IGDB_EROTIC_THEME_ID]),
        ]),
      ]),
    );
    if (record === null) {
      // None existed on 2026-10-17, so no live record can prove the query
      // keeps one; the sample query itself proved `game_type = null` parses.
      // Say so plainly instead of passing on a count that is 0 either way.
      console.warn(
        "UNPROVEN LIVE: IGDB has no game without a game_type, so the query filter's handling of one is checked by the rule only.",
      );
      expect(
        isCatalogVisible({ gameType: null, versionParent: null, themeIds: [] }),
      ).toBe(true);
      return;
    }
    expect(await passesQueryFilter(record.id)).toBe(true);
    expect(isCatalogVisible(asCatalog(record))).toBe(true);
    expect((await fetchGame(record.id)).hidden).toBe(false);
  });

  it("matches any of a platform list", async () => {
    const [switch1, switch2] = [130, 508];
    const page = await fetchDiscoverGames({
      platformIds: [switch1, switch2],
      sort: "rating_count_desc",
    });
    expect(page.results.length).toBeGreaterThan(0);
    for (const game of page.results) {
      expect(
        game.platformIds.includes(switch1) ||
          game.platformIds.includes(switch2),
      ).toBe(true);
    }
    const onlySwitch2 = await fetchDiscoverGames({
      platformIds: [switch2],
      sort: "rating_count_desc",
    });
    expect(page.totalResults ?? 0).toBeGreaterThan(
      onlySwitch2.totalResults ?? 0,
    );
  });

  it("applies a where filter beside search, and reports the count header", async () => {
    const switchPlatform = 130;
    const page = await fetchSearchGames({
      query: "zelda",
      platformIds: [switchPlatform],
    });
    expect(page.results.length).toBeGreaterThan(0);
    for (const game of page.results) {
      expect(game.platformIds).toContain(switchPlatform);
      expect(game.hidden).toBe(false);
    }
    console.info(
      `count header on search: ${page.totalResults === null ? "absent" : page.totalResults}`,
    );
    const discover = await fetchDiscoverGames({ sort: "rating_desc" });
    console.info(
      `count header on a plain where: ${discover.totalResults === null ? "absent" : discover.totalResults}`,
    );
  });

  it("keeps a ; and a quote inside the search text literal", async () => {
    for (const query of [
      `zelda; where id = ${KNOWN_GAME_ID}`,
      `zelda"; where id = ${KNOWN_GAME_ID};`,
    ]) {
      const page = await fetchSearchGames({ query });
      expect(page.results.map((game) => game.id)).not.toContain(KNOWN_GAME_ID);
    }
  });

  it("builds a cover URL that answers 200", async () => {
    const game = await fetchGame(KNOWN_GAME_ID);
    expect(game.coverUrl).not.toBeNull();
    const response = await fetch(game.coverUrl as string, { method: "HEAD" });
    expect(response.status).toBe(200);
  });

  // spec 0025, AC-12: the loader's ladder widths are IGDB's real ones.
  it("serves every cover ladder rung at its stated width", async () => {
    const game = await fetchGame(KNOWN_GAME_ID);
    const file = (game.coverUrl as string).split("/").at(-1);
    for (const { size, width } of IGDB_COVER_LADDER) {
      const response = await fetch(`${IGDB_IMAGE_BASE}/${size}/${file}`);
      expect(response.status, size).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(jpegWidth(bytes), size).toBe(width);
    }
  });

  // spec 0028, AC-6: the art ladder's widths are IGDB's real ones.
  it("serves every art ladder rung at its stated width", async () => {
    const [game] = (
      await fetchDiscoverGames({ sort: "rating_count_desc", pageSize: 24 })
    ).results.filter((result) => result.artUrl !== null);
    expect(game, "a well known game with art").toBeDefined();
    const file = (game.artUrl as string).split("/").at(-1);
    for (const { size, width } of IGDB_ART_LADDER) {
      const response = await fetch(`${IGDB_IMAGE_BASE}/${size}/${file}`);
      expect(response.status, size).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const real = jpegSize(bytes);
      if (size.startsWith("t_screenshot")) {
        // A fixed 16:9 crop: always exactly this wide.
        expect(real?.width, size).toBe(width);
      } else {
        // Fit to a height, 9/16 of the 16:9 width; never wider than that.
        expect(real?.height, size).toBe((width * 9) / 16);
        expect(real?.width ?? Infinity, size).toBeLessThanOrEqual(width);
      }
    }
  });

  // spec 0028, AC-2, AC-6: the pinned popularity types are IGDB's own.
  it("matches the pinned popularity type ids to their names and source", async () => {
    const { data } = await igdbRequest(
      "popularity_types",
      buildQuery({ fields: ["name", "popularity_source"], limit: 500 }),
      recordsSchema,
    );
    const types = data as {
      id: number;
      name: string;
      popularity_source: number;
    }[];
    for (const { id, name } of Object.values(IGDB_POPULARITY_TYPES)) {
      const type = types.find((entry) => entry.id === id);
      expect(type?.name).toBe(name);
      expect(type?.popularity_source, `${name} comes from IGDB`).toBe(121);
    }
  });

  it("reads both popularity lists as visible games in rank order", async () => {
    for (const kind of ["trending", "popular"] as const) {
      const games = await fetchPopularGames(kind);
      expect(games.length, kind).toBeGreaterThan(24);
      expect(games.every((game) => !game.hidden)).toBe(true);
      expect(new Set(games.map((game) => game.id)).size).toBe(games.length);
      console.info(`${kind}: ${games.length} visible games`);
    }
  });

  // spec 0028, AC-2: Recently released keeps its hype floor only while the
  // window holds at least 12 games; fewer means the spec switches the sort.
  it("finds at least 12 hyped games released in the last 60 days", async () => {
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const page = await fetchDiscoverGames({
      sort: "hypes_desc",
      minHypes: 1,
      releasedFrom: day(-59),
      releasedTo: day(0),
      pageSize: 24,
    });
    console.info(`recently released with hypes: ${page.totalResults}`);
    expect(page.results.length).toBeGreaterThanOrEqual(12);
  });

  // spec 0029, AC-7, AC-19: a `[]` genre list means all of its ids.
  it("matches every genre of a two genre filter", async () => {
    const page = await fetchDiscoverGames({
      sort: "rating_count_desc",
      genreIds: [5, 31],
      pageSize: 24,
    });
    expect(page.results.length).toBeGreaterThan(0);
    for (const game of page.results) {
      expect(game.genreIds, game.name).toEqual(expect.arrayContaining([5, 31]));
    }
    const onlyShooter = await fetchDiscoverGames({
      sort: "rating_count_desc",
      genreIds: [5],
    });
    expect(page.totalResults ?? 0).toBeLessThan(onlyShooter.totalResults ?? 0);
  });

  // spec 0029, AC-5, AC-19: with the sort field not required, the unrated
  // games follow every rated one and are counted.
  it("puts unrated games after rated ones and counts them", async () => {
    const options = {
      sort: "rating_count_desc",
      platformIds: [508],
      pageSize: 24,
    } as const;
    const rated = await fetchDiscoverGames(options);
    const all = await fetchDiscoverGames({
      ...options,
      requireSortField: false,
    });
    const ratedCount = rated.totalResults ?? 0;
    console.info(
      `Switch 2: ${ratedCount} rated of ${all.totalResults} games in total`,
    );
    expect(all.totalResults ?? 0).toBeGreaterThan(ratedCount);
    expect(ratedCount).toBeLessThan(24 * 50);

    // The page holding the last rated game and the first unrated one.
    const page = Math.floor(ratedCount / 24) + 1;
    const boundary = await fetchDiscoverGames({
      ...options,
      requireSortField: false,
      page,
    });
    boundary.results.forEach((game, index) => {
      const isRated = (page - 1) * 24 + index < ratedCount;
      expect(game.communityRatingCount !== null, game.name).toBe(isRated);
    });
  });

  it("reads the genre and platform lists", async () => {
    const genres = await fetchGameGenres();
    const platforms = await fetchGamePlatforms();
    expect(genres.length).toBeGreaterThan(10);
    expect(platforms.length).toBeGreaterThan(50);
    expect(platforms.length).toBeLessThan(500);
  });
});

describe.skipIf(hasCredentials)("IGDB live check", () => {
  it("skips without credentials, which is not a failure", () => {
    expect(hasCredentials).toBe(false);
  });
});

/** A JPEG's pixel width, or null. Enough to confirm a cover size. */
function jpegWidth(bytes: Uint8Array): number | null {
  return jpegSize(bytes)?.width ?? null;
}

/**
 * A JPEG's pixel size, read from its first start of frame marker, or null,
 * without an image library.
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}
