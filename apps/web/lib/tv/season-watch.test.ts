import { describe, expect, it } from "vitest";

import { airedEpisodesForMarking, seasonWatchSummary } from "./season-watch";

/**
 * covers: spec 0011, AC-8, AC-9, AC-12, AC-25
 *
 * Only aired episodes are counted or marked; unknown and upcoming ones are in
 * neither number, and a repeated TMDB id counts once.
 */
const today = "2026-09-25";
const episodes = [
  { id: 11, episodeNumber: 1, airDate: "2026-09-01" },
  { id: 12, episodeNumber: 2, airDate: "2026-09-25" },
  { id: 13, episodeNumber: 3, airDate: "2026-09-26" },
  { id: 14, episodeNumber: 4, airDate: null },
];

describe("seasonWatchSummary", () => {
  it("counts aired episodes and the watched ones among them (AC-8)", () => {
    expect(
      seasonWatchSummary(
        episodes,
        {
          11: { watched: true, rating: null },
          13: { watched: true, rating: 5 },
          14: { watched: true, rating: null },
        },
        today,
      ),
    ).toEqual({ aired: 2, watchedAired: 1, state: "partly_watched" });
  });

  it("is season_watched when every aired episode is watched", () => {
    expect(
      seasonWatchSummary(
        episodes,
        {
          11: { watched: true, rating: null },
          12: { watched: true, rating: 7 },
        },
        today,
      ).state,
    ).toBe("season_watched");
  });

  it("is none_aired when nothing has aired, even with watched rows", () => {
    expect(
      seasonWatchSummary(
        [episodes[2], episodes[3]],
        { 14: { watched: true, rating: null } },
        today,
      ),
    ).toEqual({ aired: 0, watchedAired: 0, state: "none_aired" });
  });

  it("ignores states for ids the season does not list (AC-25)", () => {
    expect(
      seasonWatchSummary(
        episodes,
        { 999: { watched: true, rating: null } },
        today,
      ),
    ).toEqual({ aired: 2, watchedAired: 0, state: "partly_watched" });
  });

  it("counts a repeated id once", () => {
    expect(
      seasonWatchSummary(
        [...episodes, { ...episodes[0], episodeNumber: 9 }],
        {},
        today,
      ).aired,
    ).toBe(2);
  });
});

describe("airedEpisodesForMarking (AC-9)", () => {
  it("takes only aired episodes, as parallel sorted arrays", () => {
    expect(airedEpisodesForMarking(episodes, today)).toEqual({
      ids: [11, 12],
      numbers: [1, 2],
    });
  });

  it("keeps one entry per id, with its lowest number, as the SQL does", () => {
    expect(
      airedEpisodesForMarking(
        [
          { id: 12, episodeNumber: 5, airDate: "2026-01-01" },
          { id: 11, episodeNumber: 1, airDate: "2026-01-01" },
          { id: 12, episodeNumber: 2, airDate: "2026-01-01" },
        ],
        today,
      ),
    ).toEqual({ ids: [11, 12], numbers: [1, 2] });
  });

  it("is empty when nothing has aired", () => {
    expect(airedEpisodesForMarking([episodes[2], episodes[3]], today)).toEqual({
      ids: [],
      numbers: [],
    });
  });
});
