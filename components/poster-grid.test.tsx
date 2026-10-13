import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { POSTER_SIZES } from "@/components/poster-card";
import {
  POSTER_GRID_EAGER,
  POSTER_GRID_SIZES,
  PosterGrid,
  type PosterGridColumns,
} from "@/components/poster-grid";
import { GRID_PAGE_SIZE } from "@/lib/catalog/grid-page";

/**
 * covers: spec 0004 AC-9, AC-8; spec 0022 AC-1, AC-3, AC-4, AC-5, AC-22
 *
 * The grid's own comment names the failure this file is here to prevent: the
 * column counts and their image `sizes` live side by side in
 * `poster-grid.tsx`, and changing one without the other silently ships the
 * wrong image width to every screen. Nothing breaks visibly, nothing fails to
 * compile, the app just gets slower and blurrier.
 *
 * So the interesting test here is not "does it render a grid" but the
 * invariant, checked for every preset: at every breakpoint, the `sizes` entry
 * has to be one column's worth of the viewport, and past the cap one column's
 * fixed width.
 */

/**
 * Each preset's column steps, widest first. Tailwind's default breakpoints;
 * `globals.css` does not override them. A `Record` so a new preset with no
 * entry here fails the type check.
 */
const COLUMNS_AT: Record<
  PosterGridColumns,
  ReadonlyArray<{ minWidth: number | null; columns: number }>
> = {
  catalog: [
    { minWidth: 1280, columns: 6 },
    { minWidth: 768, columns: 4 },
    { minWidth: 640, columns: 3 },
    { minWidth: null, columns: 2 },
  ],
  wide: [
    { minWidth: 768, columns: 4 },
    { minWidth: null, columns: 2 },
  ],
};

/** The grid's `max-w-[1200px]` cap, reached once the viewport passes it plus the 16px gutters. */
const GRID_CAP = { width: 1200, viewport: 1232, gap: 16 };

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

/**
 * The `sizes` entries the AC-4 rule gives a preset: a fixed width for every
 * column count shown at or past the capped viewport, then one floored `vw`
 * entry per fluid step below it.
 */
function expectedSizes(steps: (typeof COLUMNS_AT)[PosterGridColumns]) {
  const fixed: SizesEntry[] = [];
  const fluid: SizesEntry[] = [];
  for (const [index, step] of steps.entries()) {
    const wider = steps[index - 1];
    // Capped while any part of this step's range is at or past 1232px.
    const capped =
      wider?.minWidth == null || wider.minWidth > GRID_CAP.viewport;
    if (capped) {
      fixed.push({
        minWidth: Math.max(step.minWidth ?? 0, GRID_CAP.viewport),
        vw: null,
        px: Math.ceil(
          (GRID_CAP.width - GRID_CAP.gap * (step.columns - 1)) / step.columns,
        ),
      });
    }
    if (step.minWidth === null || step.minWidth < GRID_CAP.viewport) {
      fluid.push({
        minWidth: step.minWidth,
        vw: Math.floor(100 / step.columns),
        px: null,
      });
    }
  }
  return [...fixed, ...fluid];
}

const PRESETS = Object.keys(COLUMNS_AT) as PosterGridColumns[];

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

  it("steps the catalog grid from 2 to 6 columns by default", () => {
    render(<PosterGrid />);

    const grid = screen.getByRole("list");
    expect(grid).toHaveClass(
      "grid-cols-2",
      "sm:grid-cols-3",
      "md:grid-cols-4",
      "xl:grid-cols-6",
      "max-w-[1200px]",
      "mx-auto",
      "gap-x-4",
      "gap-y-6",
    );
    expect(grid.className).not.toMatch(/(?:lg|2xl):grid-cols-/);
  });

  it("divides the 24 title page at every column step (spec 0022, AC-22)", () => {
    for (const { columns } of COLUMNS_AT.catalog) {
      expect(GRID_PAGE_SIZE % columns).toBe(0);
    }
  });

  it("keeps the wide preset at today's 2 and 4 columns", () => {
    render(<PosterGrid columns="wide" />);

    const grid = screen.getByRole("list");
    expect(grid).toHaveClass("grid-cols-2", "md:grid-cols-4", "max-w-[1200px]");
    expect(grid.className).not.toMatch(/(?:sm|lg|xl|2xl):grid-cols-/);
    expect(POSTER_GRID_SIZES.wide).toBe(
      "(min-width: 1232px) 288px, (min-width: 768px) 25vw, 50vw",
    );
  });

  it("keeps a caller class without dropping the column steps", () => {
    render(<PosterGrid className="mt-8" />);

    expect(screen.getByRole("list")).toHaveClass("mt-8", "grid-cols-2");
  });

  it("defaults a card's sizes to the catalog preset", () => {
    expect(POSTER_SIZES).toBe(POSTER_GRID_SIZES.catalog);
  });

  it.each(PRESETS)(
    "matches the %s sizes breakpoint for breakpoint to its columns",
    (preset) => {
      render(<PosterGrid columns={preset} />);
      const className = screen.getByRole("list").className;

      // The columns in the table are the ones the grid really renders.
      for (const { minWidth, columns } of COLUMNS_AT[preset]) {
        const prefix =
          minWidth === null
            ? ""
            : `${{ 640: "sm", 768: "md", 1024: "lg", 1280: "xl" }[minWidth]}:`;
        expect(className.split(" ")).toContain(`${prefix}grid-cols-${columns}`);
      }

      expect(parseSizes(POSTER_GRID_SIZES[preset])).toEqual(
        expectedSizes(COLUMNS_AT[preset]),
      );
    },
  );

  it("loads one full row eagerly at each preset's widest count", () => {
    for (const preset of PRESETS) {
      expect(POSTER_GRID_EAGER[preset]).toBe(COLUMNS_AT[preset][0].columns);
    }
  });
});
