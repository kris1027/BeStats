import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GameCardDemo } from "./game-card-demo";

/**
 * covers: spec 0030, AC-15
 *
 * `/showcase` keeps every catalog game card state the spec lists, and its
 * bookmark is reachable and toggled from the keyboard.
 */
function card(name: string) {
  const heading = screen.getByRole("heading", { name });
  const item = heading.closest("li");
  if (item === null) throw new Error(`No card for ${name}`);
  return within(item);
}

const POSTER = "https://example.test/poster.jpg";

describe("GameCardDemo", () => {
  it("renders the seven states", () => {
    render(<GameCardDemo poster={POSTER} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("gives a visitor no control and a signed in card the bookmark", () => {
    render(<GameCardDemo poster={POSTER} />);
    expect(card("Visitor").queryByRole("button")).not.toBeInTheDocument();
    expect(
      card("No status").getByRole("button", {
        name: "Want to play: No status",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the release pill or Date TBA only on an unreleased wanted game", () => {
    render(<GameCardDemo poster={POSTER} />);
    expect(
      card("Want to play, released").queryByText(/^Releases/),
    ).not.toBeInTheDocument();
    expect(
      card("Want to play, unreleased").getByText("Releases Feb 3, 2027"),
    ).toBeInTheDocument();
    expect(
      card("Want to play, Date TBA").getByText("Release date to be announced"),
    ).toBeInTheDocument();
  });

  it("shows the chip and no button on started games, with the score when set", () => {
    render(<GameCardDemo poster={POSTER} />);
    const playing = card("Playing, scored");
    expect(playing.getByText("Playing")).toBeInTheDocument();
    expect(playing.getByText("Your score")).toBeInTheDocument();
    expect(playing.queryByRole("button")).not.toBeInTheDocument();
    const finished = card("Finished, unscored");
    expect(finished.getByText("Finished")).toBeInTheDocument();
    expect(finished.getByText("IGDB community rating")).toBeInTheDocument();
  });

  it("toggles the bookmark with Enter and Space", async () => {
    const user = userEvent.setup();
    render(<GameCardDemo poster={POSTER} />);
    const button = card("No status").getByRole("button");
    button.focus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
});
