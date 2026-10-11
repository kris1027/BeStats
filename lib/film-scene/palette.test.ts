import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  channelsFromComputed,
  peakLuminance,
  relativeLuminance,
  SCENE_TOKENS,
  TEXT_CONTRAST,
} from "./palette";

const CSS = readFileSync("app/globals.css", "utf8");

/** The hex value a token is declared with in globals.css. */
function declared(token: string): [number, number, number] {
  const match = CSS.match(new RegExp(`${token}:\\s*#([0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`${token} is not a hex token`);
  const hex = match[1];
  return [0, 2, 4].map(
    (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
  ) as [number, number, number];
}

/** covers: prompts/film-strip-background.md, AC-3 */
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

describe("scene tokens", () => {
  it("are all declared in globals.css", () => {
    for (const token of Object.values(SCENE_TOKENS)) {
      expect(CSS).toMatch(new RegExp(`${token}:`));
    }
  });

  it("no longer borrow the personal score cyan", () => {
    expect(Object.values(SCENE_TOKENS)).not.toContain("--color-score-personal");
  });
});

/** covers: prompts/film-strip-background.md, AC-11 */
describe("peakLuminance", () => {
  const contrast = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const muted = declared("--muted-foreground");

  it("keeps the muted text at 4.5:1 over the brightest allowed pixel", () => {
    const text = relativeLuminance(muted);
    expect(contrast(text, peakLuminance(muted))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    );
  });

  it("leaves room above the gradient's brightest colour for the bokeh", () => {
    expect(relativeLuminance(declared("--color-backdrop-glow"))).toBeLessThan(
      peakLuminance(muted),
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
