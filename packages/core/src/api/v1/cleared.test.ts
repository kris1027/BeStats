import { describe, expect, it } from "vitest";

import { clearedStateSchema, restoreBodySchema } from "./cleared";

/**
 * covers: spec 0035, Undo; spec 0033, AC-7
 *
 * One union for every restore route: each kind parses its own action's
 * input, and a route's body schema refuses every other kind.
 */
const watched = {
  kind: "movie_watched",
  movieId: 550,
  watchedAt: "2026-11-10T09:00:00+00:00",
  rating: 7,
};

describe("clearedStateSchema", () => {
  it.each([
    watched,
    { kind: "movie_watchlist", movieId: 550 },
    {
      kind: "episode",
      showId: 1399,
      episodeId: 63056,
      markedAt: "2026-11-10T09:00:00+00:00",
    },
    {
      kind: "season",
      showId: 1399,
      undo: { kind: "unmark", episodeIds: [63056, 63057] },
    },
    {
      kind: "show_tracking",
      showId: 1399,
      undo: { trackedAt: "2026-11-10T09:00:00+00:00" },
    },
    {
      kind: "game_status",
      gameId: 1942,
      previous: {
        status: "playing",
        rating: 8,
        addedAt: "2026-11-01T09:00:00+00:00",
        startedAt: "2026-11-02T09:00:00+00:00",
        finishedAt: null,
      },
    },
  ])("parses a $kind state", (state) => {
    expect(clearedStateSchema.parse(state)).toEqual(state);
  });

  it("refuses an unknown kind and a member missing its fields", () => {
    expect(clearedStateSchema.safeParse({ kind: "other" }).success).toBe(false);
    expect(
      clearedStateSchema.safeParse({ kind: "movie_watched", movieId: 550 })
        .success,
    ).toBe(false);
  });
});

describe("restoreBodySchema", () => {
  it("accepts only its own kinds", () => {
    const schema = restoreBodySchema("movie_watched");
    expect(schema.safeParse({ cleared: watched }).success).toBe(true);
    expect(
      schema.safeParse({ cleared: { kind: "movie_watchlist", movieId: 550 } })
        .success,
    ).toBe(false);
  });
});
