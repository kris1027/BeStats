import {
  channelsFromComputed,
  type Rgb,
  relativeLuminance,
  TEXT_CONTRAST,
} from "@/lib/color/contrast";

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
