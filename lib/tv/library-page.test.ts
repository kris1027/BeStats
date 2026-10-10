import { describe, expect, it } from "vitest";

import {
  classifyShow,
  type EpisodeKey,
  episodeKey,
  type ShowDetails,
} from "./library-page";

/**
 * covers: spec 0020, AC-7, AC-8
 *
 * One table per row of the spec's classifier scenarios. Every show here has
 * two regular seasons of three episodes unless a case says otherwise.
 */
const today = "2026-10-07";

const seasons = [
  { seasonNumber: 0, episodeCount: 2, airDate: "2020-01-01" },
  { seasonNumber: 1, episodeCount: 3, airDate: "2025-01-01" },
  { seasonNumber: 2, episodeCount: 3, airDate: "2026-01-01" },
];

function show(overrides: Partial<ShowDetails> = {}): ShowDetails {
  return {
    seasons,
    lastEpisodeToAir: {
      seasonNumber: 2,
      episodeNumber: 3,
      airDate: "2026-02-01",
    },
    nextEpisodeToAir: null,
    status: "Returning Series",
    ...overrides,
  };
}

function watched(...places: [number, number][]): Set<EpisodeKey> {
  return new Set(places.map(([s, e]) => episodeKey(s, e)));
}

const allSix = watched([1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]);

