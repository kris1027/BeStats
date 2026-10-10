import { describe, expect, it } from "vitest";

import {
  EPISODE_TRACKING_MESSAGES,
  LIBRARY_COPY,
  LIBRARY_NOTES,
  MARK_NEXT_MESSAGES,
  NEXT_EPISODE_MESSAGES,
  SEASON_MESSAGES,
  SHOW_PROGRESS_MESSAGES,
  SHOW_TRACKING_COPY,
  SHOW_TRACKING_MESSAGES,
  TRACKING_MESSAGES,
  UPCOMING_MESSAGES,
  WATCHED_SHOW_LABELS,
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

/** covers: spec 0013, AC-1, AC-4, AC-8, AC-10, AC-11, AC-15 */
describe("SHOW_TRACKING_COPY (spec 0020, AC-2 to AC-5)", () => {
  it("labels the toggle Plan to watch or Tracking, named for Stop tracking", () => {
    expect(SHOW_TRACKING_COPY.tracking).toBe("Tracking");
    expect(SHOW_TRACKING_COPY.stopLabel("Severance")).toBe(
      "Stop tracking Severance",
    );
  });

  it("offers Plan to watch and names the show in each toast", () => {
    expect(SHOW_TRACKING_COPY.plan).toBe("Plan to watch");
    expect(SHOW_TRACKING_COPY.added("Severance")).toBe(
      "Severance added to your shows",
    );
    expect(SHOW_TRACKING_COPY.stopped("Severance")).toBe(
      "Stopped tracking Severance",
    );
    expect(SHOW_TRACKING_COPY.undoExpired).toBe(
      "Couldn't undo. Track the show again from its page.",
    );
  });

  it("names a show, not a movie, on every failure line", () => {
    expect(SHOW_TRACKING_MESSAGES.not_found).toBe(
      "This show isn't available to track.",
    );
    for (const line of Object.values(SHOW_TRACKING_MESSAGES)) {
      expect(line).not.toMatch(/movie/i);
    }
  });

  it("keeps the shared session copy, so the Sign in toast reads the same", () => {
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

describe("NEXT_EPISODE_MESSAGES and MARK_NEXT_MESSAGES (spec 0020, AC-9)", () => {
  it("shows the short code on the pill and spells it out for screen readers", () => {
    expect(NEXT_EPISODE_MESSAGES.pill(2, 5)).toBe("S2E5");
    expect(NEXT_EPISODE_MESSAGES.accessible(2, 5)).toBe(
      "Next episode, season 2 episode 5",
    );
  });

  it("names the show and episode on the button and both toasts", () => {
    expect(MARK_NEXT_MESSAGES.markLabel("Severance", 1, 3)).toBe(
      "Mark Severance season 1 episode 3 watched",
    );
    expect(MARK_NEXT_MESSAGES.marked("Severance", 1, 3)).toBe(
      "Marked Severance S1E3 watched",
    );
    expect(MARK_NEXT_MESSAGES.alreadyWatched("Severance", 1, 3)).toBe(
      "Severance S1E3 was already watched",
    );
  });
});

describe("UPCOMING_MESSAGES (spec 0020, AC-11, AC-13)", () => {
  it("puts the short date on the pill and the full date in the spoken text", () => {
    expect(UPCOMING_MESSAGES.datedPill(2, 1, "Oct 20")).toBe("S2E1 · Oct 20");
    expect(UPCOMING_MESSAGES.episodeAirs(2, 1, "October 20, 2026")).toBe(
      "Season 2 episode 1 airs October 20, 2026",
    );
    expect(UPCOMING_MESSAGES.releases("October 20, 2026")).toBe(
      "Releases October 20, 2026",
    );
  });

  it("says Date TBA with no date", () => {
    expect(UPCOMING_MESSAGES.dateTba).toBe("Date TBA");
  });
});

describe("LIBRARY_COPY (spec 0020, AC-18)", () => {
  it("pins every empty state", () => {
    expect(LIBRARY_COPY.watchlist.tv.empty).toEqual({
      title: "Nothing to watch right now",
      description:
        "Plan a show or catch up on one and its next episode shows up here.",
    });
    expect(LIBRARY_COPY.upcoming.tv.empty).toEqual({
      title: "Nothing coming up",
      description:
        "Planned shows not out yet, and shows you're caught up on with a dated next episode, show up here.",
    });
    expect(LIBRARY_COPY.watched.tv.empty).toEqual({
      title: "No watched shows yet",
      description: "Shows you're caught up on show up here.",
    });
    expect(LIBRARY_COPY.watchlist.movie.empty).toEqual({
      title: "No movies to watch",
      description: "Planned movies that are already out show up here.",
    });
    expect(LIBRARY_COPY.upcoming.movie.empty).toEqual({
      title: "No upcoming movies",
      description: "Planned movies not released yet show up here.",
    });
    expect(LIBRARY_COPY.watched.movie.empty).toEqual({
      title: "No watched movies yet",
      description: "Movies you mark watched show up here.",
    });
  });

  it("offers the catalog the tab lists", () => {
    expect(LIBRARY_COPY.upcoming.tv.browse).toBe("Browse shows");
    expect(LIBRARY_COPY.upcoming.movie.browse).toBe("Browse movies");
  });
});

describe("LIBRARY_NOTES, labels and the held section (spec 0020, AC-10, AC-12, AC-16, AC-17)", () => {
  it("states the ceiling per media type", () => {
    expect(LIBRARY_NOTES.checked(500, "tv")).toBe(
      "Checked your 500 most recent shows",
    );
    expect(LIBRARY_NOTES.checked(500, "movie")).toBe(
      "Checked your 500 most recent movies",
    );
  });

  it("counts the failed titles in the singular and plural", () => {
    expect(LIBRARY_NOTES.failed(1, "tv")).toBe("1 show couldn't be loaded");
    expect(LIBRARY_NOTES.failed(3, "movie")).toBe(
      "3 movies couldn't be loaded",
    );
  });

  it("labels a Watched show Finished or Caught up", () => {
    expect(WATCHED_SHOW_LABELS).toEqual({
      finished: "Finished",
      caught_up: "Caught up",
    });
  });
});
