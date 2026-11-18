import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installIgdbMock,
  restoreIgdbMock,
  settle,
} from "./__fixtures__/helpers";
import { fetchPopularGames as fetchValidPopularGames } from "./popularity";
import type { PopularGamesKind } from "./types";
import { assertPopularKind } from "./validation";

/** The inner read, given the input `reads.ts` would check first. */
const fetchPopularGames = async (kind: PopularGamesKind) =>
  fetchValidPopularGames(assertPopularKind(kind));

/**
 * covers: spec 0028, AC-4
 *
 * The popularity lists: the primitives in rank order, then one batch, with
 * hidden and missing games dropped and the rank kept.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

const EDITION = { id: 30, name: "Deluxe", version_parent: 1 };

describe("fetchPopularGames", () => {
  it("asks for the top 500 of its type, then batches those ids", async () => {
    const mock = installIgdbMock({
      igdb: [
        { body: [{ game_id: 2, value: 0.9 }] },
        { body: [{ id: 2, name: "Two" }] },
      ],
    });

    await settle(fetchPopularGames("popular"));

    expect(mock.igdbCalls[0].url).toBe(
      "https://api.igdb.com/v4/popularity_primitives",
    );
    expect(mock.body(0)).toBe(
      "fields game_id,value; where (popularity_type = 3); sort value desc; limit 500;",
    );
    expect(mock.igdbCalls[1].url).toBe("https://api.igdb.com/v4/games");
    expect(mock.body(1)).toContain("where (id = (2)); limit 500;");
  });

  it("reads Visits for trending", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [] }] });
    await settle(fetchPopularGames("trending"));
    expect(mock.body(0)).toContain("where (popularity_type = 1);");
  });

  it("keeps rank order, drops hidden, missing and repeated games", async () => {
    installIgdbMock({
      igdb: [
        {
          body: [
            { game_id: 10, value: 0.9 },
            { game_id: 30, value: 0.8 },
            { game_id: 40, value: 0.7 },
            { game_id: 10, value: 0.6 },
            { value: 0.5 },
            { game_id: 20, value: 0.4 },
          ],
        },
        {
          body: [{ id: 20, name: "Twenty" }, EDITION, { id: 10, name: "Ten" }],
        },
      ],
    });

    const { value } = await settle(fetchPopularGames("trending"));

    expect(value?.map((game) => game.id)).toEqual([10, 20]);
  });

  it("fails as a whole when the batch fails, never a short list", async () => {
    installIgdbMock({
      igdb: [{ body: [{ game_id: 10, value: 0.9 }] }, { status: 400 }],
    });

    const { error } = await settle(fetchPopularGames("popular"));

    expect(error).toBeDefined();
  });
});
