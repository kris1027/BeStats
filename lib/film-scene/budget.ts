/**
 * How much scene a device gets (prompts/film-strip-background.md, decision 8).
 *
 * The design file drew three strips of 400 ribbon segments and 70 bokeh
 * sprites at up to 2× pixel ratio. A phone shows less of the scene and pays
 * more for every pixel, so it gets two strips, coarser ribbons and half the
 * bokeh, which reads the same at that size.
 */
export interface SceneBudget {
  strips: number;
  segments: number;
  bokeh: number;
  pixelRatio: number;
}

/** Below this width, or with a coarse pointer, the lighter scene is used. */
export const COMPACT_BREAKPOINT = 768;

/** The design used 2; 1.5 is visually identical for soft, fogged shapes. */
export const MAX_PIXEL_RATIO = 1.5;

/** The design file's own scene, for a wide screen with a fine pointer. */
export const FULL_BUDGET = { strips: 3, segments: 400, bokeh: 70 } as const;

/** Two strips, coarser ribbons and half the bokeh. */
export const COMPACT_BUDGET = { strips: 2, segments: 240, bokeh: 35 } as const;

/**
 * Picks the budget from the viewport, never from a user agent string: a
 * narrow desktop window is treated like a phone because it shows as little.
 */
export function chooseBudget({
  viewportWidth,
  coarsePointer,
  devicePixelRatio,
}: {
  viewportWidth: number;
  coarsePointer: boolean;
  devicePixelRatio: number;
}): SceneBudget {
  const compact = coarsePointer || viewportWidth < COMPACT_BREAKPOINT;
  const ratio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return {
    ...(compact ? COMPACT_BUDGET : FULL_BUDGET),
    pixelRatio: Math.min(ratio, MAX_PIXEL_RATIO),
  };
}

/**
 * Whether two budgets build the same geometry. The geometry is uploaded once,
 * so a change here means a rebuild, while a pixel ratio change is only a
 * canvas resize.
 */
export function sameGeometry(a: SceneBudget, b: SceneBudget): boolean {
  return (
    a.strips === b.strips && a.segments === b.segments && a.bokeh === b.bokeh
  );
}
