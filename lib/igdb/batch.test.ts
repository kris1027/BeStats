import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import summaries from "./__fixtures__/games-summaries.json";
import {
  installIgdbMock,
  restoreIgdbMock,
  settle,
} from "./__fixtures__/helpers";
import { fetchGamesByIds } from "./batch";
import { type IgdbError, IgdbValidationError } from "./errors";

/** The 500 id batch (spec 0023, AC-11). */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

describe("fetchGamesByIds", () => {
  it("reads every id in one request, deduped and sorted", async () => {
    const mock = installIgdbMock({ igdb: [{ body: summaries }] });

    const { value } = await settle(
      fetchGamesByIds([378958, 1942, 336481, 1942]),
    );

    expect(mock.igdbCalls).toHaveLength(1);
    expect(mock.body()).toContain(
      "where (id = (1942,336481,378958)); limit 500;",
    );
    expect(value?.found.map((game) => game.id).sort()).toEqual([
      1942, 336481, 378958,
    ]);
    expect(value?.missingIds).toEqual([]);
    const edition = value?.found.find((game) => game.id === 378958);
    expect(edition?.hidden).toBe(true);
    const witcher = value?.found.find((game) => game.id === 1942);
    expect(witcher?.genreIds.length).toBeGreaterThan(0);
  });

  it("reports ids IGDB did not return, or returned without a name, as missing", async () => {
    installIgdbMock({
      igdb: [{ body: [summaries[0], { id: 5 }, { id: 999, name: "Extra" }] }],
    });

    const { value } = await settle(fetchGamesByIds([1942, 5, 6]));

    expect(value?.found.map((game) => game.id)).toEqual([1942]);
    expect(value?.missingIds).toEqual([5, 6]);
  });

  it("makes no request for an empty list", async () => {
    const mock = installIgdbMock();
    const { value } = await settle(fetchGamesByIds([]));
    expect(value).toEqual({ found: [], missingIds: [] });
    expect(mock.mock).not.toHaveBeenCalled();
  });

  it("accepts 500 ids and refuses 501, before any request", async () => {
    const mock = installIgdbMock({ igdb: [{ body: [] }] });
    const ids = Array.from({ length: 501 }, (_, index) => index + 1);

    await expect(fetchGamesByIds(ids)).rejects.toBeInstanceOf(
      IgdbValidationError,
    );
    expect(mock.mock).not.toHaveBeenCalled();

    const { value } = await settle(fetchGamesByIds(ids.slice(0, 500)));
    expect(value?.missingIds).toHaveLength(500);
  });

  it("refuses an invalid id", async () => {
    installIgdbMock();
    await expect(fetchGamesByIds([1, 0])).rejects.toBeInstanceOf(
      IgdbValidationError,
    );
  });

  it("raises on a systemic failure instead of returning a short list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    installIgdbMock({ igdb: [{ status: 503 }] });
    const { error } = await settle(fetchGamesByIds([1942]));
    expect((error as IgdbError).kind).toBe("upstream");
  });
});
