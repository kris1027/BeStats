import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShowMeta } from "./show-meta";

/**
 * covers: spec 0022, AC-13 (with spec 0009, AC-5)
 *
 * The age rating chip joins the facts row after the status pill. A show with
 * only a rating still gets the row, and one with nothing at all still
 * renders nothing.
 */
const CHIP = <span data-testid="age-chip">TV-MA</span>;

describe("ShowMeta", () => {
  it("puts the age rating after the status pill", () => {
    render(
      <ShowMeta
        airSpan="2008–2013"
        status="Ended"
        genres={[]}
        ageRating={CHIP}
      />,
    );

    const status = screen.getByText("Ended");
    const chip = screen.getByTestId("age-chip");
    expect(
      status.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the facts row for a rating alone", () => {
    render(<ShowMeta airSpan={null} status="" genres={[]} ageRating={CHIP} />);

    expect(screen.getByTestId("age-chip")).toBeVisible();
  });

  it("renders nothing with no facts, genres or rating", () => {
    const { container } = render(
      <ShowMeta airSpan={null} status="" genres={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
