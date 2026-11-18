import { describe, expect, it } from "vitest";

import { isStartedGame } from "./types";

/**
 * covers: spec 0030, AC-2, AC-6, AC-11
 *
 * One rule picks the chip over the bookmark on every game card, and the
 * score badge only on a started game.
 */
describe("isStartedGame", () => {
  it("is true for Playing and Finished", () => {
    expect(isStartedGame({ status: "playing" })).toBe(true);
    expect(isStartedGame({ status: "finished" })).toBe(true);
  });

  it("is false for Want to play, no status, and no item", () => {
    expect(isStartedGame({ status: "want_to_play" })).toBe(false);
    expect(isStartedGame({ status: null })).toBe(false);
    expect(isStartedGame(null)).toBe(false);
    expect(isStartedGame(undefined)).toBe(false);
  });
});
