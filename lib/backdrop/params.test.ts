import { describe, expect, it } from "vitest";

import {
  COMPACT_BUDGET,
  chooseBudget,
  dustPoints,
  FULL_BUDGET,
  MAX_PIXEL_RATIO,
  PANEL_STRIDE,
  panelInstances,
  sameGeometry,
  seededRandom,
  waveGrid,
} from "./params";

/** covers: prompts/ambient-background.md, AC-8 */
describe("chooseBudget", () => {
  it("gives a wide fine pointer screen the full scene", () => {
    const budget = chooseBudget({
      viewportWidth: 1440,
      coarsePointer: false,
      devicePixelRatio: 1,
    });
    expect(budget).toMatchObject(FULL_BUDGET);
    expect(budget.pixelRatio).toBe(1);
  });

  it.each([
    { viewportWidth: 390, coarsePointer: false },
    { viewportWidth: 767, coarsePointer: false },
    { viewportWidth: 1366, coarsePointer: true },
  ])("uses the compact scene for %o", (input) => {
    expect(chooseBudget({ ...input, devicePixelRatio: 2 })).toMatchObject(
      COMPACT_BUDGET,
    );
  });

  it("caps the pixel ratio at 1.5", () => {
    for (const devicePixelRatio of [2, 3, 1.5]) {
      expect(
        chooseBudget({
          viewportWidth: 1440,
          coarsePointer: false,
          devicePixelRatio,
        }).pixelRatio,
      ).toBe(MAX_PIXEL_RATIO);
    }
  });

  it("rebuilds only across the breakpoint, not for a pixel ratio change", () => {
    const wide = (devicePixelRatio: number) =>
      chooseBudget({
        viewportWidth: 1440,
        coarsePointer: false,
        devicePixelRatio,
      });
    const narrow = chooseBudget({
      viewportWidth: 600,
      coarsePointer: false,
      devicePixelRatio: 1,
    });
    expect(sameGeometry(wide(1), wide(2))).toBe(true);
    expect(sameGeometry(wide(1), narrow)).toBe(false);
  });

  it("treats a missing or nonsense pixel ratio as 1", () => {
    for (const devicePixelRatio of [0, Number.NaN, -2]) {
      expect(
        chooseBudget({
          viewportWidth: 1440,
          coarsePointer: false,
          devicePixelRatio,
        }).pixelRatio,
      ).toBe(1);
    }
  });

  it("keeps the compact wave as wide as the full one", () => {
    const span = (b: { gridWidth: number; spacing: number }) =>
      b.gridWidth * b.spacing;
    expect(span(COMPACT_BUDGET)).toBeCloseTo(span(FULL_BUDGET));
  });
});

describe("scene layout", () => {
  it("is deterministic for a seed", () => {
    expect(panelInstances(5)).toEqual(panelInstances(5));
    expect(dustPoints(5)).toEqual(dustPoints(5));
    const a = seededRandom(9);
    const b = seededRandom(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("sizes every buffer from the budget", () => {
    const budget = chooseBudget({
      viewportWidth: 390,
      coarsePointer: true,
      devicePixelRatio: 3,
    });
    expect(waveGrid(budget)).toHaveLength(
      budget.gridWidth * budget.gridDepth * 2,
    );
    expect(panelInstances(budget.panels)).toHaveLength(
      budget.panels * PANEL_STRIDE,
    );
    expect(dustPoints(budget.dust)).toHaveLength(budget.dust * 3);
  });

  it("keeps panels inside the design's ranges", () => {
    const data = panelInstances(200);
    for (let k = 0; k < 200; k++) {
      const o = k * PANEL_STRIDE;
      expect(data[o + 1]).toBeLessThanOrEqual(0);
      expect(data[o + 1]).toBeGreaterThanOrEqual(-30);
      expect(data[o + 3]).toBeGreaterThanOrEqual(0.6);
      expect(data[o + 3]).toBeLessThanOrEqual(1.4);
      expect(data[o + 6]).toBeGreaterThanOrEqual(0.6);
      expect(data[o + 6]).toBeLessThanOrEqual(1.7);
    }
  });
});
