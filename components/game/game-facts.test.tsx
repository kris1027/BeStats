import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameFacts } from "./game-facts";

/**
 * covers: spec 0031, AC-9, AC-10, AC-11
 *
 * Facts lists only what IGDB has, pluralises a label by its count, and prints
 * each platform's release at IGDB's precision with TBA last.
 */
const NONE = {
  gameModes: [],
  playerPerspectives: [],
  themes: [],
  franchises: [],
  series: [],
  gameEngines: [],
  platformReleases: [],
};

const value = (label: string) => screen.getByText(label).nextSibling;

describe("GameFacts", () => {
  it("lists every fact in order, joined in IGDB's order", () => {
    render(
      <GameFacts
        game={{
          gameModes: [
            { id: 1, name: "Single player" },
            { id: 2, name: "Multiplayer" },
          ],
          playerPerspectives: [{ id: 2, name: "Third person" }],
          themes: [{ id: 1, name: "Action" }],
          franchises: [{ id: 452, name: "The Witcher" }],
          series: [{ id: 62, name: "The Witcher" }],
          gameEngines: [{ id: 24, name: "REDengine" }],
          platformReleases: [
            {
              platform: "PC",
              release: { precision: "day", date: "2015-05-19" },
            },
            {
              platform: "Switch 2",
              release: { precision: "quarter", year: 2027, quarter: 1 },
            },
            { platform: "PlayStation 6", release: { precision: "tba" } },
          ],
        }}
      />,
    );

    const labels = [...document.querySelectorAll("dt")].map(
      (dt) => dt.textContent,
    );
    expect(labels).toEqual([
      "Game modes",
      "Player perspectives",
      "Themes",
      "Franchise",
      "Series",
      "Game engine",
      "Release dates",
    ]);
    expect(value("Game modes")).toHaveTextContent("Single player, Multiplayer");
    const lines = [...document.querySelectorAll("dd li")].map(
      (li) => li.textContent,
    );
    expect(lines).toEqual([
      "PC: May 19, 2015",
      "Switch 2: Q1 2027",
      "PlayStation 6: TBA",
    ]);
  });

  it("uses the plural label for more than one franchise or engine", () => {
    render(
      <GameFacts
        game={{
          ...NONE,
          franchises: [
            { id: 1, name: "A" },
            { id: 2, name: "B" },
          ],
          gameEngines: [
            { id: 1, name: "X" },
            { id: 2, name: "Y" },
          ],
        }}
      />,
    );

    expect(value("Franchises")).toHaveTextContent("A, B");
    expect(value("Game engines")).toHaveTextContent("X, Y");
  });

  it("leaves the panel out with no facts", () => {
    const { container } = render(<GameFacts game={NONE} />);

    expect(container).toBeEmptyDOMElement();
  });
});
