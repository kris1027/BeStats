import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MovieHero } from "@/components/movie/movie-hero";

/**
 * covers: spec 0006, AC-3, AC-4, AC-7
 *
 * The hero is where a missing value is most tempting to paper over, so every
 * fallback is asserted: absent means absent, never a zero or a stand in.
 */
const FULL = {
  title: "Fight Club",
  tagline: "Mischief. Mayhem. Soap.",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  releaseYear: 1999,
  runtimeMinutes: 139,
  genres: [
    { id: 18, name: "Drama" },
    { id: 53, name: "Thriller" },
  ],
  tmdbRating: 8.438,
  tmdbVoteCount: 32899,
};

const EMPTY = {
  title: "Untitled",
  tagline: null,
  posterUrl: null,
  backdropUrl: null,
  releaseYear: null,
  runtimeMinutes: null,
  genres: [],
  tmdbRating: null,
  tmdbVoteCount: 0,
};

describe("MovieHero", () => {
  it("shows the title as the only h1, with tagline, meta and genres", () => {
    render(<MovieHero {...FULL} />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Fight Club");
    expect(screen.getByText("Mischief. Mayhem. Soap.")).toBeInTheDocument();
    expect(screen.getByText("1999")).toBeInTheDocument();
    expect(screen.getByText("2h 19m")).toBeInTheDocument();
    const genres = screen.getByRole("list", { name: "Genres" });
    expect(genres).toHaveTextContent("Drama");
    expect(genres).toHaveTextContent("Thriller");
    // Chips are labels, not controls.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("labels the rating as TMDB with its vote count", () => {
    const { container } = render(<MovieHero {...FULL} />);

    const block = container.querySelector('[data-slot="tmdb-rating"]');
    expect(block).toHaveTextContent("8.4");
    expect(block).toHaveTextContent("TMDB");
    expect(block).toHaveTextContent("32,899 votes");
  });

  it("renders decorative images with empty alt text", () => {
    const { container } = render(<MovieHero {...FULL} />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    for (const image of images) expect(image).toHaveAttribute("alt", "");
  });

  it("leaves every missing value out rather than inventing one", () => {
    const { container } = render(<MovieHero {...EMPTY} />);

    expect(
      container.querySelector('[data-slot="detail-backdrop"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(
      container.querySelector('[data-slot="poster-fallback"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Genres" })).toBeNull();
    expect(container).not.toHaveTextContent("·");
    expect(container).not.toHaveTextContent(/\b0\b/);
    expect(screen.getByText("No TMDB rating yet")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("votes");
  });

  it("drops only the missing part of the meta line and its separator", () => {
    render(<MovieHero {...FULL} runtimeMinutes={null} />);

    const year = screen.getByText("1999");
    expect(year.closest("p")).toHaveTextContent(/^1999$/);
  });

  it("renders no tracking control (feature 8 adds them)", () => {
    render(<MovieHero {...FULL} />);

    expect(screen.queryByText(/watchlist|watched|your score/i)).toBeNull();
  });
});
