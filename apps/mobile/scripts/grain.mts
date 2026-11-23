import { fileURLToPath } from "node:url";

import sharp from "sharp";

/**
 * `pnpm --filter @bestats/mobile grain`: renders the film grain tile the page
 * background lays over everything at `--page-grain-alpha`
 * (prompts/mobile-web-parity-foundation.md, decision 7). The web draws it
 * with an SVG `feTurbulence` filter, which React Native cannot run, so the
 * app ships this PNG instead. The noise is seeded, so a rerun writes the same
 * bytes; the tile is committed and never edited by hand.
 */

/** A little above the web's 160px tile: grain needs no extra density. */
const SIZE = 192;

/** Mulberry32: a tiny seeded generator, so the tile is reproducible. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(1027);
const pixels = Buffer.alloc(SIZE * SIZE);
for (let i = 0; i < pixels.length; i++) {
  // Two samples averaged soften the noise towards the fractal tile's grey.
  pixels[i] = Math.round(((next() + next()) / 2) * 255);
}

const out = fileURLToPath(
  new URL("../assets/images/grain.png", import.meta.url),
);
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`Wrote ${out}`);
