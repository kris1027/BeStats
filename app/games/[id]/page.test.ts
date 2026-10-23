import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0025, AC-6, AC-7, AC-8, AC-10
 *
 * Until G10 every game page outcome is `noindex`, with no canonical or share
 * card. `loadGame` is replaced, so only the metadata branches are checked.
 */
const loadGame = vi.fn();

vi.mock("./load-game", () => ({
  loadGame: (id: number) => loadGame(id),
}));

const { generateMetadata } = await import("./page");

const GAME = {
  name: "The Witcher 3: Wild Hunt",
  releaseYear: 2015,
  summary: "RPG and sequel to The Witcher 2 (2011).",
};

function metadataFor(id: string) {
  return generateMetadata({
    params: Promise.resolve({ id }),
  } as Parameters<typeof generateMetadata>[0]);
}

afterEach(() => loadGame.mockReset());

describe("a found game's metadata (AC-10)", () => {
  it("is the name and year, the summary, and noindex with nothing else", async () => {
    loadGame.mockResolvedValue({ kind: "found", game: GAME });

    expect(await metadataFor("1942")).toEqual({
      title: "The Witcher 3: Wild Hunt (2015)",
      description: "RPG and sequel to The Witcher 2 (2011).",
      robots: { index: false },
    });
    expect(loadGame).toHaveBeenCalledWith(1942);
  });

  it("leaves the year and description out when IGDB has none", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { ...GAME, releaseYear: null, summary: null },
    });

    const metadata = await metadataFor("1942");

    expect(metadata.title).toBe("The Witcher 3: Wild Hunt");
    expect(metadata.description).toBeUndefined();
  });

  it("cuts a long summary at a word, within 160 characters", async () => {
    loadGame.mockResolvedValue({
      kind: "found",
      game: { ...GAME, summary: "word ".repeat(60) },
    });

    const metadata = await metadataFor("1942");

    expect(metadata.description?.length).toBeLessThanOrEqual(160);
  });
});

describe("a game page with nothing to show (AC-7, AC-8)", () => {
  it.each([
    ["not found", { kind: "not_found" }, "Game not found"],
    ["a failed IGDB read", { kind: "failed" }, "Game"],
  ])("is noindex for %s", async (_, result, title) => {
    loadGame.mockResolvedValue(result);

    expect(await metadataFor("1942")).toEqual({
      title,
      robots: { index: false },
    });
  });

  it("is noindex for a malformed id without asking IGDB (AC-6)", async () => {
    expect(await metadataFor("abc")).toEqual({
      title: "Game not found",
      robots: { index: false },
    });
    expect(loadGame).not.toHaveBeenCalled();
  });
});
