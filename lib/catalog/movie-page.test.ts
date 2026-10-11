import { describe, expect, it } from "vitest";

import {
  classifyMovie,
  isMovieReleased,
  movieCardStatus,
  movieReleaseNote,
  upcomingReleaseDate,
} from "./movie-page";

/** covers: spec 0020, AC-13, AC-14 */
const today = "2026-10-07";

describe("classifyMovie (AC-13)", () => {
  it("puts a released planned movie on Watchlist, release day included", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: true, watched: false },
        today,
      ),
    ).toBe("watchlist");
    expect(
      classifyMovie(
        { releaseDate: today, inWatchlist: true, watched: false },
        today,
      ),
    ).toBe("watchlist");
  });

  it("puts a planned movie released after today on Upcoming", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-10-08", inWatchlist: true, watched: false },
        today,
      ),
    ).toBe("upcoming");
  });

  it("puts a planned movie with no date or a malformed one on Upcoming", () => {
    expect(
      classifyMovie(
        { releaseDate: null, inWatchlist: true, watched: false },
        today,
      ),
    ).toBe("upcoming");
    expect(
      classifyMovie(
        { releaseDate: "2026-02-30", inWatchlist: true, watched: false },
        today,
      ),
    ).toBe("upcoming");
  });

  it("puts a watched movie on Watched, planned or not (AC-14)", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: true, watched: true },
        today,
      ),
    ).toBe("watched");
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: false, watched: true },
        today,
      ),
    ).toBe("watched");
  });

  it("puts an unplanned, unwatched movie on no page", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: false, watched: false },
        today,
      ),
    ).toBeNull();
  });
});

describe("upcomingReleaseDate (AC-13)", () => {
  it("keeps a real date after today", () => {
    expect(upcomingReleaseDate("2026-12-25", today)).toBe("2026-12-25");
  });

  it("reads today, a past day, a missing or a malformed date as Date TBA", () => {
    expect(upcomingReleaseDate(today, today)).toBeNull();
    expect(upcomingReleaseDate("2026-01-01", today)).toBeNull();
    expect(upcomingReleaseDate(null, today)).toBeNull();
    expect(upcomingReleaseDate("2026-13-40", today)).toBeNull();
  });
});

describe("isMovieReleased (release gate)", () => {
  it("is true from the release day on", () => {
    expect(isMovieReleased(today, today)).toBe(true);
    expect(isMovieReleased("1999-10-15", today)).toBe(true);
  });

  it("is false for a future, missing or malformed date", () => {
    expect(isMovieReleased("2026-10-08", today)).toBe(false);
    expect(isMovieReleased(null, today)).toBe(false);
    expect(isMovieReleased("2026-13-40", today)).toBe(false);
  });

  it("agrees with classifyMovie: markable exactly when on Watchlist (AC-6)", () => {
    for (const releaseDate of [today, "2026-10-08", null, "2026-13-40"]) {
      const page = classifyMovie(
        { releaseDate, inWatchlist: true, watched: false },
        today,
      );
      expect(page === "watchlist").toBe(isMovieReleased(releaseDate, today));
    }
  });
});

describe("movieReleaseNote (release gate)", () => {
  it("prints a real date and never invents one", () => {
    expect(movieReleaseNote("2026-10-24")).toBe("Releases Oct 24, 2026");
    expect(movieReleaseNote(null)).toBe("Release date to be announced");
    expect(movieReleaseNote("2026-13-40")).toBe("Release date to be announced");
  });
});

describe("movieCardStatus (prompts/catalog-card-status.md)", () => {
  const none = { inWatchlist: false, watched: false, rating: null };

  it("is null with no row, or a row that is neither planned nor watched", () => {
    expect(movieCardStatus(undefined, "2026-01-01", today)).toBeNull();
    expect(movieCardStatus(none, "2026-01-01", today)).toBeNull();
  });

  it("carries the score on Watched, and null when unscored", () => {
    expect(
      movieCardStatus(
        { ...none, watched: true, rating: 8 },
        "2026-01-01",
        today,
      ),
    ).toEqual({ page: "watched", rating: 8 });
    expect(
      movieCardStatus({ ...none, watched: true }, "2026-01-01", today),
    ).toEqual({ page: "watched", rating: null });
  });

  it("puts a watched movie on Watched even before its release", () => {
    expect(
      movieCardStatus({ ...none, watched: true }, "2027-01-01", today),
    ).toEqual({ page: "watched", rating: null });
  });

  it("places a planned movie by its release date, as the library does", () => {
    const planned = { ...none, inWatchlist: true };
    expect(movieCardStatus(planned, today, today)).toEqual({
      page: "watchlist",
    });
    expect(movieCardStatus(planned, "2026-10-08", today)).toEqual({
      page: "upcoming",
      releaseDate: "2026-10-08",
    });
    expect(movieCardStatus(planned, null, today)).toEqual({
      page: "upcoming",
      releaseDate: null,
    });
  });
});
