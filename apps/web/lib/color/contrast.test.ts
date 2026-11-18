import { describe, expect, it } from "vitest";

import {
  channelsFromComputed,
  channelsFromHex,
  channelsFromOklch,
  contrastRatio,
  relativeLuminance,
} from "./contrast";

describe("channelsFromComputed", () => {
  it("reads three channels from 0 to 255 as 0 to 1", () => {
    expect(channelsFromComputed("14, 106, 128")).toEqual([
      14 / 255,
      106 / 255,
      128 / 255,
    ]);
  });

  it("ignores an alpha channel", () => {
    expect(channelsFromComputed("0 0 0 / 0.5")).toEqual([0, 0, 0]);
  });

  it("rejects fewer than three channels or values out of range", () => {
    expect(channelsFromComputed("")).toBeNull();
    expect(channelsFromComputed("12, 40")).toBeNull();
    expect(channelsFromComputed("300, 0, 0")).toBeNull();
  });
});

// Written without the hash: a colour literal anywhere but globals.css fails
// design-tokens-boundary.test.ts, and the token tests read hashed values.
describe("channelsFromHex", () => {
  it("reads a six digit hex colour", () => {
    expect(channelsFromHex("0e6a80")).toEqual([14 / 255, 106 / 255, 128 / 255]);
    expect(channelsFromHex("FFFFFF")).toEqual([1, 1, 1]);
  });

  it("rejects anything else", () => {
    expect(channelsFromHex("fff")).toBeNull();
    expect(channelsFromHex("0 0 0")).toBeNull();
  });
});

// Written as the bare numbers, for the same reason as the hex values above.
describe("channelsFromOklch", () => {
  it("reads white, black and a mid grey", () => {
    const white = channelsFromOklch("1 0 0");
    const black = channelsFromOklch("0 0 0");
    expect(white?.map((c) => c.toFixed(3))).toEqual([
      "1.000",
      "1.000",
      "1.000",
    ]);
    expect(black).toEqual([0, 0, 0]);
    const grey = channelsFromOklch("0.5 0 0");
    expect(grey?.[0]).toBeCloseTo(grey?.[1] ?? 0, 5);
    expect(grey?.[0]).toBeCloseTo(0.389, 2);
  });

  it("reads a saturated red as red, ignoring an alpha", () => {
    const red = channelsFromOklch("0.628 0.2577 29.23 / 50%");
    expect(red?.[0]).toBeCloseTo(1, 2);
    expect(red?.[1]).toBeCloseTo(0, 2);
    expect(red?.[2]).toBeCloseTo(0, 2);
  });

  it("clamps a colour outside sRGB", () => {
    const vivid = channelsFromOklch("0.7 0.4 140");
    for (const c of vivid ?? []) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("rejects anything else", () => {
    expect(channelsFromOklch("")).toBeNull();
    expect(channelsFromOklch("0.5 0.1")).toBeNull();
  });
});

describe("WCAG contrast", () => {
  it("measures black and white as WCAG does", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1);
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21);
  });

  it("is the same whichever colour comes first", () => {
    const grey: [number, number, number] = [0.5, 0.5, 0.5];
    expect(contrastRatio(grey, [0, 0, 0])).toBe(contrastRatio([0, 0, 0], grey));
  });
});
