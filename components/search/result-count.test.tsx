import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResultCount } from "./result-count";

/**
 * covers: spec 0010, AC-11, AC-12; spec 0029, AC-4, AC-8
 *
 * The one line above the results. A games count is IGDB's exact total, so it
 * is never written as a floor the way TMDB's capped totals are.
 */
describe("ResultCount", () => {
  it("names IGDB's Popular list when a games search browses", () => {
    render(<ResultCount kind="browse" type="game" />);
    expect(screen.getByText("Popular games on IGDB")).toBeInTheDocument();
  });

  it("names TMDB when a movie search browses", () => {
    render(<ResultCount kind="browse" type="movie" />);
    expect(screen.getByText("Popular movies on TMDB")).toBeInTheDocument();
  });

  it("prints IGDB's total exactly, with separators and no plus, however large", () => {
    render(
      <ResultCount kind="exact" type="game" total={25000} endpoint="igdb" />,
    );
    expect(screen.getByText("25,000 games")).toBeInTheDocument();
  });

  it("uses the singular for one game", () => {
    render(<ResultCount kind="exact" type="game" total={1} endpoint="igdb" />);
    expect(screen.getByText(/^1 game$/)).toBeInTheDocument();
  });
});
