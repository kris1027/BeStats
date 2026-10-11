import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  channelsFromHex,
  type Rgb,
  relativeLuminance,
  TEXT_CONTRAST,
} from "@/lib/color/contrast";

import { peakLuminance, SCENE_TOKENS } from "./palette";

const CSS = readFileSync("app/globals.css", "utf8");

/** The hex value a token is declared with in globals.css. */
function declared(token: string): Rgb {
  const match = CSS.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
  const channels = match && channelsFromHex(match[1]);
  if (!channels) throw new Error(`${token} is not a hex token`);
  return channels;
}

/** covers: prompts/film-strip-background.md, AC-3 */
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
  const muted = declared("--muted-foreground");

  it("keeps the muted text at 4.5:1 over the brightest allowed pixel", () => {
    const peak = peakLuminance(muted);
    const text = relativeLuminance(muted);
    expect((text + 0.05) / (peak + 0.05)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("leaves room above the gradient's brightest colour for the bokeh", () => {
    expect(relativeLuminance(declared("--color-page-glow"))).toBeLessThan(
      peakLuminance(muted),
    );
  });

  it("allows no light at all behind text too dark to reach 4.5:1 on black", () => {
    expect(peakLuminance([0.3, 0.3, 0.3])).toBe(0);
  });
});
