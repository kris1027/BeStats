import { describe, expect, it } from "vitest";

import {
  EPISODE_TRACKING_MESSAGES,
  SEASON_MESSAGES,
  TRACKING_MESSAGES,
} from "./messages";

/**
 * covers: spec 0011, AC-7, AC-10, AC-11, AC-14
 *
 * The copy the season toasts and episode controls show. The strings are the
 * contract the verify steps read, so the exact wording is pinned.
 */
describe("SEASON_MESSAGES", () => {
  it("counts in the singular for one episode (AC-10, AC-11)", () => {
    expect(SEASON_MESSAGES.marked(1)).toBe("Marked 1 episode watched");
    expect(SEASON_MESSAGES.unmarked(1)).toBe("Unmarked 1 episode");
  });

  it("counts in the plural otherwise (AC-10, AC-11)", () => {
    expect(SEASON_MESSAGES.marked(7)).toBe("Marked 7 episodes watched");
    expect(SEASON_MESSAGES.unmarked(20)).toBe("Unmarked 20 episodes");
  });

  it("says nothing changed when every aired episode is already watched (AC-10)", () => {
    expect(SEASON_MESSAGES.nothingToMark).toBe(
      "Every aired episode is already watched",
    );
  });
});

describe("EPISODE_TRACKING_MESSAGES", () => {
  it("names the episode, not a movie, when it cannot be tracked (AC-7)", () => {
    expect(EPISODE_TRACKING_MESSAGES.not_found).toBe(
      "This episode isn't available to track.",
    );
    expect(EPISODE_TRACKING_MESSAGES.not_aired).toBe(
      "This episode hasn't aired yet.",
    );
  });

  it("points a refused Undo back at this page, not the movie page", () => {
    expect(EPISODE_TRACKING_MESSAGES.undo_expired).not.toMatch(/movie/i);
  });

  it("keeps the shared session copy, so the Sign in toast reads the same (AC-14)", () => {
    expect(EPISODE_TRACKING_MESSAGES.session_expired).toBe(
      TRACKING_MESSAGES.session_expired,
    );
  });

  it("has a non empty line for every error, and none mentions a movie", () => {
    for (const line of Object.values(EPISODE_TRACKING_MESSAGES)) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/movie/i);
    }
  });
});
