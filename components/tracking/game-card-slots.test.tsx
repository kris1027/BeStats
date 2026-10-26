import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameTrackingState } from "@/lib/tracking/types";

/**
 * covers: spec 0030, AC-1, AC-2, AC-3, AC-6, AC-7, AC-9
 *
 * The two slots of a game card show the stored status as the library tabs
 * do. The grid read is the boundary, so it is what is replaced.
 */
const getGameGridStates = vi.fn();
vi.mock("@/lib/tracking/game-state", () => ({
  getGameGridStates: (...args: unknown[]) => getGameGridStates(...args),
  gameIdsKey: (ids: number[]) => [...ids].sort((a, b) => a - b).join(","),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-26",
}));
vi.mock("@/app/games/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { GameCardBadge, GameCardControls } = await import("./game-card-slots");

afterEach(() => {
  vi.clearAllMocks();
});

describe("GameCardBadge and GameCardControls", () => {
  const props = {
    gameId: 1942,
    name: "The Witcher 3",
    releaseDate: "2015-05-19" as string | null,
    gridGameIds: [7346, 1942],
    returnPath: "/games",
  };

  function grid(state?: GameTrackingState) {
    getGameGridStates.mockResolvedValue({
      kind: "ok",
      state: new Map(state ? [[1942, state]] : []),
    });
  }

  async function renderCard(
    overrides: Partial<typeof props> & { releasePill?: boolean } = {},
  ) {
    const card = { ...props, ...overrides };
    return render(
      <>
        {await GameCardBadge({ ...card, communityRating: 9.3 })}
        {await GameCardControls(card)}
      </>,
    );
  }

  function bookmark() {
    return screen.getByRole("button", { name: "Want to play: The Witcher 3" });
  }

  it("asks for the whole grid under one shared key and offers the unpressed bookmark (AC-1, AC-3)", async () => {
    grid();
    await renderCard();
    expect(getGameGridStates).toHaveBeenCalledWith("1942,7346");
    expect(bookmark()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
  });

  it("presses the bookmark on a released Want to play game, with no pill (AC-3, AC-7)", async () => {
    grid({ status: "want_to_play", rating: null });
    await renderCard();
    expect(bookmark()).toHaveAttribute("aria-pressed", "true");
    expect(
      document.querySelector('[data-slot="release-date"]'),
    ).not.toBeInTheDocument();
  });

  it("shows the release pill beside a wanted unreleased game, and Date TBA with no date (AC-7)", async () => {
    grid({ status: "want_to_play", rating: null });
    const { unmount } = await renderCard({ releaseDate: "2026-11-20" });
    expect(screen.getByText("Releases Nov 20, 2026")).toBeInTheDocument();
    unmount();

    await renderCard({ releaseDate: null });
    expect(
      screen.getByText("Release date to be announced"),
    ).toBeInTheDocument();
  });

  it("never shows the pill on an unpressed card or when the card prints the date itself (AC-7)", async () => {
    grid();
    const { unmount } = await renderCard({ releaseDate: "2026-11-20" });
    expect(screen.queryByText("Releases Nov 20, 2026")).not.toBeInTheDocument();
    unmount();

    grid({ status: "want_to_play", rating: null });
    await renderCard({ releaseDate: "2026-11-20", releasePill: false });
    expect(screen.queryByText("Releases Nov 20, 2026")).not.toBeInTheDocument();
    expect(bookmark()).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a scored Playing game's score and a read only chip, no button (AC-2, AC-6)", async () => {
    grid({ status: "playing", rating: 8 });
    await renderCard({ releaseDate: null });
    expect(screen.getByText("Your score")).toBeInTheDocument();
    expect(screen.queryByText("IGDB community rating")).not.toBeInTheDocument();
    expect(screen.getByText("Playing")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="release-date"]'),
    ).not.toBeInTheDocument();
  });

  it("never badges a Want to play game with a score, even if one were stored (AC-2)", async () => {
    grid({ status: "want_to_play", rating: 7 });
    await renderCard();
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
    expect(screen.queryByText("Your score")).not.toBeInTheDocument();
    expect(bookmark()).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps IGDB's rating on an unscored Finished game (AC-2, AC-6)", async () => {
    grid({ status: "finished", rating: null });
    await renderCard();
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["a visitor", { kind: "signed_out" }],
    ["a failed read", { kind: "failed" }],
  ])("gives %s the catalog card (AC-9)", async (_, read) => {
    getGameGridStates.mockResolvedValue(read);
    await renderCard({ releaseDate: null });
    expect(screen.getByText("IGDB community rating")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Release date to be announced"),
    ).not.toBeInTheDocument();
  });
});
