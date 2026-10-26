import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MovieTrackingState } from "@/lib/tracking/types";

/**
 * covers: spec 0007, AC-2, AC-16, AC-17; prompts/catalog-card-status.md, R1
 * to R4
 *
 * The two slots of a movie poster card show the movie the way its library
 * page does. The grid read is the boundary, so it is what is replaced.
 */
const getMovieGridStates = vi.fn();
vi.mock("@/lib/tracking/movie-state", () => ({
  getMovieGridStates: (...args: unknown[]) => getMovieGridStates(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-10",
}));
vi.mock("@/app/movies/actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { MovieCardBadge, MovieCardControls } = await import(
  "./movie-card-slots"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("MovieCardBadge and MovieCardControls", () => {
  const props = {
    movieId: 550,
    title: "Fight Club",
    releaseDate: "1999-10-15" as string | null,
    gridMovieIds: [603, 550],
    returnPath: "/movies",
  };
  const none: MovieTrackingState = {
    inWatchlist: false,
    watched: false,
    rating: null,
  };

  function grid(state?: typeof none) {
    getMovieGridStates.mockResolvedValue({
      kind: "ok",
      state: new Map(state ? [[550, state]] : []),
    });
  }

  async function renderCard(overrides: Partial<typeof props> = {}) {
    const card = { ...props, ...overrides };
    return render(
      <>
        {await MovieCardBadge({ ...card, tmdbRating: 8.4 })}
        {await MovieCardControls(card)}
      </>,
    );
  }

  it("asks for the whole grid under one shared key (AC-16)", async () => {
    grid({ ...none, inWatchlist: true });
    await renderCard();
    expect(getMovieGridStates).toHaveBeenCalledWith("550,603");
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
  });

  it("shows an untouched movie as the catalog does", async () => {
    grid();
    await renderCard();
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
  });

  it("shows a scored watched movie as Watched does: the score and the watched mark", async () => {
    grid({ ...none, watched: true, rating: 7 });
    await renderCard();
    expect(screen.getByText("Your score")).toBeInTheDocument();
    expect(screen.queryByText("TMDB rating")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unmark Fight Club as watched" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Plan Fight Club" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the TMDB rating on an unscored watched movie", async () => {
    grid({ ...none, watched: true });
    await renderCard();
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unmark Fight Club as watched" }),
    ).toBeInTheDocument();
  });

  it("shows a planned unreleased movie as Upcoming does: the date and no rating", async () => {
    grid({ ...none, inWatchlist: true });
    await renderCard({ releaseDate: "2026-11-20" });
    expect(screen.getByText("Releases Nov 20, 2026")).toBeInTheDocument();
    expect(screen.queryByText("TMDB rating")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves the release pill out on a card that already prints the date", async () => {
    grid({ ...none, inWatchlist: true });
    render(
      await MovieCardControls({
        ...props,
        releaseDate: "2026-11-20",
        releasePill: false,
      }),
    );
    expect(screen.queryByText("Releases Nov 20, 2026")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan Fight Club" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows Date TBA for a planned undated movie", async () => {
    grid({ ...none, inWatchlist: true });
    await renderCard({ releaseDate: null });
    expect(
      screen.getByText("Release date to be announced"),
    ).toBeInTheDocument();
  });

  it.each([
    ["a visitor", { kind: "signed_out" }],
    ["a failed read", { kind: "failed" }],
  ])("gives %s the catalog card (AC-2, AC-17)", async (_, read) => {
    getMovieGridStates.mockResolvedValue(read);
    await renderCard();
    expect(screen.getByText("TMDB rating")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
