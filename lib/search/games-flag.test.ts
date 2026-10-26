import { afterEach, describe, expect, it, vi } from "vitest";

import { gameSearchEnabled } from "./games-flag";

/**
 * covers: spec 0029, AC-1, AC-17
 *
 * Only a raw `type=game` reads the flag, so a bad flag value never breaks a
 * show or movie search.
 */
describe("gameSearchEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts type=game while the games library is on", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
    expect(gameSearchEnabled("game")).toBe(true);
  });

  it("refuses type=game while the games library is off", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "off");
    expect(gameSearchEnabled("game")).toBe(false);
  });

  it("never reads an invalid flag for another type", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "yes-please");
    for (const type of ["tv", "movie", undefined, null, ["game"]]) {
      expect(gameSearchEnabled(type)).toBe(false);
    }
    expect(() => gameSearchEnabled("game")).toThrow(
      "NEXT_PUBLIC_GAMES_LIBRARY",
    );
  });
});
