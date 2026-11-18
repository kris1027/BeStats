import { describe, expect, it } from "vitest";

import { gameCardStatus, gameReleaseNote, isGameReleased } from "./game-page";
import { isMovieReleased, movieReleaseNote } from "./movie-page";

/**
 * covers: spec 0026, AC-8, AC-9
 *
 * The game release gate is the movie rule by design, so a game and a movie
 * open on the same UTC day. These cases pin the day boundary and that the two
 * never drift.
 */
const today = "2026-10-24";

describe("isGameReleased", () => {
  it("is true on the release day itself and after it (AC-9)", () => {
    expect(isGameReleased(today, today)).toBe(true);
    expect(isGameReleased("2015-05-19", today)).toBe(true);
  });

  it("is false the day before release, with no date, or a malformed date (AC-8)", () => {
    expect(isGameReleased("2026-10-25", today)).toBe(false);
    expect(isGameReleased(null, today)).toBe(false);
    expect(isGameReleased("2026-13-40", today)).toBe(false);
  });

  it("agrees with the movie gate for every date (AGENTS.md Games)", () => {
    for (const date of [today, "2026-10-23", "2026-10-25", null, "bad"]) {
      expect(isGameReleased(date, today)).toBe(isMovieReleased(date, today));
    }
  });
});

describe("gameReleaseNote", () => {
  it("prints the real date, and never invents one (AC-8)", () => {
    expect(gameReleaseNote("2027-10-24")).toBe("Releases Oct 24, 2027");
    expect(gameReleaseNote(null)).toBe("Release date to be announced");
    expect(gameReleaseNote("2026-13-40")).toBe("Release date to be announced");
  });

  it("reads exactly like the movie line", () => {
    expect(gameReleaseNote("2027-01-02")).toBe(movieReleaseNote("2027-01-02"));
  });
});

// spec 0030, AC-2, AC-6, AC-7, AC-8: the card reads the stored status as it
// is, and only Want to play asks the release gate.
describe("gameCardStatus", () => {
  it("is null with no row or no status", () => {
    expect(gameCardStatus(undefined, today, today)).toBeNull();
    expect(
      gameCardStatus({ status: null, rating: null }, today, today),
    ).toBeNull();
  });

  it("marks a Want to play game unreleased before its UTC day, or with no date (AC-7)", () => {
    const wanted = { status: "want_to_play" as const, rating: null };
    expect(gameCardStatus(wanted, "2026-10-25", today)).toEqual({
      status: "want_to_play",
      unreleased: true,
    });
    expect(gameCardStatus(wanted, null, today)).toEqual({
      status: "want_to_play",
      unreleased: true,
    });
    expect(gameCardStatus(wanted, today, today)).toEqual({
      status: "want_to_play",
      unreleased: false,
    });
  });

  it("never carries a score on Want to play, even if one were stored (AC-2)", () => {
    expect(
      gameCardStatus(
        { status: "want_to_play", rating: 7 },
        "2015-05-19",
        today,
      ),
    ).toEqual({ status: "want_to_play", unreleased: false });
  });

  it("carries the score of a started game, whatever its release date (AC-2, AC-6)", () => {
    expect(
      gameCardStatus({ status: "playing", rating: 8 }, null, today),
    ).toEqual({ status: "playing", rating: 8 });
    expect(
      gameCardStatus({ status: "finished", rating: null }, today, today),
    ).toEqual({ status: "finished", rating: null });
  });
});
