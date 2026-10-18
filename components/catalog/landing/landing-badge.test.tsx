import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/landing-card-controls.md, decisions 1 and 2;
 * prompts/landing-review-fixes.md, decisions 3 and 7
 *
 * `LandingControls` picks the slot for the card's media type, hands it the
 * section's ids so it shares the badge's read, and sends a session expired
 * toast back to the landing the card sits on. `LandingTracking` picks the
 * hero's control the same way. The slots are replaced; they have their own
 * tests.
 */
vi.mock("@/components/tracking/movie-card-slots", () => ({
  MovieCardBadge: () => null,
  MovieCardControls: () => null,
}));
vi.mock("@/components/tracking/show-card-slots", () => ({
  ShowCardBadge: () => null,
  ShowCardControls: () => null,
}));

vi.mock("@/components/tracking/movie-tracking-slot", () => ({
  MovieTrackingSlot: () => null,
}));
vi.mock("@/components/tracking/show-tracking-slot", () => ({
  ShowTrackingSlot: () => null,
}));

const { LandingControls, LandingTracking } = await import("./landing-badge");
const { MovieTrackingSlot } = await import(
  "@/components/tracking/movie-tracking-slot"
);
const { ShowTrackingSlot } = await import(
  "@/components/tracking/show-tracking-slot"
);
const { MovieCardControls } = await import(
  "@/components/tracking/movie-card-slots"
);
const { ShowCardControls } = await import(
  "@/components/tracking/show-card-slots"
);

const BASE = {
  title: "Dune",
  href: "/movies/1",
  posterUrl: null,
  backdropUrl: null,
  tmdbRating: 8,
  year: 2026,
  genreIds: [],
};

function slot(element: React.ReactElement) {
  const { children } = element.props as { children: React.ReactElement };
  return children;
}

describe("LandingControls", () => {
  it("renders a movie's controls with its release date and /movies", () => {
    const child = slot(
      LandingControls({
        item: {
          ...BASE,
          mediaType: "movie",
          id: 1,
          releaseDate: "2026-11-06",
        },
        ids: [1, 2],
      }),
    );

    expect(child.type).toBe(MovieCardControls);
    expect(child.props).toEqual({
      movieId: 1,
      title: "Dune",
      releaseDate: "2026-11-06",
      gridMovieIds: [1, 2],
      returnPath: "/movies",
      releasePill: true,
    });
  });

  it("renders a show's controls with /shows", () => {
    const child = slot(
      LandingControls({
        item: { ...BASE, mediaType: "tv", id: 7, releaseDate: null },
        ids: [7],
      }),
    );

    expect(child.type).toBe(ShowCardControls);
    expect(child.props).toEqual({
      showId: 7,
      name: "Dune",
      gridShowIds: [7],
      returnPath: "/shows",
    });
  });
});

describe("LandingTracking", () => {
  it("renders a movie's tracking slot with its release date", () => {
    const child = slot(
      LandingTracking({
        item: { ...BASE, mediaType: "movie", id: 1, releaseDate: "2026-11-06" },
      }),
    );

    expect(child.type).toBe(MovieTrackingSlot);
    expect(child.props).toEqual({
      movieId: 1,
      title: "Dune",
      releaseDate: "2026-11-06",
    });
  });

  it("renders a show's tracking slot", () => {
    const child = slot(
      LandingTracking({
        item: { ...BASE, mediaType: "tv", id: 7, releaseDate: null },
      }),
    );

    expect(child.type).toBe(ShowTrackingSlot);
    expect(child.props).toEqual({ showId: 7, showName: "Dune" });
  });
});
