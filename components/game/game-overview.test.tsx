import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameOverview } from "./game-overview";

/**
 * covers: spec 0031, AC-5, AC-11
 *
 * Each part of the Overview shows only when IGDB has it, with no "No overview
 * available" line, and the section goes only when every part is missing.
 */
const NONE = {
  summary: null,
  storyline: null,
  developers: [],
  publishers: [],
};

describe("GameOverview", () => {
  it("shows the summary alone, with no Story heading or company lines", () => {
    render(<GameOverview {...NONE} summary={"Line one.\nLine two."} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Overview",
    );
    expect(screen.getByText(/Line one\./)).toHaveClass("whitespace-pre-line");
    expect(screen.queryByRole("heading", { name: "Story" })).toBeNull();
    expect(screen.queryByText("Developed by")).toBeNull();
  });

  it("shows the storyline under its own Story heading", () => {
    render(<GameOverview {...NONE} storyline="Geralt searches for Ciri." />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Story" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Geralt searches for Ciri.")).toBeInTheDocument();
  });

  it("shows the company lines alone, a company in both lines when IGDB says so", () => {
    render(
      <GameOverview
        {...NONE}
        developers={["CD Projekt RED"]}
        publishers={["CD Projekt RED", "WB Games"]}
      />,
    );

    expect(screen.getByText("Developed by").nextSibling).toHaveTextContent(
      "CD Projekt RED",
    );
    expect(screen.getByText("Published by").nextSibling).toHaveTextContent(
      "CD Projekt RED, WB Games",
    );
  });

  it("renders nothing at all with nothing to show", () => {
    const { container } = render(<GameOverview {...NONE} />);

    expect(container).toBeEmptyDOMElement();
  });
});
