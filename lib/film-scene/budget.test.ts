import { describe, expect, it } from "vitest";

import {
  COMPACT_BUDGET,
  chooseBudget,
  FULL_BUDGET,
  MAX_PIXEL_RATIO,
  sameGeometry,
} from "./budget";

/** covers: prompts/film-strip-background.md, AC-9 */
describe("chooseBudget", () => {
  it("gives a wide fine pointer screen the design's full scene", () => {
    const budget = chooseBudget({
      viewportWidth: 1440,
      coarsePointer: false,
      devicePixelRatio: 1,
    });
    expect(budget).toEqual({
      strips: 3,
      segments: 400,
      bokeh: 70,
      pixelRatio: 1,
    });
    expect(budget).toMatchObject(FULL_BUDGET);
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

  it("caps the pixel ratio at 1.5 and repairs a nonsense one", () => {
    for (const devicePixelRatio of [2, 3, 1.5]) {
      expect(
        chooseBudget({
          viewportWidth: 1440,
          coarsePointer: false,
          devicePixelRatio,
        }).pixelRatio,
      ).toBe(MAX_PIXEL_RATIO);
    }
    expect(
      chooseBudget({
        viewportWidth: 1440,
        coarsePointer: false,
        devicePixelRatio: 0,
      }).pixelRatio,
    ).toBe(1);
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
});
