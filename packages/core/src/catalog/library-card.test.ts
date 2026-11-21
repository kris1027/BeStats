import { describe, expect, it } from "vitest";

import {
  gameDateLine,
  libraryCardBadge,
  releasePillText,
  upcomingEpisodePill,
} from "./library-card";

/** covers: prompts/mobile-library-review-fixes.md, items 2, 4 and 8 */

describe("libraryCardBadge", () => {
  it("gives movies the TMDB rating on Watchlist and the score on Watched", () => {
    expect(libraryCardBadge("movie", "watchlist")).toBe("community");
    expect(libraryCardBadge("movie", "upcoming")).toBeNull();
    expect(libraryCardBadge("movie", "watched")).toBe("personal");
  });

  it("gives shows only the calculated rating, on Watched", () => {
    expect(libraryCardBadge("tv", "watchlist")).toBeNull();
    expect(libraryCardBadge("tv", "upcoming")).toBeNull();
    expect(libraryCardBadge("tv", "watched")).toBe("show-rating");
  });

  it("gives unstarted games the IGDB rating and started ones the score first", () => {
    expect(libraryCardBadge("game", "coming-soon")).toBe("community");
    expect(libraryCardBadge("game", "watchlist")).toBe("community");
    expect(libraryCardBadge("game", "upcoming")).toBe(
      "personal-else-community",
    );
    expect(libraryCardBadge("game", "watched")).toBe("personal-else-community");
  });

  it("gives a page the tab lacks no badge", () => {
    expect(libraryCardBadge("movie", "coming-soon")).toBeNull();
    expect(libraryCardBadge("tv", "coming-soon")).toBeNull();
  });
});

describe("releasePillText", () => {
  it("prints the short date and reads the full one", () => {
    expect(
      releasePillText({ shortDate: "Dec 25", fullDate: "Dec 25, 2026" }),
    ).toEqual({
      kind: "dated",
      text: "Dec 25",
      label: "Releases Dec 25, 2026",
    });
  });

  it("is Date TBA without a date", () => {
    expect(releasePillText(null)).toEqual({
      kind: "tba",
      label: "Release date to be announced",
    });
  });
});

describe("upcomingEpisodePill", () => {
  const today = "2026-11-21";

  it("names the episode with its short date inside today's year", () => {
    expect(
      upcomingEpisodePill("2026-12-20", { season: 2, episode: 1 }, today),
    ).toEqual({
      kind: "dated",
      text: "S2E1 · Dec 20",
      label: "Season 2 episode 1 airs Dec 20, 2026",
    });
  });

  it("keeps the year on a date in another year", () => {
    const pill = upcomingEpisodePill(
      "2027-02-03",
      { season: 3, episode: 4 },
      today,
    );
    expect(pill).toMatchObject({ kind: "dated", text: "S3E4 · Feb 3, 2027" });
  });

  it("is Date TBA naming the episode when only the episode is known", () => {
    expect(upcomingEpisodePill(null, { season: 2, episode: 1 }, today)).toEqual(
      { kind: "tba", label: "Season 2 episode 1, date to be announced" },
    );
  });

  it("is Date TBA for the show when nothing is known", () => {
    expect(upcomingEpisodePill(null, null, today)).toEqual({
      kind: "tba",
      label: "Next episode date to be announced",
    });
  });
});

describe("gameDateLine", () => {
  const dates = {
    startedAt: "2026-02-10T12:00:00+00:00",
    finishedAt: "2026-10-01T08:00:00+00:00",
  };

  it("prints the Started month on Playing and the Finished month on Finished", () => {
    expect(gameDateLine("upcoming", dates)).toBe("Started Feb 2026");
    expect(gameDateLine("watched", dates)).toBe("Finished Oct 2026");
  });

  it("prints nothing on Want to play and Coming soon", () => {
    expect(gameDateLine("watchlist", dates)).toBeNull();
    expect(gameDateLine("coming-soon", dates)).toBeNull();
  });

  it("prints nothing without the date or with a bad one", () => {
    expect(gameDateLine("upcoming", { ...dates, startedAt: null })).toBeNull();
    expect(
      gameDateLine("watched", { ...dates, finishedAt: "not a date" }),
    ).toBeNull();
  });
});