describe("classifyShow (AC-7)", () => {
  it("puts a partly watched show with aired episodes left on Watchlist", () => {
    expect(classifyShow(show(), watched([1, 1], [1, 2]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
  });

  it("puts a caught up show with its next episode dated tomorrow on Upcoming", () => {
    const details = show({
      nextEpisodeToAir: {
        seasonNumber: 3,
        episodeNumber: 1,
        airDate: "2026-10-08",
      },
    });
    expect(classifyShow(details, allSix, today)).toEqual({
      page: "upcoming",
      airDate: "2026-10-08",
      next: { season: 3, episode: 1 },
    });
  });

  it("counts a next episode dated today as aired, so it is on Watchlist", () => {
    const details = show({
      nextEpisodeToAir: { seasonNumber: 3, episodeNumber: 1, airDate: today },
    });
    expect(classifyShow(details, allSix, today)).toEqual({
      page: "watchlist",
      next: { season: 3, episode: 1 },
    });
  });

  it("puts a caught up show with an undated announced season on Watched, Caught up", () => {
    const details = show({
      seasons: [
        ...seasons,
        { seasonNumber: 3, episodeCount: 0, airDate: null },
      ],
      nextEpisodeToAir: { seasonNumber: 3, episodeNumber: 1, airDate: null },
    });
    expect(classifyShow(details, allSix, today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("labels a finished Ended or Canceled show Finished", () => {
    expect(classifyShow(show({ status: "Ended" }), allSix, today)).toEqual({
      page: "watched",
      label: "finished",
    });
    expect(classifyShow(show({ status: "Canceled" }), allSix, today)).toEqual({
      page: "watched",
      label: "finished",
    });
  });

  it("puts an aired show with nothing watched on Watchlist at S1E1", () => {
    expect(classifyShow(show(), new Set(), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 1 },
    });
  });

  it("puts a show whose premiere is dated, with nothing watched, on Upcoming", () => {
    const details = show({
      seasons: [{ seasonNumber: 1, episodeCount: 8, airDate: "2026-11-01" }],
      lastEpisodeToAir: null,
      nextEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 1,
        airDate: "2026-11-01",
      },
    });
    expect(classifyShow(details, new Set(), today)).toEqual({
      page: "upcoming",
      airDate: "2026-11-01",
      next: { season: 1, episode: 1 },
    });
  });

  it("puts a show with nothing aired, watched or dated on Upcoming, Date TBA", () => {
    const details = show({
      seasons: [{ seasonNumber: 1, episodeCount: 0, airDate: null }],
      lastEpisodeToAir: null,
    });
    expect(classifyShow(details, new Set(), today)).toEqual({
      page: "upcoming",
      airDate: null,
      next: null,
    });
  });

  it("treats a show with only specials watched as nothing watched", () => {
    // The watched set holds regular episodes only, so a specials only history
    // arrives empty: an aired show then waits at S1E1.
    expect(classifyShow(show(), new Set(), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 1 },
    });
  });

  it("ignores a special as the next episode", () => {
    const details = show({
      nextEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 3,
        airDate: "2026-12-01",
      },
    });
    expect(classifyShow(details, allSix, today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("offers the episode after the furthest watched, not a gap before it", () => {
    expect(classifyShow(show(), watched([1, 2]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
  });

  it("keeps the next episode when a gap behind the furthest is marked later", () => {
    expect(classifyShow(show(), watched([1, 2], [1, 1]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
  });

  it("never goes back to a gap when watching out of order", () => {
    const outOfOrder = watched([1, 1], [1, 2], [2, 1], [2, 2], [2, 3]);
    const details = show({
      seasons: [
        { seasonNumber: 1, episodeCount: 4, airDate: "2025-01-01" },
        { seasonNumber: 2, episodeCount: 3, airDate: "2026-01-01" },
      ],
    });
    expect(classifyShow(details, outOfOrder, today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
    expect(
      classifyShow({ ...details, status: "Ended" }, outOfOrder, today),
    ).toEqual({ page: "watched", label: "finished" });
  });

  it("puts a caught up show with gaps and a dated next episode on Upcoming", () => {
    const details = show({
      nextEpisodeToAir: {
        seasonNumber: 3,
        episodeNumber: 1,
        airDate: "2026-10-08",
      },
    });
    expect(classifyShow(details, watched([1, 1], [2, 3]), today)).toEqual({
      page: "upcoming",
      airDate: "2026-10-08",
      next: { season: 3, episode: 1 },
    });
  });

  it("treats a furthest watched episode past the last aired one as caught up", () => {
    const details = show({
      seasons: [
        ...seasons,
        { seasonNumber: 3, episodeCount: 2, airDate: null },
      ],
    });
    expect(classifyShow(details, watched([1, 1], [3, 1]), today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("moves the next episode back when the furthest is unmarked, not a gap", () => {
    expect(classifyShow(show(), watched([1, 1], [1, 2]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
    expect(classifyShow(show(), watched([1, 1], [1, 3]), today)).toEqual({
      page: "watchlist",
      next: { season: 2, episode: 1 },
    });
  });

  it("falls back to the seasons' own dates when the last episode is a special", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      seasons: [
        { seasonNumber: 0, episodeCount: 2, airDate: "2020-01-01" },
        { seasonNumber: 1, episodeCount: 3, airDate: "2025-01-01" },
        { seasonNumber: 2, episodeCount: 3, airDate: "2026-12-01" },
      ],
    });
    expect(classifyShow(details, watched([1, 1], [1, 2]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
    // Season 2 has not aired by its own date, so season 1 alone is caught up.
    expect(
      classifyShow(details, watched([1, 1], [1, 2], [1, 3]), today),
    ).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("puts an undecidable show on Watchlist, never Watched", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
    });
    expect(classifyShow(details, watched([1, 1]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 2 },
    });
  });

  it("puts an undecidable show whose next episode is dated on Upcoming, not Watchlist", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      nextEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 1,
        airDate: "2026-10-14",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
    });
    expect(classifyShow(details, watched(), today)).toEqual({
      page: "upcoming",
      airDate: "2026-10-14",
      next: { season: 1, episode: 1 },
    });
  });

  it("offers an undecidable show's unwatched episode before a dated next episode", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      nextEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 3,
        airDate: "2026-10-14",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
    });
    expect(classifyShow(details, watched([1, 1]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 2 },
    });
  });

  it("offers an undecidable show's episode after the furthest watched, not a gap", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
    });
    expect(classifyShow(details, watched([1, 2]), today)).toEqual({
      page: "watchlist",
      next: { season: 1, episode: 3 },
    });
  });

  it("puts an undecidable show with its last listed episode watched on Upcoming, gaps or not", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
    });
    expect(classifyShow(details, watched([1, 3]), today)).toEqual({
      page: "upcoming",
      airDate: null,
      next: null,
    });
  });

  it("puts an undecidable show with every listed episode watched on Upcoming, never Watched", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 0,
        episodeNumber: 2,
        airDate: "2026-09-01",
      },
      seasons: [{ seasonNumber: 1, episodeCount: 3, airDate: null }],
      status: "Ended",
    });
    expect(
      classifyShow(details, watched([1, 1], [1, 2], [1, 3]), today),
    ).toEqual({ page: "upcoming", airDate: null, next: null });
  });

  it("counts a last episode in a season missing from the list", () => {
    const details = show({
      lastEpisodeToAir: {
        seasonNumber: 3,
        episodeNumber: 2,
        airDate: "2026-10-01",
      },
    });
    expect(classifyShow(details, allSix, today)).toEqual({
      page: "watchlist",
      next: { season: 3, episode: 1 },
    });
    const caughtUp = new Set([...allSix, episodeKey(3, 1), episodeKey(3, 2)]);
    expect(classifyShow(details, caughtUp, today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("skips a season with no episode count", () => {
    const details = show({
      seasons: [
        { seasonNumber: 1, episodeCount: 3, airDate: "2025-01-01" },
        { seasonNumber: 2, episodeCount: 0, airDate: "2026-01-01" },
      ],
      lastEpisodeToAir: {
        seasonNumber: 1,
        episodeNumber: 3,
        airDate: "2025-02-01",
      },
    });
    expect(
      classifyShow(details, watched([1, 1], [1, 2], [1, 3]), today),
    ).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });

  it("reads a show with no last or next episode as nothing aired", () => {
    // Normalization turns a malformed field into null, so this is also the
    // malformed case: the show still classifies, it never fails.
    const details = show({ lastEpisodeToAir: null, nextEpisodeToAir: null });
    expect(classifyShow(details, new Set(), today)).toEqual({
      page: "upcoming",
      airDate: null,
      next: null,
    });
    expect(classifyShow(details, watched([1, 1]), today)).toEqual({
      page: "watched",
      label: "caught_up",
    });
  });
});

describe("classifyShow, one page per show (AC-8)", () => {
  it("gives exactly one page for every watched prefix of a show", () => {
    const order: [number, number][] = [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
      [2, 3],
    ];
    for (let n = 0; n <= order.length; n++) {
      const result = classifyShow(show(), watched(...order.slice(0, n)), today);
      expect(["watchlist", "upcoming", "watched"]).toContain(result.page);
      expect(result.page).toBe(n < order.length ? "watchlist" : "watched");
    }
  });
});
