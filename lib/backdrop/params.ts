/**
 * How much scene a device gets (prompts/ambient-background.md, decision 5).
 *
 * The design file drew a 140 × 90 point wave, 26 panels and 600 dust points
 * at up to 2× pixel ratio. That is cheap on a desktop GPU and wasteful on a
 * phone, where the same area reads just as well at half the density. The
 * reduced grid doubles its spacing so it still spans the same width.
 */
export interface BackdropBudget {
  gridWidth: number;
  gridDepth: number;
  spacing: number;
  panels: number;
  dust: number;
  pixelRatio: number;
}

/** Below this width, or with a coarse pointer, the lighter scene is used. */
export const COMPACT_BREAKPOINT = 768;

/** The design used 2; 1.5 is visually identical for soft points and lines. */
export const MAX_PIXEL_RATIO = 1.5;

export const FULL_BUDGET = {
  gridWidth: 140,
  gridDepth: 90,
  spacing: 0.28,
  panels: 26,
  dust: 600,
} as const;

export const COMPACT_BUDGET = {
  gridWidth: 70,
  gridDepth: 45,
  spacing: 0.56,
  panels: 14,
  dust: 300,
} as const;

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
}): BackdropBudget {
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
 * Whether two budgets draw the same scene, ignoring the pixel ratio. The
 * geometry is uploaded to the GPU once, so a change here means rebuilding the
 * scene, while a pixel ratio change is only a canvas resize.
 */
export function sameGeometry(a: BackdropBudget, b: BackdropBudget): boolean {
  return (
    a.gridWidth === b.gridWidth &&
    a.gridDepth === b.gridDepth &&
    a.spacing === b.spacing &&
    a.panels === b.panels &&
    a.dust === b.dust
  );
}

/**
 * A small seeded generator (mulberry32). The scene's random placement is
 * seeded so tests can assert on it and every visit starts from the same
 * composition, rather than a different one per reload.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The panel instance layout: the attributes the panel shader declares, in
 * buffer order, with their float counts. The renderer derives every byte
 * offset from this list and the stride is its sum, so the buffer written by
 * `panelInstances` and the attributes read from it cannot drift apart.
 */
export const PANEL_ATTRIBUTES = [
  { name: "aI0", size: 4 }, // y0, z0, seed, speed
  { name: "aI1", size: 3 }, // spin, phase, scale
  { name: "aI2", size: 3 }, // rotation x, y, z
] as const;

/** Floats per panel instance, the sum of `PANEL_ATTRIBUTES`. */
export const PANEL_STRIDE = PANEL_ATTRIBUTES.reduce(
  (floats, { size }) => floats + size,
  0,
);

/**
 * The wave as a flat list of (x, z) pairs. Height is computed on the GPU
 * every frame, so the buffer is uploaded once and never touched again.
 */
export function waveGrid(budget: BackdropBudget): Float32Array {
  const { gridWidth: w, gridDepth: d, spacing } = budget;
  const out = new Float32Array(w * d * 2);
  let i = 0;
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      out[i++] = (x - w / 2) * spacing;
      out[i++] = (z - d / 2) * spacing - 6;
    }
  }
  return out;
}

/**
 * Per panel instance data, the design's random ranges unchanged:
 * y0, z0, seed, speed, spin, phase, scale, rotation x, y and z.
 * The shader derives x and the current depth from these and the time, which
 * is what lets the panels move without any per frame JavaScript.
 */
export function panelInstances(count: number, seed = 1): Float32Array {
  const random = seededRandom(seed);
  const out = new Float32Array(count * PANEL_STRIDE);
  for (let k = 0; k < count; k++) {
    const o = k * PANEL_STRIDE;
    out[o] = random() * 6 - 0.5;
    out[o + 1] = -random() * 30;
    out[o + 2] = random() * 1000;
    out[o + 3] = 0.6 + random() * 0.8;
    out[o + 4] = (random() - 0.5) * 0.15;
    out[o + 5] = random() * 6.28;
    out[o + 6] = 0.6 + random() * 1.1;
    out[o + 7] = (random() - 0.5) * 0.4;
    out[o + 8] = (random() - 0.5) * 0.9;
    out[o + 9] = (random() - 0.5) * 0.2;
  }
  return out;
}

/** Dust positions, the design's box: 30 wide, 10 tall, 30 deep. */
export function dustPoints(count: number, seed = 2): Float32Array {
  const random = seededRandom(seed);
  const out = new Float32Array(count * 3);
  for (let k = 0; k < count * 3; k += 3) {
    out[k] = (random() - 0.5) * 30;
    out[k + 1] = random() * 10 - 2;
    out[k + 2] = -random() * 30 + 6;
  }
  return out;
}
