import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: prompts/landing-card-controls.md, decisions 1 and 2;
 * prompts/landing-review-fixes.md, decisions 3 and 7; spec 0028, AC-7;
 * spec 0030, AC-1, AC-2, AC-7, AC-10
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
vi.mock("@/components/tracking/game-card-slots", () => ({
  GameCardBadge: () => null,
  GameCardControls: () => null,
}));

vi.mock("@/components/tracking/movie-tracking-slot", () => ({
  MovieTrackingSlot: () => null,
}));
vi.mock("@/components/tracking/show-tracking-slot", () => ({
  ShowTrackingSlot: () => null,
}));
vi.mock("@/components/tracking/game-tracking-slot", () => ({
  GameTrackingSlot: () => null,
}));

const { LandingBadge, LandingControls, LandingTracking, landingMeta } =
  await import("./landing-badge");
const { GameTrackingSlot } = await import(
  "@/components/tracking/game-tracking-slot"
);
const { IgdbRatingBadge } = await import("@/components/rating-badges");
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
const { GameCardBadge, GameCardControls } = await import(
  "@/components/tracking/game-card-slots"
);

const BASE = {
  title: "Dune",
  href: "/movies/1",
  posterUrl: null,
  backdropUrl: null,
  rating: { source: "tmdb" as const, value: 8 },
  year: 2026,
  genreIds: [],
};

function slot(element: React.ReactElement | null) {
  if (element === null) throw new Error("expected an element");
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

// spec 0030, AC-1, AC-2, AC-7, AC-10: a game card gets the game slots, with
// the section's ids and /games, and IGDB's rating while the read is pending;
// the hero keeps the game page's own status control (spec 0028, AC-7).
describe("a game", () => {
  const GAME = {
    ...BASE,
    rating: { source: "igdb" as const, value: 8.4 },
    mediaType: "game" as const,
    id: 1942,
    href: "/games/1942",
    releaseDate: "2015-05-19",
    year: 2015,
  };

  it("badges with the game slot, falling back to IGDB's community rating", () => {
    const badge = LandingBadge({ item: GAME, ids: [1942, 7346] });
    expect(badge.type).toBe(Symbol.for("react.suspense"));
    const { fallback, children } = badge.props as {
      fallback: React.ReactElement;
      children: React.ReactElement;
    };
    const rating = (fallback.type as (props: object) => React.ReactElement)(
      fallback.props as object,
    );
    expect(rating.type).toBe(IgdbRatingBadge);
    expect(rating.props).toEqual({ value: 8.4 });
    expect(children.type).toBe(GameCardBadge);
    expect(children.props).toEqual({
      gameId: 1942,
      releaseDate: "2015-05-19",
      communityRating: 8.4,
      gridGameIds: [1942, 7346],
    });
  });

  it("renders the game controls with /games, passing the release pill switch", () => {
    const child = slot(
      LandingControls({ item: GAME, ids: [1942], releasePill: false }),
    );
    expect(child.type).toBe(GameCardControls);
    expect(child.props).toEqual({
      gameId: 1942,
      name: "Dune",
      releaseDate: "2015-05-19",
      gridGameIds: [1942],
      returnPath: "/games",
      releasePill: false,
    });
  });

  it("prints the release year as the meta line, and a show or movie none", () => {
    expect(landingMeta(GAME)).toBe(2015);
    expect(landingMeta({ ...GAME, year: null })).toBeUndefined();
    expect(
      landingMeta({ ...BASE, mediaType: "movie", id: 1, releaseDate: null }),
    ).toBeUndefined();
  });

  it("gets the game status control in the hero", () => {
    const child = slot(LandingTracking({ item: GAME }));
    expect(child.type).toBe(GameTrackingSlot);
    expect(child.props).toEqual({
      gameId: 1942,
      name: "Dune",
      releaseDate: "2015-05-19",
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
