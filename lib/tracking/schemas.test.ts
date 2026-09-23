import { describe, expect, it } from "vitest";

import {
  movieIdSchema,
  ratingInputSchema,
  ratingSchema,
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
