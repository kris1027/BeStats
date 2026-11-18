import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0026, AC-1, AC-8, AC-12
 *
 * The server slot decides between nothing, a failure line and the control,
 * and decides the release gate from the request's UTC day. The read and the
 * day are the boundaries, so they are what is replaced.
 */
const getGameTracking = vi.fn();
vi.mock("@/lib/tracking/game-state", () => ({
  getGameTracking: (...args: unknown[]) => getGameTracking(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-24",
}));
vi.mock("@/app/games/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { GameTrackingSlot } = await import("./game-tracking-slot");

afterEach(() => {
  vi.clearAllMocks();
});

const WITCHER = {
  gameId: 1942,
  name: "The Witcher 3",
  releaseDate: "2015-05-19",
};

const pill = (label: string, name = "The Witcher 3") =>
  screen.getByRole("button", { name: `${label}: ${name}` });

describe("GameTrackingSlot", () => {
  it("renders nothing for a visitor, not even the release line (AC-1)", async () => {
    getGameTracking.mockResolvedValue({ kind: "signed_out" });
    const { container } = render(
      await GameTrackingSlot({ ...WITCHER, releaseDate: null }),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the failure line with a full page retry to the same game", async () => {
    getGameTracking.mockResolvedValue({ kind: "failed" });
    render(await GameTrackingSlot(WITCHER));
    expect(
      screen.getByText("Couldn't load your tracking."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/games/1942",
    );
  });

  it("renders the control with the stored state and asks for the right game (AC-12)", async () => {
    getGameTracking.mockResolvedValue({
      kind: "ok",
      state: { status: "playing", rating: 8 },
    });
    render(await GameTrackingSlot(WITCHER));
    expect(getGameTracking).toHaveBeenCalledWith(1942);
    expect(pill("Playing")).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Your score for The Witcher 3: 8" }),
    ).toBeInTheDocument();
  });

  it("treats the release day itself as released, so no line shows (AC-8)", async () => {
    getGameTracking.mockResolvedValue({
      kind: "ok",
      state: { status: null, rating: null },
    });
    render(await GameTrackingSlot({ ...WITCHER, releaseDate: "2026-10-24" }));
    expect(screen.queryByText(/^Releases/)).toBeNull();
    expect(pill("Playing")).not.toHaveAttribute("aria-disabled");
  });

  it("gates a game out tomorrow by the UTC day, with its date (AC-8)", async () => {
    getGameTracking.mockResolvedValue({
      kind: "ok",
      state: { status: null, rating: null },
    });
    render(await GameTrackingSlot({ ...WITCHER, releaseDate: "2026-10-25" }));
    expect(screen.getByText("Releases Oct 25, 2026")).toBeInTheDocument();
    expect(pill("Playing")).toHaveAttribute("aria-disabled", "true");
    expect(pill("Finished")).toHaveAttribute("aria-disabled", "true");
  });

  it("says the date is to be announced when IGDB has none (AC-8)", async () => {
    getGameTracking.mockResolvedValue({
      kind: "ok",
      state: { status: null, rating: null },
    });
    render(await GameTrackingSlot({ ...WITCHER, releaseDate: null }));
    expect(
      screen.getByText("Release date to be announced"),
    ).toBeInTheDocument();
  });
});
