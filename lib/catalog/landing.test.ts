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
});

describe("LANDING_COUNTS (AC-2)", () => {
  it("holds the design's counts", () => {
    expect(LANDING_COUNTS).toEqual({
      trending: 9,
      popular: 10,
      now: 12,
      upcomingRow: 10,
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

  it("says nothing when nothing is rendered", () => {
    expect(nowBlurb(landingSlots("movie").now, 0)).toBeNull();
  });
});
