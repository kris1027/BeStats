import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { POSTER_SIZES } from "@/components/poster-card";
import { PosterGrid } from "@/components/poster-grid";

/**
 * covers: AC-9, AC-8
 *
 * The grid's own comment names the failure this file is here to prevent: the
 * column counts live in `poster-grid.tsx` and are mirrored by `POSTER_SIZES`
 * in `poster-card.tsx`, and changing one without the other silently ships the
 * wrong image width to every screen. Nothing breaks visibly, nothing fails to
 * compile, the app just gets slower and blurrier.
 *
 * So the interesting test here is not "does it render a grid" but the
 * cross file invariant: at every breakpoint, the `sizes` viewport width has to
 * be roughly one column's worth of the viewport.
 */

/** Tailwind's default breakpoints; `globals.css` does not override them. */
const COLUMNS_AT: ReadonlyArray<{ minWidth: number | null; columns: number }> =
  [
    { minWidth: 768, columns: 4 },
    { minWidth: null, columns: 2 },
  ];

/** The grid's `max-w-[1200px]` cap, reached once the viewport passes it plus the 16px gutters. */
const GRID_CAP = { width: 1200, viewport: 1232, columns: 4, gap: 16 };

type SizesEntry = {
  minWidth: number | null;
  vw: number | null;
  px: number | null;
};

/** `(min-width: 1232px) 288px, ... , 50vw` parsed back into entries. */
function parseSizes(sizes: string): SizesEntry[] {
  return sizes.split(",").map((entry) => {
    const trimmed = entry.trim();
    const match = trimmed.match(
      /^(?:\(min-width:\s*(\d+)px\)\s*)?(\d+)(vw|px)$/,
    );
    if (!match) throw new Error(`unparsed sizes entry: ${trimmed}`);
    const value = Number(match[2]);
    return {
      minWidth: match[1] === undefined ? null : Number(match[1]),
      vw: match[3] === "vw" ? value : null,
      px: match[3] === "px" ? value : null,
    };
  });
}

describe("PosterGrid", () => {
  it("is a list, so a screen reader can count the results", () => {
    render(
      <PosterGrid>
        <li>One</li>
        <li>Two</li>
      </PosterGrid>,
    );

    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders its children in order", () => {
    render(
      <PosterGrid>
        <li>First</li>
        <li>Second</li>
      </PosterGrid>,
    );

    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["First", "Second"]);
  });

  it("steps from 2 to 4 columns at md and never goes wider", () => {
    render(<PosterGrid />);

    const grid = screen.getByRole("list");
    expect(grid).toHaveClass(
      "grid-cols-2",
      "md:grid-cols-4",
      "max-w-[1200px]",
      "mx-auto",
    );
    expect(grid.className).not.toMatch(/(?:sm|lg|xl|2xl):grid-cols-/);
  });

  it("keeps a caller class without dropping the column steps", () => {
    render(<PosterGrid className="mt-8" />);

    expect(screen.getByRole("list")).toHaveClass("mt-8", "grid-cols-2");
  });

  it("matches POSTER_SIZES breakpoint for breakpoint to the column counts", () => {
    const [capped, ...fluid] = parseSizes(POSTER_SIZES);

    // Past the cap a column has a fixed width: the grid's share less the gaps,
    // rounded up so the browser never picks an image narrower than the slot.
    expect(capped.minWidth).toBe(GRID_CAP.viewport);
    expect(capped.px).toBe(
      Math.ceil(
        (GRID_CAP.width - GRID_CAP.gap * (GRID_CAP.columns - 1)) /
          GRID_CAP.columns,
      ),
    );

    expect(fluid.map((entry) => entry.minWidth)).toEqual(
      COLUMNS_AT.map((entry) => entry.minWidth),
    );
    for (const [index, { columns }] of COLUMNS_AT.entries()) {
      // One column is 100/columns vw, floored: the gaps make a column slightly
      // narrower than its share, so rounding down is the right direction.
      expect(fluid[index].vw).toBe(Math.floor(100 / columns));
    }
  });
});
