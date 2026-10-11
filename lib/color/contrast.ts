/**
 * Colour channels and WCAG 2 contrast, shared by the film strip background
 * (its luminance cap, prompts/film-strip-background.md, decision 5) and the
 * frosted glass contrast guard (prompts/frosted-glass.md, AC-3). Pure and
 * free of `server-only`, so the scene's worker and the tests can both use it.
 */

/** An sRGB colour as three channels from 0 to 1. */
export type Rgb = [number, number, number];

/** The WCAG AA minimum for body text, which every check here holds to. */
export const TEXT_CONTRAST = 4.5;

/**
 * The channels of a CSS colour as 0 to 1. Browsers serialise a computed
 * sRGB colour as three numbers from 0 to 255 inside the function notation,
 * so the numbers are all that is read, and an alpha after them is ignored.
 * Null when there are not three of them in range.
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
 * The channels of a six digit hex colour, the way `globals.css` declares its
 * tokens, so a test can read a token's value from the file itself. Null for
 * anything else.
 */
export function channelsFromHex(value: string): Rgb | null {
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map(
    (i) => Number.parseInt(match[1].slice(i, i + 2), 16) / 255,
  );
  return [r, g, b];
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio between two colours, whichever is lighter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}
