import { describe, expect, it } from "vitest";

import {
  applyEpisodeIntent,
  applyEpisodeIntents,
  type EpisodeStates,
} from "./episode-intent";

/**
 * covers: spec 0011, AC-5, AC-6, AC-9 to AC-11, AC-13, AC-16
 *
 * The optimistic reducer must agree with the five episode functions exactly,
 * or a row flips twice. Each case mirrors one in
 * `supabase/tests/080-episode-tracking-functions.test.sql`.
 */
const states: EpisodeStates = {
  1: { watched: true, rating: 6 },
  2: { watched: false, rating: 4 },
};

describe("applyEpisodeIntent", () => {
  it("marking an untracked episode makes it watched and unrated (AC-5)", () => {
    expect(
      applyEpisodeIntent({}, { kind: "watched", episodeId: 3, value: true })[3],
    ).toEqual({ watched: true, rating: null });
  });

  it("marking keeps the rating; unmarking keeps it too (AC-5)", () => {
    expect(
      applyEpisodeIntent(states, {
        kind: "watched",
        episodeId: 2,
        value: true,
      })[2],
    ).toEqual({ watched: true, rating: 4 });
    expect(
      applyEpisodeIntent(states, {
        kind: "watched",
        episodeId: 1,
        value: false,
      })[1],
    ).toEqual({ watched: false, rating: 6 });
  });

  it("rating an unwatched episode also marks it watched (AC-6)", () => {
    expect(
      applyEpisodeIntent(states, { kind: "rating", episodeId: 2, value: 9 })[2],
    ).toEqual({ watched: true, rating: 9 });
    expect(
      applyEpisodeIntent({}, { kind: "rating", episodeId: 5, value: 8 })[5],
    ).toEqual({ watched: true, rating: 8 });
  });

  it("clearing a rating keeps the watched mark (AC-6)", () => {
    expect(
      applyEpisodeIntent(states, {
        kind: "rating",
        episodeId: 1,
        value: null,
      })[1],
    ).toEqual({ watched: true, rating: null });
  });

  it("mark season makes every listed id watched and touches no rating (AC-9)", () => {
    expect(
      applyEpisodeIntent(states, {
        kind: "season_mark",
        episodeIds: [1, 2, 3],
      }),
    ).toEqual({
      1: { watched: true, rating: 6 },
      2: { watched: true, rating: 4 },
      3: { watched: true, rating: null },
    });
  });

  it("unmark season clears watched, keeps ratings and never creates state (AC-11)", () => {
    expect(
      applyEpisodeIntent(states, {
        kind: "season_unmark",
        episodeIds: [1, 2, 3],
      }),
    ).toEqual({
      1: { watched: false, rating: 6 },
      2: { watched: false, rating: 4 },
    });
  });

  it("never changes its input", () => {
    const before = structuredClone(states);
    applyEpisodeIntent(states, { kind: "season_mark", episodeIds: [1, 2] });
    applyEpisodeIntent(states, { kind: "season_unmark", episodeIds: [1, 2] });
    expect(states).toEqual(before);
  });
});

describe("applyEpisodeIntents (AC-16)", () => {
  it("replays pending clicks in order, so the last one wins", () => {
    expect(
      applyEpisodeIntents(states, [
        { kind: "rating", episodeId: 2, value: 7 },
        { kind: "rating", episodeId: 2, value: 8 },
        { kind: "watched", episodeId: 1, value: false },
        { kind: "watched", episodeId: 1, value: true },
      ]),
    ).toEqual({
      1: { watched: true, rating: 6 },
      2: { watched: true, rating: 8 },
    });
  });

  it("mark season then its Undo returns the newly marked rows to unwatched (AC-10)", () => {
    expect(
      applyEpisodeIntents(states, [
        { kind: "season_mark", episodeIds: [1, 2] },
        { kind: "season_unmark", episodeIds: [2] },
      ]),
    ).toEqual({
      1: { watched: true, rating: 6 },
      2: { watched: false, rating: 4 },
    });
  });
});
