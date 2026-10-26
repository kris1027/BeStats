import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IconKey } from "./icon-key";

/**
 * covers: prompts/grid-tabs-footer-legend.md, acceptance criterion 6
 *
 * The key lists every card mark on every route, so the whole list and its
 * order are pinned, not a subset.
 */
describe("IconKey", () => {
  it("always lists every mark, in the fixed order", () => {
    render(<IconKey />);

    const key = screen.getByRole("list", { name: "Icon key" });
    expect(
      within(key)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "TMDB rating",
      "Your score",
      "Plan / Want to play",
      "Planned / Want to play",
      "Mark watched",
      "Watched",
      "Next episode",
      "Release date",
    ]);
  });

  it("hides every icon from assistive technology, leaving the label", () => {
    render(<IconKey />);

    for (const item of screen.getAllByRole("listitem")) {
      const svg = item.querySelector("svg");
      expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("centres the entries and wraps them", () => {
    render(<IconKey />);

    expect(screen.getByRole("list", { name: "Icon key" })).toHaveClass(
      "flex-wrap",
      "justify-center",
    );
  });
});
