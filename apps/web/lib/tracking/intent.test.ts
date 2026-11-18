import { describe, expect, it } from "vitest";

import { applyTrackingIntent } from "./intent";
import { EMPTY_MOVIE_TRACKING, type MovieTrackingState } from "./types";

/**
 * covers: spec 0007, AC-8, AC-9, AC-15; prompts/movie-plan-watched-exclusive.md
 *
 * The optimistic reducer must agree with `mark_movie_watched`, `rate_movie`,
 * `plan_movie` and `unmark_movie_watched` exactly, or a control flips twice.
 * Each case here mirrors one in
 * `supabase/tests/050-movie-tracking-functions.test.sql`.
 */
const planned: MovieTrackingState = {
  ...EMPTY_MOVIE_TRACKING,
  inWatchlist: true,
};
const watchedAndRated: MovieTrackingState = {
  inWatchlist: false,
  watched: true,
  rating: 6,
};

describe("applyTrackingIntent", () => {
  it("marking a planned movie watched clears the plan", () => {
    expect(
      applyTrackingIntent(planned, { kind: "watched", value: true }),
    ).toEqual({ inWatchlist: false, watched: true, rating: null });
  });

  it("marking an already watched movie again changes nothing", () => {
    expect(
      applyTrackingIntent(watchedAndRated, { kind: "watched", value: true }),
    ).toEqual(watchedAndRated);
  });

  it("unwatching removes the score too", () => {
    expect(
      applyTrackingIntent(watchedAndRated, { kind: "watched", value: false }),
    ).toEqual({ inWatchlist: false, watched: false, rating: null });
  });

  it("planning a watched movie removes the watch mark and the score", () => {
    expect(
      applyTrackingIntent(watchedAndRated, { kind: "watchlist", value: true }),
    ).toEqual({ inWatchlist: true, watched: false, rating: null });
  });

  it("unplanning touches only the plan", () => {
    expect(
      applyTrackingIntent(planned, { kind: "watchlist", value: false }),
    ).toEqual(EMPTY_MOVIE_TRACKING);
  });

  it("rating an unwatched movie changes nothing, as rate_movie refuses it", () => {
    expect(applyTrackingIntent(planned, { kind: "rating", value: 8 })).toEqual(
      planned,
    );
  });

  it("rating a watched movie touches only the rating (AC-8)", () => {
    expect(
      applyTrackingIntent(watchedAndRated, { kind: "rating", value: 10 }),
    ).toEqual({ ...watchedAndRated, rating: 10 });
  });

  it("clearing the rating keeps the watch mark (AC-9)", () => {
    expect(
      applyTrackingIntent(watchedAndRated, { kind: "rating", value: null }),
    ).toEqual({ ...watchedAndRated, rating: null });
  });

  it("unwatching an unwatched movie changes nothing (AC-15)", () => {
    expect(
      applyTrackingIntent(planned, { kind: "watched", value: false }),
    ).toEqual(planned);
  });

  it("no intent ever produces a planned and watched or a scored and unwatched state", () => {
    const intents = [
      { kind: "watchlist", value: true },
      { kind: "watchlist", value: false },
      { kind: "watched", value: true },
      { kind: "watched", value: false },
      { kind: "rating", value: 7 },
      { kind: "rating", value: null },
    ] as const;
    const states: MovieTrackingState[] = [
      EMPTY_MOVIE_TRACKING,
      planned,
      watchedAndRated,
      { inWatchlist: false, watched: true, rating: null },
    ];
    for (const state of states) {
      for (const intent of intents) {
        const next = applyTrackingIntent(state, intent);
        expect(next.inWatchlist && next.watched).toBe(false);
        expect(next.rating !== null && !next.watched).toBe(false);
      }
    }
  });

  it("never mutates the state it was given", () => {
    const state = Object.freeze({ ...watchedAndRated });
    expect(() =>
      applyTrackingIntent(state, { kind: "watchlist", value: true }),
    ).not.toThrow();
    expect(state).toEqual(watchedAndRated);
  });

  it("queued intents settle on the last one (AC-15)", () => {
    const after = [
      { kind: "watched", value: true } as const,
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
