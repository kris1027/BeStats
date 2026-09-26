import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0012, AC-7, AC-8, AC-10, AC-11, AC-15
 *
 * The show page's rating slots. The one private read is the boundary, so it
 * is what is replaced; the slots are rendered as the server would, by
 * awaiting them.
 */
const getShowEpisodeRatings = vi.fn();
vi.mock("@/lib/tracking/show-ratings", () => ({
  getShowEpisodeRatings: (...args: unknown[]) => getShowEpisodeRatings(...args),
}));

const { ShowRatingSlot } = await import("./show-rating-slot");
const { SeasonRatingBadgeSlot } = await import("./season-rating-badge-slot");

function rated(...entries: [seasonNumber: number, rating: number][]) {
  return {
    kind: "ok",
    state: entries.map(([seasonNumber, rating]) => ({ seasonNumber, rating })),
  };
}

const line = () =>
  screen.getByText("Your show rating").closest("p") as HTMLElement;

afterEach(() => {
  vi.clearAllMocks();
});

describe("ShowRatingSlot (AC-7, AC-10, AC-11)", () => {
  it("averages the rated regular seasons with equal weight", async () => {
    getShowEpisodeRatings.mockResolvedValue(
      rated([1, 8], [1, 8], [1, 8], [2, 6]),
    );
    render(await ShowRatingSlot({ showId: 1396 }));
    expect(line()).toHaveTextContent("Your show rating7.0from 2 rated seasons");
    expect(line()).not.toHaveTextContent("Specials");
    expect(getShowEpisodeRatings).toHaveBeenCalledWith(1396);
  });

  it("uses the singular and notes rated Specials it leaves out", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([0, 10], [1, 6]));
    render(await ShowRatingSlot({ showId: 1 }));
    expect(line()).toHaveTextContent(
      "6.0from 1 rated season · Specials not included",
    );
  });

  it("reads Not rated with only the Specials note when only Specials are rated", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([0, 9]));
    render(await ShowRatingSlot({ showId: 1 }));
    expect(line()).toHaveTextContent(
      "Your show ratingNot ratedSpecials not included",
    );
    expect(line()).not.toHaveTextContent("from");
  });

  it("reads Not rated with no basis when nothing is rated, never zero", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated());
    render(await ShowRatingSlot({ showId: 1 }));
    expect(line()).toHaveTextContent(/^Your show ratingNot rated$/);
  });

  it("counts every regular season, not just the first two", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([1, 9], [3, 6], [5, 7]));
    render(await ShowRatingSlot({ showId: 1 }));
    expect(line()).toHaveTextContent("7.3from 3 rated seasons");
  });

  it("adds no tab stop and no control (AC-16)", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([1, 8], [0, 9]));
    render(await ShowRatingSlot({ showId: 1 }));
    expect(within(line()).queryAllByRole("button")).toHaveLength(0);
    expect(within(line()).queryAllByRole("link")).toHaveLength(0);
    expect(line().querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("wears the cyan personal look, never the TMDB badge (AC-15)", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([1, 8]));
    render(await ShowRatingSlot({ showId: 1 }));
    const pill = line().querySelector('[data-slot="glass-pill"]');
    expect(pill).toHaveClass("glass-rim-score");
    expect(line()).not.toHaveTextContent("TMDB");
  });

  it("renders nothing for a visitor", async () => {
    getShowEpisodeRatings.mockResolvedValue({ kind: "signed_out" });
    expect(await ShowRatingSlot({ showId: 1 })).toBeNull();
  });

  it("offers a retry to the same show when the read fails", async () => {
    getShowEpisodeRatings.mockResolvedValue({ kind: "failed" });
    render(await ShowRatingSlot({ showId: 1396 }));
    expect(
      screen.getByText("Couldn't load your tracking."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/shows/1396",
    );
    expect(screen.queryByText("Your show rating")).not.toBeInTheDocument();
  });
});

describe("SeasonRatingBadgeSlot (AC-8, AC-15)", () => {
  it("shows the season's mean with a screen reader label", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([1, 7], [1, 8], [2, 4]));
    render(await SeasonRatingBadgeSlot({ showId: 1, seasonNumber: 1 }));
    expect(screen.getByText("Your season rating")).toHaveClass("sr-only");
    expect(
      screen.getByText("Your season rating").closest("[data-slot]"),
    ).toHaveTextContent("Your season rating 7.5");
  });

  it("badges Specials like any season", async () => {
    getShowEpisodeRatings.mockResolvedValue(rated([0, 10]));
    render(await SeasonRatingBadgeSlot({ showId: 1, seasonNumber: 0 }));
    expect(screen.getByText("10.0")).toBeInTheDocument();
  });

  it.each([
    ["an unrated season", rated([1, 7])],
    ["a visitor", { kind: "signed_out" }],
    ["a failed read", { kind: "failed" }],
  ])("renders nothing for %s", async (_case, result) => {
    getShowEpisodeRatings.mockResolvedValue(result);
    expect(
      await SeasonRatingBadgeSlot({ showId: 1, seasonNumber: 2 }),
    ).toBeNull();
  });
});
