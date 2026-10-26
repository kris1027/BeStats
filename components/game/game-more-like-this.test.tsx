import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0031, AC-8
 *
 * The batch read and the cards are replaced; `IgdbError` is the real one.
 * IGDB's similar games order wins over the batch's, missing and hidden games
 * are dropped before the cap of 12, and only an `IgdbError` becomes the error
 * line.
 */
const readBatch = vi.fn();

vi.mock("@/lib/igdb", async () => ({
  IgdbError: (await import("@/lib/igdb/errors")).IgdbError,
  getGamesByIds: (...args: unknown[]) => readBatch(...args),
}));
// The shared frame lives beside the TMDB extras, which are never read here.
vi.mock("@/lib/tmdb", () => ({ TmdbError: class {} }));
vi.mock("@/lib/region", () => ({ getVisitorRegion: vi.fn() }));
vi.mock("@/components/catalog/list-cards", () => ({
  GameListCard: ({
    game,
    returnPath,
    gridGameIds,
  }: {
    game: { name: string };
    returnPath: string;
    gridGameIds: number[];
  }) => (
    <span data-return={returnPath} data-grid={gridGameIds.join(",")}>
      {game.name}
    </span>
  ),
}));

const { IgdbError } = await import("@/lib/igdb/errors");
const { GameMoreLikeThisContent } = await import("./game-more-like-this");

const game = (id: number, hidden = false) => ({
  id,
  name: `Game ${id}`,
  hidden,
});

beforeEach(() => {
  // The row's scroller measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => readBatch.mockReset());

async function renderFor(similarGameIds: number[]) {
  render(
    <>{await GameMoreLikeThisContent({ gameId: 1942, similarGameIds })}</>,
  );
}

const names = () =>
  [...document.querySelectorAll("li span")].map((span) => span.textContent);

describe("GameMoreLikeThisContent", () => {
  it("keeps IGDB's order although the batch comes back shuffled", async () => {
    readBatch.mockResolvedValue({
      found: [game(3), game(1), game(2)],
      missingIds: [],
    });

    await renderFor([2, 3, 1]);

    expect(readBatch).toHaveBeenCalledTimes(1);
    expect(readBatch).toHaveBeenCalledWith([2, 3, 1]);
    expect(
      screen.getByRole("heading", { name: "More like this" }),
    ).toBeVisible();
    expect(names()).toEqual(["Game 2", "Game 3", "Game 1"]);
    expect(screen.getByText("Game 2")).toHaveAttribute(
      "data-return",
      "/games/1942",
    );
  });

  it("drops missing and hidden games before keeping 12", async () => {
    const ids = Array.from({ length: 16 }, (_, index) => index + 1);
    readBatch.mockResolvedValue({
      found: ids.filter((id) => id !== 2).map((id) => game(id, id === 1)),
      missingIds: [2],
    });

    await renderFor(ids);

    expect(names()).toEqual(ids.slice(2, 14).map((id) => `Game ${id}`));
  });

  it("leaves the section out when every game is hidden or missing", async () => {
    readBatch.mockResolvedValue({ found: [game(5, true)], missingIds: [6] });

    expect(
      await GameMoreLikeThisContent({ gameId: 1942, similarGameIds: [5, 6] }),
    ).toBeNull();
  });

  it("keeps its heading with an IGDB error line and Retry on an IgdbError", async () => {
    readBatch.mockRejectedValue(new IgdbError("upstream", "games", "x"));

    await renderFor([5]);

    expect(
      screen.getByRole("heading", { name: "More like this" }),
    ).toBeVisible();
    expect(
      screen.getByText("Couldn't load similar games from IGDB."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/games/1942",
    );
  });

  it("rethrows any other error", async () => {
    readBatch.mockRejectedValue(new TypeError("bug"));

    await expect(
      GameMoreLikeThisContent({ gameId: 1942, similarGameIds: [5] }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
