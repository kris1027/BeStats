import { describe, expect, it } from "vitest";

import { LANDING_COUNTS, landingSlots, nowBlurb } from "./landing";

/**
 * covers: prompts/home-parallax-landing.md, AC-1, AC-2 (decisions 1, 8, 12)
 *
 * Which list fills each landing slot, the counts, and the sidebar's words.
 */
describe("landingSlots (AC-1)", () => {
  it("maps the movie landing's slots", () => {
    const slots = landingSlots("movie");
    expect(
      [slots.trending, slots.popular, slots.now, slots.upcoming, slots.top].map(
        (list) => `${list.mediaType}/${list.slug}`,
      ),
    ).toEqual([
      "movie/trending",
      "movie/popular",
      "movie/now-playing",
      "movie/upcoming",
      "movie/top-rated",
    ]);
    expect(slots.nowLabel).toBe("In cinemas");
  });

  it("maps the TV landing's slots, Airing today and On the air in the middle", () => {
    const slots = landingSlots("tv");
    expect(
      [slots.trending, slots.popular, slots.now, slots.upcoming, slots.top].map(
        (list) => `${list.mediaType}/${list.slug}`,
      ),
    ).toEqual([
      "tv/trending",
      "tv/popular",
      "tv/airing-today",
      "tv/on-the-air",
      "tv/top-rated",
    ]);
    expect(slots.nowLabel).toBe("On TV today");
  });

  // spec 0028, AC-1, AC-9
  it("maps the games landing's slots, New releases in the sidebar", () => {
    const slots = landingSlots("game");
    expect(
      [slots.trending, slots.popular, slots.now, slots.upcoming, slots.top].map(
        (list) => `${list.mediaType}/${list.slug}`,
      ),
    ).toEqual([
      "game/trending",
      "game/popular",
      "game/recently-released",
      "game/coming-soon",
      "game/top-rated",
    ]);
    expect(slots.nowLabel).toBe("New releases");
  });
});

describe("LANDING_COUNTS (AC-2)", () => {
  it("holds the design's counts", () => {
    expect(LANDING_COUNTS).toEqual({
      trending: 9,
      popular: 14,
      now: 12,
      upcomingRow: 10,
      upcomingRows: 4,
      upcomingRowsPerPage: 2,
      top: 8,
    });
  });
});

describe("nowBlurb (decision 12)", () => {
  it("counts films for the movie landing", () => {
    const list = landingSlots("movie").now;
    expect(nowBlurb(list, 12)).toBe("12 films in cinemas this week.");
    expect(nowBlurb(list, 1)).toBe("1 film in cinemas this week.");
  });

  it("counts shows for the TV landing", () => {
    const list = landingSlots("tv").now;
    expect(nowBlurb(list, 7)).toBe("7 shows airing today.");
    expect(nowBlurb(list, 1)).toBe("1 show airing today.");
  });

  // spec 0028, AC-9
  it("counts games for the games landing, never with the movie line", () => {
    const list = landingSlots("game").now;
    expect(nowBlurb(list, 12)).toBe(
      "The 12 most anticipated games of the last 60 days.",
    );
    expect(nowBlurb(list, 1)).toBe(
      "The 1 most anticipated game of the last 60 days.",
    );
    expect(nowBlurb(list, 0)).toBeNull();
  });

  it("says nothing when nothing is rendered", () => {
    expect(nowBlurb(landingSlots("movie").now, 0)).toBeNull();
  });
});
