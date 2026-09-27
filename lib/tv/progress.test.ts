import { describe, expect, it } from "vitest";

import { showProgress } from "./progress";

/**
 * covers: spec 0013, AC-9
 *
 * Progress counts aired regular episodes only. Specials, upcoming episodes and
 * episodes with no date are in neither number, even when watched, and the
 * next episode is the first eligible one not watched, in season then episode
 * order.
 */
const today = "2026-09-26";

const episodes = [
  // Out of order on purpose: the rule sorts for itself.
  { id: 205, seasonNumber: 2, episodeNumber: 2, airDate: "2026-09-27" },
  { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
  { id: 102, seasonNumber: 1, episodeNumber: 2, airDate: "2026-01-08" },
  { id: 103, seasonNumber: 1, episodeNumber: 3, airDate: null },
  { id: 201, seasonNumber: 2, episodeNumber: 1, airDate: "2026-09-26" },
  { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2025-12-01" },
];

describe("showProgress (AC-9)", () => {
  it("counts aired regular episodes and the watched ones among them", () => {
    expect(showProgress(episodes, new Set([101, 201]), today)).toEqual({
      kind: "counted",
      watched: 2,
      total: 3,
      next: { id: 102, seasonNumber: 1, episodeNumber: 2 },
    });
  });

  it("never counts a watched special, upcoming or undated episode", () => {
    expect(showProgress(episodes, new Set([1, 103, 205]), today)).toEqual({
      kind: "counted",
      watched: 0,
      total: 3,
      next: { id: 101, seasonNumber: 1, episodeNumber: 1 },
    });
  });

  it("treats an episode airing today, in UTC, as aired", () => {
    const result = showProgress(episodes, new Set([101, 102]), today);
    expect(result).toMatchObject({
      next: { id: 201, seasonNumber: 2, episodeNumber: 1 },
    });
  });

  it("has no next episode once every aired one is watched", () => {
    expect(
      showProgress(episodes, new Set([101, 102, 201, 205, 1]), today),
    ).toEqual({ kind: "counted", watched: 3, total: 3, next: null });
  });

  it("is none_aired, not zero, when nothing eligible has aired", () => {
    expect(
      showProgress(
        [
          { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2020-01-01" },
          { id: 2, seasonNumber: 1, episodeNumber: 1, airDate: null },
          { id: 3, seasonNumber: 1, episodeNumber: 2, airDate: "2027-01-01" },
        ],
        new Set([1, 2, 3]),
        today,
      ),
    ).toEqual({ kind: "none_aired" });
    expect(showProgress([], new Set(), today)).toEqual({ kind: "none_aired" });
  });

  it("ignores watched ids TMDB no longer lists", () => {
    expect(showProgress(episodes, new Set([999, 101]), today)).toMatchObject({
      watched: 1,
      total: 3,
    });
  });

  it("counts an id TMDB lists twice once, so watched never exceeds total", () => {
    const doubled = [
      { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
      { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
    ];
    expect(showProgress(doubled, new Set([101]), today)).toEqual({
      kind: "counted",
      watched: 1,
      total: 1,
      next: null,
    });
  });

  it("does not treat a malformed air date as aired", () => {
    expect(
      showProgress(
        [{ id: 1, seasonNumber: 1, episodeNumber: 1, airDate: "2026-13-40" }],
        new Set(),
        today,
      ),
    ).toEqual({ kind: "none_aired" });
  });
});
