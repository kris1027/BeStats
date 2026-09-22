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
    { minWidth: 1280, columns: 6 },
    { minWidth: 1024, columns: 5 },
    { minWidth: 768, columns: 4 },
    { minWidth: 640, columns: 3 },
    { minWidth: null, columns: 2 },
  ];

/** `(min-width: 1280px) 16vw, ... , 50vw` parsed back into pairs. */
function parseSizes(sizes: string) {
  return sizes.split(",").map((entry) => {
    const trimmed = entry.trim();
    const match = trimmed.match(/^\(min-width:\s*(\d+)px\)\s*(\d+)vw$/);
    if (match) {
      return { minWidth: Number(match[1]), vw: Number(match[2]) };
    }
    const fallback = trimmed.match(/^(\d+)vw$/);
    if (!fallback) throw new Error(`unparsed sizes entry: ${trimmed}`);
    return { minWidth: null, vw: Number(fallback[1]) };
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

  it("steps 2, 3, 4, 5 then 6 columns across the breakpoints", () => {
    render(<PosterGrid />);

    expect(screen.getByRole("list")).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "md:grid-cols-4",
      "lg:grid-cols-5",
      "xl:grid-cols-6",
    );
  });

  it("keeps a caller class without dropping the column steps", () => {
    render(<PosterGrid className="mt-8" />);

    expect(screen.getByRole("list")).toHaveClass("mt-8", "grid-cols-2");
  });

  it("matches POSTER_SIZES breakpoint for breakpoint to the column counts", () => {
    const parsed = parseSizes(POSTER_SIZES);

    expect(parsed.map((entry) => entry.minWidth)).toEqual(
      COLUMNS_AT.map((entry) => entry.minWidth),
    );

    for (const [index, { columns }] of COLUMNS_AT.entries()) {
      // One column is 100/columns vw, floored: the gaps make a column slightly
      // narrower than its share, so rounding down is the right direction. That
      // is what turns 100/6 = 16.67 into the shipped 16vw.
      expect(parsed[index].vw).toBe(Math.floor(100 / columns));
    }
  });
});
