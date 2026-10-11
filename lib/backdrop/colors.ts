/** An sRGB colour as three channels from 0 to 1. */
export type Rgb = [number, number, number];

/**
 * The colours the scene is lit with, read from `globals.css` tokens by the
 * page (prompts/ambient-background.md, decision 8), never written in a shader.
 */
export interface BackdropColors {
  accent: Rgb;
  background: Rgb;
  wave: Rgb;
  dust: Rgb;
  /** The muted body text the scene must stay legible under (AC-10). */
  text: Rgb;
}

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
  text: "--muted-foreground",
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
  const text = read(BACKDROP_TOKENS.text);
  probe.style.color = previous;
  if (!accent || !background || !wave || !dust || !text) return null;
  return { accent, background, wave, dust, text };
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The minimum contrast AC-10 asks of muted text over the background. */
export const TEXT_CONTRAST = 4.5;

/**
 * Keeps the shader's estimate under the true ceiling: it approximates the
 * sRGB curve with a 2.2 power, and output is rounded to 8 bits.
 */
const PEAK_MARGIN = 0.85;

/**
 * The brightest relative luminance any background pixel may reach while
 * `text` keeps 4.5:1 over it (prompts/ambient-background.md, AC-10). Every
 * layer's fragments are capped to this in the shaders and combined with
 * `MAX` blending, so overlapping points cannot add up past it either. Read
 * from the token, so a lighter or darker muted text moves the cap with it.
 */
export function peakLuminance(text: Rgb): number {
  const ceiling = (relativeLuminance(text) + 0.05) / TEXT_CONTRAST - 0.05;
  return Math.max(0, ceiling * PEAK_MARGIN);
}
