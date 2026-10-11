import type { BackdropColors, Rgb } from "./renderer";

/**
 * The tokens the background is lit with, all from `app/globals.css`
 * (prompts/ambient-background.md, decision 8). The accent is the personal
 * score cyan, the colour of the selected tab and the user's own rating.
 */
export const BACKDROP_TOKENS = {
  accent: "--color-score-personal",
  background: "--background",
  wave: "--color-backdrop-wave",
  dust: "--color-backdrop-dust",
} as const satisfies Record<keyof BackdropColors, string>;

/**
 * The channels of a computed CSS colour as 0 to 1. Browsers serialise a
 * computed sRGB colour as three numbers from 0 to 255 inside the function
 * notation, so the numbers are all that is read. Null when there are not
 * three of them in range.
 */
export function channelsFromComputed(value: string): Rgb | null {
  const numbers = value
    .match(/-?\d*\.?\d+/g)
    ?.slice(0, 3)
    .map(Number);
  if (numbers?.length !== 3) return null;
  if (numbers.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return null;
  }
  const [r, g, b] = numbers.map((n) => n / 255);
  return [r, g, b];
}

/**
 * Resolves each token through the cascade on `probe`, so a token defined as
 * another token, or changed in `globals.css`, still comes through. Null when
 * a computed value cannot be read, and the page then keeps its static
 * vignette. `globals.css` declaring every token is checked by a test.
 */
export function readBackdropColors(probe: HTMLElement): BackdropColors | null {
  const previous = probe.style.color;
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return channelsFromComputed(getComputedStyle(probe).color);
  };
  const accent = read(BACKDROP_TOKENS.accent);
  const background = read(BACKDROP_TOKENS.background);
  const wave = read(BACKDROP_TOKENS.wave);
  const dust = read(BACKDROP_TOKENS.dust);
  probe.style.color = previous;
  if (!accent || !background || !wave || !dust) return null;
  return { accent, background, wave, dust };
}
