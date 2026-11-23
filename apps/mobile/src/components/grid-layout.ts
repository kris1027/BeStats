/**
 * Columns and spacing of every poster grid. `PosterGrid` lays out real cards
 * with them and `PosterGridSkeleton` its placeholders, so a loading grid has
 * exactly the shape of the grid that replaces it, with no jump when the
 * results arrive (apps/mobile/AGENTS.md, BeStats rules: every screen covers
 * its loading state).
 */
export const GRID = { columns: 3, gutter: 16, gap: 12 } as const;

/**
 * A grid card's width at this window width, floored so three cards and their
 * gaps never add up past the gutters and wrap a card to the next row.
 */
export function gridCardWidth(windowWidth: number): number {
  return Math.floor(
    (windowWidth - GRID.gutter * 2 - GRID.gap * (GRID.columns - 1)) /
      GRID.columns,
  );
}
