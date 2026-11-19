import { afterEach, describe, expect, it, vi } from "vitest";

import { IgdbError, IgdbValidationError } from "@/lib/igdb/errors";

/**
 * covers: spec 0025, AC-7, AC-8
 *
 * The page body and its metadata both branch on `loadGame`, so its three
 * outcomes are the contract. The cached read is replaced; `IgdbError` and
 * `isIgdbNotFound` are the real ones, so the kind check is exercised as is.
 */
const getGame = vi.fn();

vi.mock("@/lib/igdb", async () => {
  const errors = await import("@/lib/igdb/errors");
  return {
    getGame: (id: number) => getGame(id),
    isIgdbNotFound: errors.isIgdbNotFound,
    IgdbError: errors.IgdbError,
  };
});

const { loadGame } = await import("./load-game");

afterEach(() => getGame.mockReset());

describe("loadGame", () => {
  it("returns the game when IGDB has a visible one", async () => {
    getGame.mockResolvedValue({
      id: 1942,
      name: "The Witcher 3",
      hidden: false,
    });

    expect(await loadGame(1942)).toEqual({
      kind: "found",
      game: { id: 1942, name: "The Witcher 3", hidden: false },
    });
  });

  it("reports a hidden game as not found", async () => {
    getGame.mockResolvedValue({ id: 7, name: "A DLC", hidden: true });

    expect(await loadGame(7)).toEqual({ kind: "not_found" });
  });

  it("reports an IGDB not_found as not found", async () => {
    getGame.mockRejectedValue(new IgdbError("not_found", "games", "gone"));

    expect(await loadGame(999)).toEqual({ kind: "not_found" });
  });

  it.each([
    "timeout",
    "rate_limited",
    "upstream",
    "unauthorized",
    "bad_response",
  ] as const)(
    "reports a %s failure as failed, never as not found",
    async (kind) => {
      getGame.mockRejectedValue(new IgdbError(kind, "games", "x"));

      expect(await loadGame(1942)).toEqual({ kind: "failed" });
    },
  );

  it.each([
    ["a TypeError", new TypeError("bug")],
    ["an IgdbValidationError", new IgdbValidationError("id", "bad id")],
  ])("rethrows %s", async (_, bug) => {
    getGame.mockRejectedValue(bug);

    await expect(loadGame(1942)).rejects.toBe(bug);
  });
});
