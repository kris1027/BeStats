import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GameNotFound from "./not-found";

/**
 * covers: spec 0025, AC-7, as amended by spec 0028, AC-17
 *
 * The soft 404 for an unknown or hidden game. Its one action leads to the
 * games landing.
 */
describe("GameNotFound", () => {
  it("says the game is missing and offers Browse games", () => {
    render(<GameNotFound />);

    expect(screen.getByText("We couldn't find that game")).toBeInTheDocument();
    expect(
      screen.getByText(
        "IGDB has no game at this address. It may have been removed, or the link may be wrong.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse games" })).toHaveAttribute(
      "href",
      "/games",
    );
  });

  it("offers no retry, since there is nothing to try again", () => {
    render(<GameNotFound />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Try again")).toBeNull();
  });
});
