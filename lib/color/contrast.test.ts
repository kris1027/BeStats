import { describe, expect, it } from "vitest";

import {
  channelsFromComputed,
  channelsFromHex,
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
