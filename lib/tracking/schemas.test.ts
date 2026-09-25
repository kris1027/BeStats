import { afterEach, describe, expect, it, vi } from "vitest";

import {
  episodeIdListSchema,
  episodeRatingInputSchema,
  episodeWatchedInputSchema,
  movieIdSchema,
  ratingInputSchema,
  ratingSchema,
  restoreWatchedInputSchema,
  restoreWatchlistInputSchema,
  seasonNumberSchema,
  seasonUndoInputSchema,
  seasonWatchedInputSchema,
  watchedInputSchema,
  watchlistInputSchema,
} from "./schemas";

/**
 * covers: spec 0007, AC-13
 *
 * The refusals are pinned through the actions in `app/movies/actions.test.ts`.
 * These cases pin the other edge: the inclusive bounds that must still be
 * accepted, so a tightened schema cannot quietly refuse a real movie or score.
 */
describe("movieIdSchema", () => {
  it.each([1, 550, 2147483647])("accepts the id %s", (id) => {
    expect(movieIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([0, -1, 1.5, 2147483648, Number.NaN, "550"])("refuses %s", (id) => {
    expect(movieIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("ratingSchema", () => {
  it.each([1, 5, 10])("accepts the score %s", (score) => {
    expect(ratingSchema.safeParse(score).success).toBe(true);
  });

  it.each([0, 11, 7.5, "8", null])("refuses %s", (score) => {
    expect(ratingSchema.safeParse(score).success).toBe(false);
  });
});

describe("action input schemas", () => {
  it("lets a rating input carry null, which clears the score (AC-9)", () => {
    expect(
      ratingInputSchema.safeParse({ movieId: 550, rating: null }).success,
    ).toBe(true);
  });

  it("refuses a rating input with the rating left out", () => {
    expect(ratingInputSchema.safeParse({ movieId: 550 }).success).toBe(false);
  });

  it.each([
    ["watchlist", watchlistInputSchema, { movieId: 550, inWatchlist: 1 }],
    ["watched", watchedInputSchema, { movieId: 550, watched: "true" }],
  ])("refuses a non boolean %s flag", (_, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it("drops an extra user_id rather than passing it on (AC-18)", () => {
    const parsed = watchlistInputSchema.parse({
      movieId: 550,
      inWatchlist: true,
      user_id: "user-b",
    });
    expect(parsed).toEqual({ movieId: 550, inWatchlist: true });
  });
});

describe("restoreWatchedInputSchema (spec 0008, AC-7)", () => {
  it.each([
    "2026-09-23T12:16:58.070024+00:00",
    "2026-09-23T12:16:58Z",
    "2026-09-23T14:16:58.1+02:00",
  ])("accepts the PostgREST style timestamp %s", (watchedAt) => {
    expect(
      restoreWatchedInputSchema.safeParse({ movieId: 550, watchedAt }).success,
    ).toBe(true);
  });
});

describe("restoreWatchedInputSchema refusals (spec 0008, AC-7)", () => {
  it.each([
    ["a date with no time", "2026-09-23"],
    ["a time with no offset", "2026-09-23T12:16:58"],
    ["free text", "yesterday"],
    ["a number", 1758629818000],
  ])("refuses %s", (_, watchedAt) => {
    expect(
      restoreWatchedInputSchema.safeParse({ movieId: 550, watchedAt }).success,
    ).toBe(false);
  });

  it("refuses a bad movie id even with a valid time", () => {
    expect(
      restoreWatchedInputSchema.safeParse({
        movieId: 0,
        watchedAt: "2026-09-23T12:16:58Z",
      }).success,
    ).toBe(false);
  });
});

describe("restoreWatchlistInputSchema (spec 0008, AC-6)", () => {
  it("takes the movie id alone", () => {
    expect(restoreWatchlistInputSchema.parse({ movieId: 550 })).toEqual({
      movieId: 550,
    });
  });

  it("drops any extra field the client sends, such as a planned time", () => {
    expect(
      restoreWatchlistInputSchema.parse({
        movieId: 550,
        watchlistedAt: "2001-01-01T00:00:00Z",
      }),
    ).toEqual({ movieId: 550 });
  });

  it.each([0, -1, 1.5, "550", null])("refuses the id %j", (movieId) => {
    expect(restoreWatchlistInputSchema.safeParse({ movieId }).success).toBe(
      false,
    );
  });
});

/**
 * covers: spec 0011, AC-12, AC-15, AC-19
 *
 * The episode refusals are pinned through `app/shows/actions.test.ts`. These
 * pin the accepting edge: Specials, the list bound the SQL guard shares, and
 * the fields the client can never pass on.
 */
describe("seasonNumberSchema (spec 0011)", () => {
  it.each([0, 1, 32767])(
    "accepts the season %s, 0 being Specials (AC-12)",
    (n) => {
      expect(seasonNumberSchema.safeParse(n).success).toBe(true);
    },
  );

  it.each([-1, 32768, 1.5, "1"])("refuses %j", (n) => {
    expect(seasonNumberSchema.safeParse(n).success).toBe(false);
  });
});

describe("episodeIdListSchema (spec 0011, AC-15)", () => {
  it("accepts one id and exactly 1000, the bound the SQL guard shares", () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => i + 1);
    expect(episodeIdListSchema.safeParse([62085]).success).toBe(true);
    expect(episodeIdListSchema.safeParse(thousand).success).toBe(true);
  });
});

describe("episode input schemas (spec 0011)", () => {
  it("drops a client supplied user_id and air date (AC-19)", () => {
    expect(
      episodeWatchedInputSchema.parse({
        showId: 1396,
        seasonNumber: 1,
        episodeId: 62085,
        watched: true,
        user_id: "user-b",
        airDate: "2001-01-01",
      }),
    ).toEqual({
      showId: 1396,
      seasonNumber: 1,
      episodeId: 62085,
      watched: true,
    });
  });

  it("lets an episode rating carry null, which clears the score (AC-6)", () => {
    expect(
      episodeRatingInputSchema.safeParse({
        showId: 1396,
        seasonNumber: 1,
        episodeId: 62085,
        rating: null,
      }).success,
    ).toBe(true);
  });

  it("marks a season with no ids, and ignores any the client sends", () => {
    expect(
      seasonWatchedInputSchema.parse({
        showId: 1396,
        seasonNumber: 1,
        watched: true,
        episodeIds: [999],
      }),
    ).toEqual({ showId: 1396, seasonNumber: 1, watched: true });
  });

  it("requires the rendered ids to unmark a season (AC-11)", () => {
    expect(
      seasonWatchedInputSchema.safeParse({
        showId: 1396,
        seasonNumber: 1,
        watched: false,
        episodeIds: [62085, 62086],
      }).success,
    ).toBe(true);
    expect(
      seasonWatchedInputSchema.safeParse({
        showId: 1396,
        seasonNumber: 1,
        watched: false,
      }).success,
    ).toBe(false);
  });
});

describe("seasonUndoInputSchema restore dates (spec 0011, AC-11, AC-15)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function restoreAt(watchedAt: string) {
    return seasonUndoInputSchema.safeParse({
      showId: 1396,
      undo: { kind: "restore", entries: [{ episodeId: 62085, watchedAt }] },
    }).success;
  }

  it("accepts a date equal to now, and refuses one a millisecond later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
    expect(restoreAt("2026-09-25T12:00:00.000Z")).toBe(true);
    expect(restoreAt("2026-09-25T12:00:00.001Z")).toBe(false);
  });

  it("compares the instant, not the text, across offsets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    // 13:30 at +02:00 is 11:30 UTC, already past.
    expect(restoreAt("2026-09-25T13:30:00+02:00")).toBe(true);
    // 11:30 at -02:00 is 13:30 UTC, still ahead.
    expect(restoreAt("2026-09-25T11:30:00-02:00")).toBe(false);
  });

  it("refuses an undo kind it does not know", () => {
    expect(
      seasonUndoInputSchema.safeParse({
        showId: 1396,
        undo: { kind: "delete", episodeIds: [62085] },
      }).success,
    ).toBe(false);
  });
});
