/**
 * covers: AGENTS.md section 9 (community ratings stay visibly distinct from
 * personal ones, round only for display to one decimal, and a missing rating
 * is never shown as zero) for every card and title screen that reads these.
 */
import {
  communityRatingLabel,
  communityRatingText,
  formatCommunityRating,
} from "./community-rating";

describe("formatCommunityRating", () => {
  test.each([
    [7, "7.0"],
    [7.44, "7.4"],
    [7.46, "7.5"],
    [0, "0.0"],
    [81.25, "81.3"],
  ])("prints %p as %p", (value, printed) => {
    expect(formatCommunityRating(value)).toBe(printed);
  });
});

describe("communityRatingText", () => {
  test("names TMDB for movies and shows", () => {
    expect(communityRatingText("movie", 7.44)).toBe("TMDB 7.4");
    expect(communityRatingText("tv", 8)).toBe("TMDB 8.0");
  });

  test("names IGDB for games", () => {
    expect(communityRatingText("game", 81)).toBe("IGDB 81.0");
  });

  test("is null when the catalog has no rating, never zero", () => {
    expect(communityRatingText("movie", null)).toBeNull();
    expect(communityRatingText("game", null)).toBeNull();
  });

  test("keeps a real zero rating, as zero is not missing", () => {
    expect(communityRatingText("tv", 0)).toBe("TMDB 0.0");
  });
});

describe("communityRatingLabel", () => {
  test("reads a movie's and a show's rating as TMDB's", () => {
    expect(communityRatingLabel("movie", 7.4)).toBe("TMDB rating 7.4");
    expect(communityRatingLabel("tv", 6)).toBe("TMDB rating 6.0");
  });

  test("reads a game's rating as IGDB's community rating", () => {
    expect(communityRatingLabel("game", 81)).toBe("IGDB community rating 81.0");
  });

  test("is null when the catalog has no rating", () => {
    expect(communityRatingLabel("game", null)).toBeNull();
  });

  test("never reads as the user's own score", () => {
    for (const type of ["movie", "tv", "game"] as const) {
      const label = communityRatingLabel(type, 5) ?? "";
      expect(label).toMatch(/^(TMDB|IGDB) /);
      expect(label.toLowerCase()).not.toMatch(/\b(your|my)\b/);
    }
  });
});
