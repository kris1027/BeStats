import { describe, expect, it } from "vitest";

import {
  COMING_SOON_MESSAGES,
  EPISODE_TRACKING_MESSAGES,
  NEXT_EPISODE_MESSAGES,
  SEASON_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  SHOW_STATUS_MESSAGES,
  SHOW_TRACKING_MESSAGES,
  TRACKING_MESSAGES,
  TV_STATUS_LABELS,
  UP_NEXT_MESSAGES,
  UPCOMING_EMPTY_MESSAGES,
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

describe("UP_NEXT_MESSAGES (spec 0014, AC-5, AC-7 to AC-9, AC-13)", () => {
  it("uses the AGENTS.md section 9 caught up wording", () => {
    expect(UP_NEXT_MESSAGES.caughtUp).toBe("You're up to date");
  });

  it("puts the short date on the pill and the full date in the spoken text (AC-5)", () => {
    expect(UP_NEXT_MESSAGES.datedPill(2, 3, "Oct 2")).toBe("S2E3 · Oct 2");
    expect(UP_NEXT_MESSAGES.nextAirs(2, 3, "Oct 2, 2026")).toBe(
      "Next episode, season 2 episode 3, airs Oct 2, 2026",
    );
    expect(UP_NEXT_MESSAGES.firstAirs(1, 1, "Jan 21, 2027")).toBe(
      "Season 1 episode 1 airs Jan 21, 2027",
    );
  });

  it("names the show and episode on the button and both toasts (AC-8, AC-9)", () => {
    expect(UP_NEXT_MESSAGES.markLabel("Breaking Bad", 1, 2)).toBe(
      "Mark Breaking Bad season 1 episode 2 watched",
    );
    expect(UP_NEXT_MESSAGES.marked("Breaking Bad", 1, 2)).toBe(
      "Marked Breaking Bad S1E2 watched",
    );
    expect(UP_NEXT_MESSAGES.alreadyWatched("Breaking Bad", 1, 2)).toBe(
      "Breaking Bad S1E2 was already watched",
    );
  });

  it("keeps the unavailable and empty copy (AC-7, AC-13)", () => {
    expect(UP_NEXT_MESSAGES.unavailable).toBe("Next episode unavailable");
    expect(UP_NEXT_MESSAGES.empty).toBe(
      "Start watching a show and its next episode shows up here.",
    );
  });
});

describe("COMING_SOON_MESSAGES (spec 0014, AC-11 to AC-13)", () => {
  it("spells out the release date and the bookmark action (AC-12)", () => {
    expect(COMING_SOON_MESSAGES.releases("Oct 21, 2026")).toBe(
      "Releases Oct 21, 2026",
    );
    expect(COMING_SOON_MESSAGES.remove("Dune")).toBe(
      "Remove Dune from watchlist",
    );
  });

  it("says how many plans were checked past the ceiling (AC-11)", () => {
    expect(COMING_SOON_MESSAGES.checkedLimit(200)).toBe(
      "Checked your 200 most recently planned movies",
    );
  });

  it("keeps the empty copy, and one panel title when both are empty (AC-13)", () => {
    expect(COMING_SOON_MESSAGES.empty).toBe(
      "No planned movies are waiting for release.",
    );
    expect(UPCOMING_EMPTY_MESSAGES.title).toBe("Nothing upcoming yet");
  });
});

/**
 * covers: spec 0015, AC-5
 *
 * The automatic completion toasts, pinned word for word: Up Next and the
 * season mark fold it into their own toast, a single tick says it alone.
 */
describe("automatic completion copy (spec 0015, AC-5)", () => {
  it("joins the Up Next mark and the move", () => {
    expect(UP_NEXT_MESSAGES.markedCompleted("Dark", 3, 8)).toBe(
      "Marked Dark S3E8 watched · Moved to Completed",
    );
  });

  it("joins the season mark and the move, with the show's name", () => {
    expect(SEASON_MESSAGES.markedCompleted(1, "Dark")).toBe(
      "Marked 1 episode watched · Dark moved to Completed",
    );
    expect(SEASON_MESSAGES.markedCompleted(8, "Dark")).toBe(
      "Marked 8 episodes watched · Dark moved to Completed",
    );
  });

  it("says the move alone after a single tick or rating", () => {
    expect(SHOW_STATUS_MESSAGES.completed("Dark")).toBe(
      "Dark moved to Completed",
    );
  });
});
