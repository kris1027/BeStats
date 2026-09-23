import { describe, expect, it } from "vitest";

import { applyTrackingIntent } from "./intent";
import { EMPTY_MOVIE_TRACKING, type MovieTrackingState } from "./types";

/**
 * covers: spec 0007, AC-4, AC-5, AC-6, AC-8, AC-9, AC-15
 *
 * The optimistic reducer must agree with `mark_movie_watched` and `rate_movie`
 * exactly, or a control flips twice. Each case here mirrors one in
 * `supabase/tests/050-movie-tracking-functions.test.sql`.
 */
const planned: MovieTrackingState = {
  ...EMPTY_MOVIE_TRACKING,
  inWatchlist: true,
};
const watchedAndPlanned: MovieTrackingState = {
  inWatchlist: true,
  watched: true,
  rating: 6,
};

describe("applyTrackingIntent", () => {
  it("the first watch sets watched and clears the bookmark (AC-4)", () => {
    expect(
      applyTrackingIntent(planned, { kind: "watched", value: true }),
    ).toEqual({
      inWatchlist: false,
      watched: true,
      rating: null,
    });
  });

  it("marking an already watched movie again keeps a rewatch bookmark (AC-4)", () => {
    expect(
      applyTrackingIntent(watchedAndPlanned, { kind: "watched", value: true }),
    ).toEqual(watchedAndPlanned);
  });

  it("unwatching keeps the rating and the bookmark (AC-5)", () => {
    expect(
      applyTrackingIntent(watchedAndPlanned, { kind: "watched", value: false }),
    ).toEqual({ inWatchlist: true, watched: false, rating: 6 });
  });

  it("the bookmark never touches watched or rating (AC-6)", () => {
    const state = { inWatchlist: false, watched: true, rating: 9 };
    expect(
      applyTrackingIntent(state, { kind: "watchlist", value: true }),
    ).toEqual({
      ...state,
      inWatchlist: true,
    });
  });

  it("rating an unwatched, planned movie sets all three (AC-8)", () => {
    expect(applyTrackingIntent(planned, { kind: "rating", value: 8 })).toEqual({
      inWatchlist: false,
      watched: true,
      rating: 8,
    });
  });

  it("rating a watched movie touches only the rating (AC-8)", () => {
    expect(
      applyTrackingIntent(watchedAndPlanned, { kind: "rating", value: 10 }),
    ).toEqual({ ...watchedAndPlanned, rating: 10 });
  });

  it("clearing the rating keeps watched and the bookmark (AC-9)", () => {
    expect(
      applyTrackingIntent(watchedAndPlanned, { kind: "rating", value: null }),
    ).toEqual({ ...watchedAndPlanned, rating: null });
  });

  it("unwatching an unwatched movie changes nothing (AC-15)", () => {
    expect(
      applyTrackingIntent(planned, { kind: "watched", value: false }),
    ).toEqual(planned);
  });

  it("clearing the rating on an unwatched movie does not mark it watched (AC-9)", () => {
    const state = { inWatchlist: true, watched: false, rating: 5 };
    expect(applyTrackingIntent(state, { kind: "rating", value: null })).toEqual(
      { inWatchlist: true, watched: false, rating: null },
    );
  });

  it("rating a watched movie keeps a rewatch bookmark (AC-6, AC-8)", () => {
    const rewatch = { inWatchlist: true, watched: true, rating: null };
    expect(applyTrackingIntent(rewatch, { kind: "rating", value: 7 })).toEqual({
      inWatchlist: true,
      watched: true,
      rating: 7,
    });
  });

  it("never mutates the state it was given", () => {
    const state = Object.freeze({ ...planned });
    expect(() =>
      applyTrackingIntent(state, { kind: "rating", value: 8 }),
    ).not.toThrow();
    expect(state).toEqual(planned);
  });

  it("queued intents settle on the last one (AC-15)", () => {
    const after = [
      { kind: "rating", value: 7 } as const,
      { kind: "rating", value: 8 } as const,
    ].reduce(applyTrackingIntent, EMPTY_MOVIE_TRACKING);
    expect(after.rating).toBe(8);

    const toggled = [
      { kind: "watchlist", value: true } as const,
      { kind: "watchlist", value: false } as const,
    ].reduce(applyTrackingIntent, EMPTY_MOVIE_TRACKING);
    expect(toggled.inWatchlist).toBe(false);
  });
});
