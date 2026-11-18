import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MovieOverview } from "@/components/movie/movie-overview";

/** covers: spec 0006, AC-4, AC-5 */
describe("MovieOverview", () => {
  it("shows an English overview with no language note", () => {
    render(<MovieOverview overview="A story." language="en" />);

    expect(screen.getByText("A story.")).not.toHaveAttribute("lang");
    expect(screen.queryByText(/original language/)).toBeNull();
  });

  it("marks an original language overview and says which language", () => {
    render(<MovieOverview overview="Une histoire." language="fr" />);

    expect(screen.getByText("Une histoire.")).toHaveAttribute("lang", "fr");
    expect(
      screen.getByText("Shown in the original language (French)"),
    ).toBeInTheDocument();
  });

  it("states a missing overview plainly", () => {
    render(<MovieOverview overview={null} language={null} />);

    expect(screen.getByText("No overview available.")).toBeInTheDocument();
  });
});
