import { describe, expect, it } from "vitest";

import { classifyMovie, upcomingReleaseDate } from "./movie-page";

/** covers: spec 0020, AC-13, AC-14 */
const today = "2026-10-07";

describe("classifyMovie (AC-13)", () => {
  it("puts a released planned movie on Watchlist, release day included", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: true, watchedAt: null },
        today,
      ),
    ).toBe("watchlist");
    expect(
      classifyMovie(
        { releaseDate: today, inWatchlist: true, watchedAt: null },
        today,
      ),
    ).toBe("watchlist");
  });

  it("puts a planned movie released after today on Upcoming", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-10-08", inWatchlist: true, watchedAt: null },
        today,
      ),
    ).toBe("upcoming");
  });

  it("puts a planned movie with no date or a malformed one on Upcoming", () => {
    expect(
      classifyMovie(
        { releaseDate: null, inWatchlist: true, watchedAt: null },
        today,
      ),
    ).toBe("upcoming");
    expect(
      classifyMovie(
        { releaseDate: "2026-02-30", inWatchlist: true, watchedAt: null },
        today,
      ),
    ).toBe("upcoming");
  });

  it("puts a watched movie on Watched, planned or not (AC-14)", () => {
    const watchedAt = "2026-09-01T10:00:00Z";
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: true, watchedAt },
        today,
      ),
    ).toBe("watched");
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: false, watchedAt },
        today,
      ),
    ).toBe("watched");
  });

  it("puts an unplanned, unwatched movie on no page", () => {
    expect(
      classifyMovie(
        { releaseDate: "2026-01-01", inWatchlist: false, watchedAt: null },
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
