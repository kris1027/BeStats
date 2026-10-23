import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameHero } from "@/components/game/game-hero";

/**
 * covers: spec 0025, AC-1 to AC-5
 *
 * The first page built from IGDB data, so every missing value is asserted:
 * absent means absent or stated, never `TBA`, a zero or today's date.
 */
const FULL = {
  name: "Resident Evil 3",
  coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg",
  releaseDate: "2020-03-20",
  gameType: "remake" as const,
  genres: [
    { id: 5, name: "Shooter" },
    { id: 31, name: "Adventure" },
  ],
  platforms: [
    { id: 6, name: "PC (Microsoft Windows)" },
    { id: 48, name: "PlayStation 4" },
    { id: 49, name: "Xbox One" },
    { id: 3, name: "linux" },
  ],
  communityRating: 7.946,
  communityRatingCount: 1234,
};

const EMPTY = {
  name: "Untitled",
  coverUrl: null,
  releaseDate: null,
  gameType: null,
  genres: [],
  platforms: [],
  communityRating: null,
  communityRatingCount: null,
};

describe("GameHero", () => {
  it("shows the name as the only h1, then the meta row, platforms and rating", () => {
    const { container } = render(<GameHero {...FULL} />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Resident Evil 3");
    expect(container.querySelector('[data-slot="detail-backdrop"]')).toBeNull();

    const meta = screen.getByText("Mar 20, 2020").closest("p");
    expect(meta).toHaveTextContent(/^Mar 20, 2020·Remake$/);
    const genres = screen.getByRole("list", { name: "Genres" });
    expect(genres).toHaveTextContent("Shooter");
    expect(genres).toHaveTextContent("Adventure");
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    const platforms = container.querySelector('[data-slot="game-platforms"]');
    const rating = container.querySelector('[data-slot="igdb-rating"]');
    expect(
      genres.compareDocumentPosition(platforms as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (platforms as Node).compareDocumentPosition(rating as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sorts the platforms by name, ignoring case", () => {
    const { container } = render(<GameHero {...FULL} />);

    expect(
      container.querySelector('[data-slot="game-platforms"]'),
    ).toHaveTextContent(
      /^Platforms: linux, PC \(Microsoft Windows\), PlayStation 4, Xbox One$/,
    );
  });

  it("labels the rating as IGDB with its count, never as a personal score", () => {
    const { container } = render(<GameHero {...FULL} />);

    const block = container.querySelector('[data-slot="igdb-rating"]');
    expect(block).toHaveTextContent("7.9");
    expect(block).toHaveTextContent("IGDB");
    expect(block).toHaveTextContent("1,234 votes");
    expect(screen.getByText("IGDB rating")).toHaveClass("sr-only");
    expect(container.querySelector('[data-slot="tmdb-rating"]')).toBeNull();
    expect(screen.queryByText(/your score/i)).toBeNull();
  });

  it.each([
    ["remaster", "Remaster"],
    ["expanded_game", "Expanded game"],
    ["standalone_expansion", "Standalone expansion"],
  ] as const)("labels a %s as %s", (gameType, label) => {
    render(<GameHero {...FULL} gameType={gameType} />);

    expect(screen.getByText("Mar 20, 2020").closest("p")).toHaveTextContent(
      `Mar 20, 2020·${label}`,
    );
  });

  it.each(["main_game", null] as const)(
    "adds no label for a %s game",
    (gameType) => {
      render(<GameHero {...FULL} gameType={gameType} />);

      expect(screen.getByText("Mar 20, 2020").closest("p")).toHaveTextContent(
        /^Mar 20, 2020$/,
      );
    },
  );

  it("leaves every missing value out rather than inventing one", () => {
    const { container } = render(<GameHero {...EMPTY} />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    const fallback = container.querySelector('[data-slot="poster-fallback"]');
    expect(fallback?.querySelector("svg")).toHaveClass("lucide-gamepad-2");
    expect(screen.queryByRole("list", { name: "Genres" })).toBeNull();
    expect(container.querySelector('[data-slot="game-platforms"]')).toBeNull();
    expect(container).not.toHaveTextContent("·");
    expect(container).not.toHaveTextContent(/TBA|\b0\b/);
    expect(screen.getByText("No IGDB rating yet")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("votes");
  });

  it("shows a rating with no count as the badge and IGDB alone", () => {
    const { container } = render(
      <GameHero {...EMPTY} communityRating={6} communityRatingCount={null} />,
    );

    const block = container.querySelector('[data-slot="igdb-rating"]');
    expect(block).toHaveTextContent(/^IGDB rating 6\.0IGDB$/);
  });

  it("renders the cover as a decorative image", () => {
    const { container } = render(<GameHero {...FULL} />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("alt", "");
  });
});
