import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0007, AC-2, AC-16, AC-17
 *
 * The two server slots decide between nothing, a failure line and the
 * controls. The reads are the boundary, so they are what is replaced.
 */
const getMovieTracking = vi.fn();
const getWatchlistedMovieIds = vi.fn();
vi.mock("@/lib/tracking/movie-state", () => ({
  getMovieTracking: (...args: unknown[]) => getMovieTracking(...args),
  getWatchlistedMovieIds: (...args: unknown[]) =>
    getWatchlistedMovieIds(...args),
  movieIdsKey: (ids: number[]) => [...ids].sort((a, b) => a - b).join(","),
}));
vi.mock("@/app/movies/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { MovieTrackingSlot } = await import("./movie-tracking-slot");
const { CardBookmark } = await import("./card-bookmark");

afterEach(() => {
  vi.clearAllMocks();
});

describe("MovieTrackingSlot", () => {
  it("renders nothing for a visitor (AC-2)", async () => {
    getMovieTracking.mockResolvedValue({ kind: "signed_out" });
    const { container } = render(
      await MovieTrackingSlot({ movieId: 550, title: "Fight Club" }),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the failure line with a full page retry (AC-17)", async () => {
    getMovieTracking.mockResolvedValue({ kind: "failed" });
    render(await MovieTrackingSlot({ movieId: 550, title: "Fight Club" }));
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
    render(await MovieTrackingSlot({ movieId: 550, title: "Fight Club" }));
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("CardBookmark", () => {
  const props = {
    movieId: 550,
    title: "Fight Club",
    gridMovieIds: [603, 550],
    returnPath: "/movies",
  };

  it("asks for the whole grid under one shared key (AC-16)", async () => {
    getWatchlistedMovieIds.mockResolvedValue({
      kind: "ok",
      state: new Set([550]),
    });
    render(await CardBookmark(props));
    expect(getWatchlistedMovieIds).toHaveBeenCalledWith("550,603");
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["a visitor", { kind: "signed_out" }],
    ["a failed read", { kind: "failed" }],
  ])("renders nothing for %s (AC-2, AC-17)", async (_, read) => {
    getWatchlistedMovieIds.mockResolvedValue(read);
    const { container } = render(await CardBookmark(props));
    expect(container).toBeEmptyDOMElement();
  });
});
