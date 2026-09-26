import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosterCard } from "@/components/poster-card";
import {
  CalculatedRatingBadge,
  PersonalScoreBadge,
  TmdbRatingBadge,
} from "@/components/rating-badges";

/**
 * Two rules that are easy to break later and expensive when broken.
 *
 * First, a missing poster must not change the card's footprint, or a grid with
 * patchy artwork reflows as images load. Second, the two rating badges must
 * stay distinguishable to someone who cannot see the colour that distinguishes
 * them, which AGENTS.md section 9 requires everywhere.
 */
describe("PosterCard", () => {
  it("links to the title with the title as its accessible name", () => {
    render(<PosterCard title="Lioness" posterUrl={null} href="/shows/123" />);

    expect(screen.getByRole("link", { name: "Lioness" })).toHaveAttribute(
      "href",
      "/shows/123",
    );
  });

  it("keeps the same 2:3 frame whether or not there is a poster", () => {
    const { container: withPoster } = render(
      <PosterCard
        title="With"
        posterUrl="https://image.tmdb.org/t/p/w500/a.jpg"
        href="/shows/1"
      />,
    );
    const { container: without } = render(
      <PosterCard title="Without" posterUrl={null} href="/shows/2" />,
    );

    const frameClass = (root: HTMLElement) =>
      root.querySelector(".aspect-2\\/3")?.className;

    expect(frameClass(withPoster)).toBeDefined();
    expect(frameClass(without)).toBe(frameClass(withPoster));
  });

  it("falls back to the title rather than inventing a placeholder image", () => {
    render(<PosterCard title="No Artwork Here" posterUrl={null} href="/x" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Once in the fallback tile, once in the caption.
    expect(screen.getAllByText("No Artwork Here")).toHaveLength(2);
  });

  it("gives the poster an empty alt, since the caption already names it", () => {
    render(
      <PosterCard
        title="Lioness"
        posterUrl="https://image.tmdb.org/t/p/w500/a.jpg"
        href="/x"
      />,
    );

    expect(screen.getByAltText("")).toBeInTheDocument();
  });
});

describe("rating badges", () => {
  it("labels a TMDB rating and a personal score differently for a screen reader", () => {
    render(
      <>
        <TmdbRatingBadge value={8.2} />
        <PersonalScoreBadge value={9} />
      </>,
    );

    expect(screen.getByText(/TMDB rating/)).toBeInTheDocument();
    expect(screen.getByText(/Your score/)).toBeInTheDocument();
  });

  it("renders no TMDB badge when TMDB has no rating", () => {
    const { container } = render(<TmdbRatingBadge value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says Not rated rather than zero for an unrated personal score", () => {
    render(<PersonalScoreBadge value={null} />);
    expect(screen.getByText("Not rated")).toBeVisible();
  });

  it("does not pad an explicit integer score to one decimal", () => {
    render(<PersonalScoreBadge value={8} />);
    expect(screen.getByText("8")).toBeVisible();
  });

  it("shows a calculated TMDB rating to one decimal place", () => {
    render(<TmdbRatingBadge value={7} />);
    expect(screen.getByText("7.0")).toBeVisible();
  });
});

describe("CalculatedRatingBadge · covers spec 0012 AC-3, AC-8, AC-15", () => {
  it("always shows one decimal, unlike an explicit score", () => {
    render(<CalculatedRatingBadge value={8} />);
    expect(screen.getByText("8.0")).toBeVisible();
  });

  it("rounds an unrounded mean for display only", () => {
    render(<CalculatedRatingBadge value={22 / 3} />);
    expect(screen.getByText("7.3")).toBeVisible();
  });

  it("says Not rated rather than zero", () => {
    render(<CalculatedRatingBadge value={null} />);
    expect(screen.getByText("Not rated")).toBeVisible();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("wears the cyan personal rim, never the TMDB look", () => {
    const { container } = render(<CalculatedRatingBadge value={7.5} />);
    const pill = container.querySelector('[data-slot="glass-pill"]');
    expect(pill).toHaveClass("glass-rim-score");
    expect(pill).not.toHaveTextContent("TMDB");
  });

  it("adds a screen reader label only when one is given", () => {
    const { container, rerender } = render(
      <CalculatedRatingBadge value={7.5} label="Your season rating" />,
    );
    expect(screen.getByText("Your season rating")).toHaveClass("sr-only");
    expect(container).toHaveTextContent("Your season rating 7.5");

    rerender(<CalculatedRatingBadge value={7.5} />);
    expect(container.querySelector(".sr-only")).toBeNull();
    expect(container).toHaveTextContent(/^7\.5$/);
  });
});
