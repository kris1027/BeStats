/**
 * covers: AGENTS.md section 7 (a movie is planned or watched, never both; a
 * score needs a watch mark; planning or unmarking drops the score) as the
 * phone's optimistic movie state draws it, through `applyMovieIntents`.
 *
 * The write hooks in this file are driven end to end by the movie, show,
 * game and card action screen tests; this file pins the pure state rule they
 * all build on, including the one value the app owns, the new mark's time.
 */
import type { V1MovieTitleState } from "@bestats/core/api/v1/titles";

import { applyMovieIntents } from "./title-writes";

const NOW = "2026-11-25T12:00:00.000Z";
const EARLIER = "2026-01-02T08:30:00.000Z";

const none: V1MovieTitleState = {
  planned: false,
  watchedAt: null,
  rating: null,
};
const planned: V1MovieTitleState = { ...none, planned: true };
const watchedScored: V1MovieTitleState = {
  planned: false,
  watchedAt: EARLIER,
  rating: 8,
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(NOW));
});
afterEach(() => {
  jest.useRealTimers();
});

describe("applyMovieIntents", () => {
  test("no intents leaves the state as it was", () => {
    expect(applyMovieIntents(watchedScored, [])).toEqual(watchedScored);
  });

  test("Plan on a fresh movie plans it", () => {
    expect(
      applyMovieIntents(none, [{ kind: "watchlist", value: true }]),
    ).toEqual(planned);
  });

  test("a new watch mark takes the movie off the plan and shows now", () => {
    expect(
      applyMovieIntents(planned, [{ kind: "watched", value: true }]),
    ).toEqual({ planned: false, watchedAt: NOW, rating: null });
  });

  test("marking a movie already watched keeps its stored time", () => {
    expect(
      applyMovieIntents(watchedScored, [{ kind: "watched", value: true }]),
    ).toEqual(watchedScored);
  });

  test("planning a watched, scored movie drops both mark and score", () => {
    expect(
      applyMovieIntents(watchedScored, [{ kind: "watchlist", value: true }]),
    ).toEqual(planned);
  });

  test("removing the watch mark drops the score too", () => {
    expect(
      applyMovieIntents(watchedScored, [{ kind: "watched", value: false }]),
    ).toEqual(none);
  });

  test("a score on an unwatched movie changes nothing", () => {
    expect(applyMovieIntents(planned, [{ kind: "rating", value: 7 }])).toEqual(
      planned,
    );
  });

  test("a score on a watched movie replaces the old one", () => {
    expect(
      applyMovieIntents(watchedScored, [{ kind: "rating", value: 3 }]),
    ).toEqual({ ...watchedScored, rating: 3 });
  });

  test("clearing the score keeps the watch mark", () => {
    expect(
      applyMovieIntents(watchedScored, [{ kind: "rating", value: null }]),
    ).toEqual({ ...watchedScored, rating: null });
  });

  test("Undo's mark then score brings a cleared movie back with its score", () => {
    // The restore applies these two intents in this order, so the score
    // lands only because the mark came first.
    expect(
      applyMovieIntents(none, [
        { kind: "watched", value: true },
        { kind: "rating", value: 9 },
      ]),
    ).toEqual({ planned: false, watchedAt: NOW, rating: 9 });
  });

  test("the score before the mark is refused, as the database would", () => {
    expect(
      applyMovieIntents(none, [
        { kind: "rating", value: 9 },
        { kind: "watched", value: true },
      ]),
    ).toEqual({ planned: false, watchedAt: NOW, rating: null });
  });

  test("never returns a movie both planned and watched", () => {
    const intents = [
      { kind: "watchlist", value: true },
      { kind: "watched", value: true },
      { kind: "watchlist", value: true },
    ] as const;
    const next = applyMovieIntents(none, intents);
    expect(next.planned && next.watchedAt !== null).toBe(false);
  });

  test("does not change the state it was given", () => {
    const before = { ...watchedScored };
    applyMovieIntents(watchedScored, [{ kind: "watchlist", value: true }]);
    expect(watchedScored).toEqual(before);
  });
});
