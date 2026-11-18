import { cn } from "cn";
import type * as React from "react";

/**
 * The grid's column presets (spec 0022, AC-1 and AC-3). `catalog` is every
 * title grid; `wide` is the show page's season grid, which keeps the larger
 * cards it has always had.
 */
type PosterGridColumns = "catalog" | "wide";

/**
 * Full class literals, never built from parts, so Tailwind finds and emits
 * every one of them.
 */
const COLUMN_CLASSES: Record<PosterGridColumns, string> = {
  catalog: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
  wide: "grid-cols-2 md:grid-cols-4",
};

/**
 * Each preset's image `sizes`, matched breakpoint for breakpoint to its
 * columns (spec 0022, AC-4): one `floor(100 / columns)vw` per fluid step, and
 * one fixed width per column count the grid shows once it reaches its 1200px
 * cap at a 1232px viewport. `poster-grid.test.tsx` recomputes every entry, so
 * a column change that misses its sizes fails the suite.
 */
const POSTER_GRID_SIZES: Record<PosterGridColumns, string> = {
  catalog:
    "(min-width: 1280px) 187px, (min-width: 1232px) 288px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw",
  wide: "(min-width: 1232px) 288px, (min-width: 768px) 25vw, 50vw",
};

/**
 * Posters that load eagerly: one full row at the preset's widest count, so the
 * first row is never lazy at any width (spec 0022, AC-5).
 */
const POSTER_GRID_EAGER: Record<PosterGridColumns, number> = {
  catalog: 6,
  wide: 4,
};

/**
 * The poster grid, mobile first (spec 0004, AC-9, amended by spec 0022).
 *
 * `catalog` steps 2, 3 (`sm`), 4 (`md`, and still at `lg`) and 6 (`xl`)
 * columns, so a wide screen card stays close to the home row card's 180px.
 * Every step divides the 24 title page (`GRID_PAGE_SIZE`), so a full page
 * fills every row at every width; there is deliberately no 5 column step
 * (spec 0022, AC-1, AC-22). `wide` keeps 2 and 4 for the season grid. The
 * columns, `POSTER_GRID_SIZES` and `POSTER_GRID_EAGER` change together; a
 * card in the grid passes the preset's sizes.
 *
 * The 1200px cap keeps a full page a sensible length on a wide screen; past
 * the cap the grid is centred on every page, under the centred pagination.
 *
 * A `<ul>` rather than a bare div: a collection of titles is a list, and that
 * is what tells a screen reader how many results there are.
 */
function PosterGrid({
  columns = "catalog",
  className,
  children,
  ...props
}: React.ComponentProps<"ul"> & { columns?: PosterGridColumns }) {
  return (
    <ul
      data-slot="poster-grid"
      className={cn(
        "mx-auto grid w-full max-w-[1200px] gap-x-4 gap-y-6",
        COLUMN_CLASSES[columns],
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export {
  POSTER_GRID_EAGER,
  POSTER_GRID_SIZES,
  PosterGrid,
  type PosterGridColumns,
};
