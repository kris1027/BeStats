import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  channelsFromHex,
  channelsFromOklch,
  contrastRatio,
  type Rgb,
  relativeLuminance,
  TEXT_CONTRAST,
} from "@/lib/color/contrast";

/**
 * covers: prompts/warm-page-background.md, AC-6
 *
 * Text sits straight on the page background, and the frosted plates are
 * proved over its brightest pixel (`app/glass-contrast.test.ts`, `PEAK`).
 * The background is plain CSS layers, so nothing caps a pixel at runtime;
 * this file is the cap. It stacks the worst case the layers can reach,
 * every value read from `globals.css`, and holds `--muted-foreground` at
 * 4.5:1 over it.
 *
 * The worst case: the gradient's brightest stop, the brightest mix of blobs
 * (they drift, so any of them can overlap), a stripe, the wash, the grain at
 * its brightest noise, then a landing glow and orb on top, which move at two
 * depths and do cross. The vignette is left out: it only darkens, and is
 * clear across the middle of the screen.
 */

const CSS = readFileSync("app/globals.css", "utf8");

/** A colour token's value, written as a hex or in OKLCH. */
function rgbOf(token: string): Rgb {
  const value = CSS.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1] ?? "";
  const channels = channelsFromHex(value) ?? channelsFromOklch(value);
  if (!channels) throw new Error(`${token} is not a readable colour`);
  return channels;
}

/** A `--page-*-alpha` strength as 0 to 1. */
function alpha(token: string): number {
  const match = CSS.match(new RegExp(`${token}:\\s*([\\d.]+)%`));
  if (!match) throw new Error(`${token} is not a percentage`);
  return Number(match[1]) / 100;
}

/** The body of an `@utility` block. */
function utility(name: string): string {
  const start = CSS.indexOf(`@utility ${name} {`);
  if (start === -1) throw new Error(`@utility ${name} is missing`);
  return CSS.slice(start, CSS.indexOf("\n}", start));
}

function over(top: Rgb, a: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * a + bottom[i] * (1 - a)) as Rgb;
}

/** The overlay blend at its brightest source, white, at `a` opacity. */
function brightestOverlay(a: number, bottom: Rgb): Rgb {
  return bottom.map((b) => {
    const blended = b <= 0.5 ? 2 * b : 1;
    return b + a * (blended - b);
  }) as Rgb;
}

const BLOBS = ["red", "amber", "deep"].map((name) => ({
  rgb: rgbOf(`--color-page-blob-${name}`),
  alpha: alpha(`--page-blob-${name}-alpha`),
}));

/** Every combination of blobs, in paint order, none included. */
const BLOB_MIXES = Array.from({ length: 2 ** BLOBS.length }, (_, mask) =>
  BLOBS.filter((_, i) => mask & (1 << i)),
);

const STOPS = ["--color-page-top", "--color-page-mid", "--color-page-deep"].map(
  rgbOf,
);

function stack(stop: Rgb, blobs: typeof BLOBS): Rgb {
  let pixel = stop;
  for (const blob of blobs) pixel = over(blob.rgb, blob.alpha, pixel);
  pixel = over(
    rgbOf("--color-page-stripe"),
    alpha("--page-stripe-alpha"),
    pixel,
  );
  pixel = over(rgbOf("--color-page-wash"), alpha("--page-wash-alpha"), pixel);
  pixel = brightestOverlay(alpha("--page-grain-alpha"), pixel);
  pixel = over(rgbOf("--color-page-glow"), alpha("--page-glow-alpha"), pixel);
  return over(rgbOf("--color-page-orb"), alpha("--page-orb-alpha"), pixel);
}

const WORST = STOPS.flatMap((stop) =>
  BLOB_MIXES.map((blobs) => stack(stop, blobs)),
).reduce((a, b) => (relativeLuminance(b) > relativeLuminance(a) ? b : a));

describe("page background contrast", () => {
  it("keeps muted text at 4.5:1 over the brightest pixel the layers reach", () => {
    expect(
      contrastRatio(rgbOf("--muted-foreground"), WORST),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("draws every layer at the strength this file checks", () => {
    for (const [name, tokens] of [
      ["page-blob-red", ["--color-page-blob-red", "--page-blob-red-alpha"]],
      [
        "page-blob-amber",
        ["--color-page-blob-amber", "--page-blob-amber-alpha"],
      ],
      ["page-blob-deep", ["--color-page-blob-deep", "--page-blob-deep-alpha"]],
      ["page-stripes", ["--color-page-stripe", "--page-stripe-alpha"]],
      ["page-wash", ["--color-page-wash", "--page-wash-alpha"]],
      ["page-grain", ["--page-grain-alpha"]],
      ["landing-blob", ["--color-page-glow", "--page-glow-alpha"]],
      ["landing-orb", ["--color-page-orb", "--page-orb-alpha"]],
    ] as const) {
      for (const token of tokens) {
        expect(utility(name), `${name} uses ${token}`).toContain(
          `var(${token})`,
        );
      }
    }
  });
});
