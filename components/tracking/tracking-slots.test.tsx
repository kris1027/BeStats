import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0007, AC-2, AC-17
 *
 * The server slot decides between nothing, a failure line and the
 * controls. The reads are the boundary, so they are what is replaced.
 */
const getMovieTracking = vi.fn();
vi.mock("@/lib/tracking/movie-state", () => ({
  getMovieTracking: (...args: unknown[]) => getMovieTracking(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-10",
}));
vi.mock("@/app/movies/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { MovieTrackingSlot } = await import("./movie-tracking-slot");

afterEach(() => {
  vi.clearAllMocks();
});

const FIGHT_CLUB = {
  movieId: 550,
  title: "Fight Club",
  releaseDate: "1999-10-15",
};

describe("MovieTrackingSlot", () => {
  it("renders nothing for a visitor (AC-2)", async () => {
    getMovieTracking.mockResolvedValue({ kind: "signed_out" });
    const { container } = render(await MovieTrackingSlot(FIGHT_CLUB));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the failure line with a full page retry (AC-17)", async () => {
    getMovieTracking.mockResolvedValue({ kind: "failed" });
    render(await MovieTrackingSlot(FIGHT_CLUB));
    expect(
      screen.getByText("Couldn't load your tracking."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/movies/550",
    );
  });

  it("renders the controls with the stored state", async () => {
    getMovieTracking.mockResolvedValue({
      kind: "ok",
      state: { inWatchlist: true, watched: false, rating: null },
    });
    render(await MovieTrackingSlot(FIGHT_CLUB));
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("gates an unreleased movie on the request's UTC day (release gate)", async () => {
    getMovieTracking.mockResolvedValue({
      kind: "ok",
      state: { inWatchlist: false, watched: false, rating: null },
    });
    render(
      await MovieTrackingSlot({
        movieId: 1,
        title: "Sequel",
        releaseDate: "2026-10-11",
      }),
    );
    expect(screen.getByText("Releases Oct 11, 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark Sequel watched" }),
    ).not.toBeInTheDocument();
  });

  it("treats the release day itself as released (release gate)", async () => {
    getMovieTracking.mockResolvedValue({
      kind: "ok",
      state: { inWatchlist: false, watched: false, rating: null },
    });
    render(
      await MovieTrackingSlot({
        movieId: 1,
        title: "Sequel",
        releaseDate: "2026-10-10",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Mark Sequel watched" }),
    ).toBeInTheDocument();
  });
});
