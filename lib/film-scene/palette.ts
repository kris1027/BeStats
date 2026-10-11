/** An sRGB colour as three channels from 0 to 1. */
export type Rgb = [number, number, number];

/**
 * The colours the scene is lit with, read from `globals.css` tokens by the
 * page (prompts/film-strip-background.md, decision 3), never written in a
 * shader. They stay sRGB values, unconverted, because the design's Three.js
 * r149 renderer did its lighting on them that way and wrote the result as is.
 */
export interface ScenePalette {
  /** The gradient's brightest colour, the most light can ever sit on. */
  glow: Rgb;
  /** The fog the distance fades into, the gradient's deep teal. */
  fog: Rgb;
  filmBase: Rgb;
  filmWindow: Rgb;
  filmShadow: Rgb;
  filmEdge: Rgb;
  filmRail: Rgb;
  filmGlow: Rgb;
  lightAmbient: Rgb;
  lightKey: Rgb;
  lightRim: Rgb;
  bokeh1: Rgb;
  bokeh2: Rgb;
  bokeh3: Rgb;
  bokeh4: Rgb;
  /** The muted body text the scene must stay legible under (AC-11). */
  text: Rgb;
}

/** The token each colour is read from, all in `app/globals.css`. */
export const SCENE_TOKENS = {
  glow: "--color-backdrop-glow",
  fog: "--color-backdrop-deep",
  filmBase: "--color-film-base",
  filmWindow: "--color-film-window",
  filmShadow: "--color-film-shadow",
  filmEdge: "--color-film-edge",
  filmRail: "--color-film-rail",
  filmGlow: "--color-film-glow",
  lightAmbient: "--color-light-ambient",
  lightKey: "--color-light-key",
  lightRim: "--color-light-rim",
  bokeh1: "--color-bokeh-1",
  bokeh2: "--color-bokeh-2",
  bokeh3: "--color-bokeh-3",
  bokeh4: "--color-bokeh-4",
  text: "--muted-foreground",
} as const satisfies Record<keyof ScenePalette, string>;

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
 * any value cannot be read, and the page then keeps its CSS gradient.
 */
export function readScenePalette(probe: HTMLElement): ScenePalette | null {
  const previous = probe.style.color;
  const palette: Partial<ScenePalette> = {};
  let complete = true;
  for (const [key, token] of Object.entries(SCENE_TOKENS)) {
    probe.style.color = `var(${token})`;
    const channels = channelsFromComputed(getComputedStyle(probe).color);
    if (!channels) complete = false;
    else palette[key as keyof ScenePalette] = channels;
  }
  probe.style.color = previous;
  return complete ? (palette as ScenePalette) : null;
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The minimum contrast AC-11 asks of muted text over the background. */
export const TEXT_CONTRAST = 4.5;

/**
 * Keeps the shader's estimate under the true ceiling: it approximates the
 * sRGB curve with a 2.2 power, and output is rounded to 8 bits.
 */
const PEAK_MARGIN = 0.85;

/**
 * The brightest relative luminance any background pixel may reach while
 * `text` keeps 4.5:1 over it (prompts/film-strip-background.md, decision 5).
 * Both shaders cap their fragments to it, the bokeh counting the gradient
 * they add onto. Read from the token, so a lighter or darker muted text
 * moves the cap with it.
 */
export function peakLuminance(text: Rgb): number {
  const ceiling = (relativeLuminance(text) + 0.05) / TEXT_CONTRAST - 0.05;
  return Math.max(0, ceiling * PEAK_MARGIN);
}
