import { describe, expect, it } from "vitest";

import {
  EPISODE_TRACKING_MESSAGES,
  NEXT_EPISODE_MESSAGES,
  SEASON_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  SHOW_STATUS_MESSAGES,
  SHOW_TRACKING_MESSAGES,
  TRACKING_MESSAGES,
  TV_STATUS_LABELS,
} from "./messages";
import { TV_STATUSES } from "./types";

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

/** covers: spec 0013, AC-1, AC-4, AC-8, AC-10, AC-11, AC-15 */
describe("TV_STATUS_LABELS (spec 0013, AC-1)", () => {
  it("lists the five statuses in menu order with their exact labels", () => {
    expect(TV_STATUSES.map((status) => TV_STATUS_LABELS[status])).toEqual([
      "Want to Watch",
      "Watching",
      "On Hold",
      "Dropped",
      "Completed",
    ]);
  });
});

describe("SHOW_STATUS_MESSAGES (spec 0013)", () => {
  it("names the show in each toast (AC-4, AC-8, AC-16)", () => {
    expect(SHOW_STATUS_MESSAGES.removed("Breaking Bad")).toBe(
      "Removed Breaking Bad from your shows",
    );
    expect(SHOW_STATUS_MESSAGES.started("Breaking Bad")).toBe(
      "Breaking Bad moved to Watching",
    );
    expect(SHOW_STATUS_MESSAGES.stopped("Breaking Bad")).toBe(
      "Breaking Bad moved to On Hold",
    );
  });

  it("names a show, not a movie, on every failure line", () => {
    expect(SHOW_TRACKING_MESSAGES.not_found).toBe(
      "This show isn't available to track.",
    );
    expect(SHOW_TRACKING_MESSAGES.undo_expired).toBe(
      "Couldn't undo. Change the status from the show page.",
    );
    for (const line of Object.values(SHOW_TRACKING_MESSAGES)) {
      expect(line).not.toMatch(/movie/i);
    }
  });

  it("keeps the shared session copy, so the Sign in toast reads the same (AC-21)", () => {
    expect(SHOW_TRACKING_MESSAGES.session_expired).toBe(
      TRACKING_MESSAGES.session_expired,
    );
  });
});

describe("SHOW_PROGRESS_MESSAGES (spec 0013, AC-10, AC-11)", () => {
  it("counts in the singular for one aired episode", () => {
    expect(SHOW_PROGRESS_MESSAGES.counted(0, 1)).toBe("0 of 1 episode watched");
  });

  it("counts in the plural otherwise, keyed on the total", () => {
    expect(SHOW_PROGRESS_MESSAGES.counted(1, 62)).toBe(
      "1 of 62 episodes watched",
    );
  });

  it("has the none aired and unavailable lines, with no number in either", () => {
    expect(SHOW_PROGRESS_MESSAGES.noneAired).toBe("No episodes have aired yet");
    expect(SHOW_PROGRESS_MESSAGES.unavailable).toBe(
      "Progress unavailable right now",
    );
    expect(SHOW_PROGRESS_MESSAGES.noneAired).not.toMatch(/\d|%/);
  });
});

describe("NEXT_EPISODE_MESSAGES (spec 0013, AC-15)", () => {
  it("shows the short code on the pill and spells it out for screen readers", () => {
    expect(NEXT_EPISODE_MESSAGES.pill(2, 10)).toBe("S2E10");
    expect(NEXT_EPISODE_MESSAGES.accessible(2, 10)).toBe(
      "Next episode, season 2 episode 10",
    );
    expect(NEXT_EPISODE_MESSAGES.upToDate).toBe("Up to date");
  });
});
