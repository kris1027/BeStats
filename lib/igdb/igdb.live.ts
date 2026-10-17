import { describe, expect, it } from "vitest";
import { catalogWhereClause, isCatalogVisible } from "./catalog-filter";
import { igdbRequest } from "./client";
import {
  IGDB_EROTIC_THEME_ID,
  IGDB_SUMMARY_FIELDS,
  IGDB_VISIBLE_GAME_TYPES,
} from "./constants";
import { fetchDiscoverGames as fetchValidDiscoverGames } from "./discover";
import { loadIgdbCredentialsFromFile } from "./env";
import { fetchGame as fetchValidGame } from "./games";
import { buildQuery, type Condition, cond } from "./query";
import { fetchGameGenres, fetchGamePlatforms } from "./reference";
import { recordsSchema } from "./schemas";
import { fetchSearchGames as fetchValidSearchGames } from "./search";
import { getIgdbToken } from "./token";
import type { DiscoverGamesOptions, SearchGamesOptions } from "./types";
import {
  assertGameId,
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

const hasCredentials = loadIgdbCredentialsFromFile();

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

  it("matches any of a genre list", async () => {
    const [shooter, puzzle] = [5, 9];
    const page = await fetchDiscoverGames({
      genreIds: [shooter, puzzle],
      sort: "rating_count_desc",
    });
    expect(page.results.length).toBeGreaterThan(0);
    for (const game of page.results) {
      expect(
        game.genreIds.includes(shooter) || game.genreIds.includes(puzzle),
      ).toBe(true);
    }
    const onlyShooter = await fetchDiscoverGames({
      genreIds: [shooter],
      sort: "rating_count_desc",
    });
    expect(page.totalResults ?? 0).toBeGreaterThan(
      onlyShooter.totalResults ?? 0,
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
