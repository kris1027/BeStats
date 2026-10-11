import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BACKDROP_TOKENS,
  channelsFromComputed,
  peakLuminance,
  relativeLuminance,
  TEXT_CONTRAST,
} from "./colors";

/** covers: prompts/ambient-background.md, AC-2 */
describe("channelsFromComputed", () => {
  // Computed colours arrive in function notation; only the numbers inside
  // are read, so the fixtures here are the numbers alone.
  it("reads three channels from 0 to 255 as 0 to 1", () => {
    expect(channelsFromComputed("80, 198, 229")).toEqual([
      80 / 255,
      198 / 255,
      229 / 255,
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

describe("backdrop tokens", () => {
  it("lights the scene with the personal score cyan", () => {
    expect(BACKDROP_TOKENS.accent).toBe("--color-score-personal");
  });

  it("are all declared in globals.css", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const token of Object.values(BACKDROP_TOKENS)) {
      expect(css).toMatch(new RegExp(`${token}:`));
    }
  });
});

/** covers: prompts/ambient-background.md, AC-10 */
describe("peakLuminance", () => {
  const contrast = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  it("keeps the muted text at 4.5:1 over the brightest allowed pixel", () => {
    // The `--muted-foreground` value, as the computed style delivers it.
    const muted = channelsFromComputed("168, 173, 188");
    if (!muted) throw new Error("fixture");
    const text = relativeLuminance(muted);
    expect(contrast(text, peakLuminance(muted))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    );
  });

  it("allows no light at all behind text too dark to reach 4.5:1 on black", () => {
    expect(peakLuminance([0.3, 0.3, 0.3])).toBe(0);
  });

  it("measures black and white as WCAG does", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1);
  });
});
