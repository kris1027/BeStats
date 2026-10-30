import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameLibraryCardDemo } from "./game-library-card-demo";

/**
 * covers: spec 0027, AC-17
 *
 * `/showcase` is the drift detector for the UI, so its game library card
 * section has to keep every state the spec lists. Each card is found by the
 * name the demo gives it and checked for the mark that state is about.
 */
function card(name: string) {
  const heading = screen.getByRole("heading", { name });
  const item = heading.closest("li");
  if (item === null) throw new Error(`No card for ${name}`);
  return within(item);
}

describe("GameLibraryCardDemo", () => {
  it("renders eight cards, every state of the game library card", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("shows the community rating and no pill on a released Want to play game", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);
    const released = card("Want to play, released");

    expect(released.getByText("IGDB community rating")).toBeInTheDocument();
    expect(released.queryByText(/^Releases/)).not.toBeInTheDocument();
  });

  it("shows a dated release pill and a Date TBA pill", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);

    expect(
      card("Coming soon, dated").getByText("Releases Feb 3, 2027"),
    ).toBeInTheDocument();
    expect(
      card("Coming soon, Date TBA").getByText("Release date to be announced"),
    ).toBeInTheDocument();
  });

  it("names the page a Want to play card is on in its remove button", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);

    expect(
      card("Want to play, released").getByRole("button", {
        name: "Remove Want to play, released from Want to play",
      }),
    ).toBeInTheDocument();
    expect(
      card("Coming soon, dated").getByRole("button", {
        name: "Remove Coming soon, dated from Coming soon",
      }),
    ).toBeInTheDocument();
  });

  it("shows Playing with and without a score, and a scored Finished game", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);

    expect(card("Playing, scored").getByText("Your score")).toBeInTheDocument();
    expect(card("Playing, scored").getByText("Started Feb 2026")).toBeVisible();
    expect(
      card("Playing, not scored").getByText("IGDB community rating"),
    ).toBeInTheDocument();
    expect(
      card("Finished, scored").getByText("Finished Mar 2026"),
    ).toBeInTheDocument();
  });

  it("shows a hidden game with no link and a missing game as No longer on IGDB", () => {
    render(<GameLibraryCardDemo poster="https://example.test/poster.jpg" />);

    expect(
      card("Hidden by IGDB, no link").queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove missing game from your games",
      }),
    ).toBeInTheDocument();
    expect(
      card("No longer on IGDB").queryByRole("link"),
    ).not.toBeInTheDocument();
  });
});
