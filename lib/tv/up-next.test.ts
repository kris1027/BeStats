import { describe, expect, it } from "vitest";

import { upNextState } from "./up-next";

/**
 * covers: spec 0014, AC-4
 *
 * The next episode is `showProgress`'s; the upcoming one is the first regular
 * episode with a known date after today. Specials and undated episodes are
 * never either.
 */
const today = "2026-09-28";

const episodes = [
  // Out of order on purpose: the rule orders for itself.
  { id: 203, seasonNumber: 2, episodeNumber: 3, airDate: "2026-10-12" },
  { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
  { id: 102, seasonNumber: 1, episodeNumber: 2, airDate: "2026-01-08" },
  { id: 201, seasonNumber: 2, episodeNumber: 1, airDate: null },
  { id: 202, seasonNumber: 2, episodeNumber: 2, airDate: "2026-10-05" },
  { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2026-09-30" },
];

describe("upNextState (AC-4)", () => {
  it("offers the first aired regular episode not watched", () => {
    expect(upNextState(episodes, new Set([101]), today)).toEqual({
      kind: "next",
      episode: { id: 102, seasonNumber: 1, episodeNumber: 2 },
    });
  });

  it("is caught up with the first dated upcoming regular episode", () => {
    expect(upNextState(episodes, new Set([101, 102]), today)).toEqual({
      kind: "caught_up",
      upcoming: { seasonNumber: 2, episodeNumber: 2, airDate: "2026-10-05" },
    });
  });

  it("skips a special and an undated episode for the upcoming one", () => {
    // The special airs sooner and S2E1 comes first, but neither has a date
    // the rule may offer.
    const upcoming = upNextState(episodes, new Set([101, 102]), today);
    expect(upcoming.kind === "caught_up" && upcoming.upcoming?.airDate).toBe(
      "2026-10-05",
    );
  });

  it("still names the upcoming episode when it was already watched", () => {
    expect(upNextState(episodes, new Set([101, 102, 202]), today)).toEqual({
      kind: "caught_up",
      upcoming: { seasonNumber: 2, episodeNumber: 2, airDate: "2026-10-05" },
    });
  });

  it("orders the upcoming episode by season before episode", () => {
    // S2E1 airs later than S3E1 but comes first in the show's order.
    const list = [
      { id: 1, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
      { id: 31, seasonNumber: 3, episodeNumber: 1, airDate: "2026-10-01" },
      { id: 29, seasonNumber: 2, episodeNumber: 9, airDate: "2026-11-01" },
    ];
    expect(upNextState(list, new Set([1]), today)).toEqual({
      kind: "caught_up",
      upcoming: { seasonNumber: 2, episodeNumber: 9, airDate: "2026-11-01" },
    });
  });

  it("offers the next aired episode even with a later one watched", () => {
    // Watching out of order never skips the earlier gap.
    expect(upNextState(episodes, new Set([102]), today)).toEqual({
      kind: "next",
      episode: { id: 101, seasonNumber: 1, episodeNumber: 1 },
    });
  });

  it("is caught up with no upcoming episode when TMDB lists none", () => {
    const aired = episodes.filter((episode) => episode.seasonNumber === 1);
    expect(upNextState(aired, new Set([101, 102]), today)).toEqual({
      kind: "caught_up",
      upcoming: null,
    });
  });

  it("counts an episode airing today as aired, never as upcoming", () => {
    const list = [
      { id: 1, seasonNumber: 1, episodeNumber: 1, airDate: today },
      { id: 2, seasonNumber: 1, episodeNumber: 2, airDate: "2026-09-29" },
    ];
    expect(upNextState(list, new Set(), today)).toEqual({
      kind: "next",
      episode: { id: 1, seasonNumber: 1, episodeNumber: 1 },
    });
    expect(upNextState(list, new Set([1]), today)).toEqual({
      kind: "caught_up",
      upcoming: { seasonNumber: 1, episodeNumber: 2, airDate: "2026-09-29" },
    });
  });

  it("is not aired when no regular episode has aired", () => {
    const future = [
      { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2026-01-01" },
      { id: 2, seasonNumber: 1, episodeNumber: 1, airDate: "2027-02-03" },
    ];
    expect(upNextState(future, new Set([1]), today)).toEqual({
      kind: "not_aired",
      upcoming: { seasonNumber: 1, episodeNumber: 1, airDate: "2027-02-03" },
    });
  });

  it("is not aired with no upcoming episode when nothing has a date", () => {
    const undated = [
      { id: 1, seasonNumber: 1, episodeNumber: 1, airDate: null },
    ];
    expect(upNextState(undated, new Set(), today)).toEqual({
      kind: "not_aired",
      upcoming: null,
    });
    expect(upNextState([], new Set(), today)).toEqual({
      kind: "not_aired",
      upcoming: null,
    });
  });

  it("never offers a malformed date as upcoming", () => {
    const bad = [
      { id: 1, seasonNumber: 1, episodeNumber: 1, airDate: "2026-02-30" },
    ];
    expect(upNextState(bad, new Set(), today)).toEqual({
      kind: "not_aired",
      upcoming: null,
    });
  });
});
