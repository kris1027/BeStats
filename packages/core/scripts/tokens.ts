import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * `pnpm tokens`: copies the design tokens out of the web's `app/globals.css`
 * into `src/tokens.generated.ts`, so the Expo app styles itself from the same
 * values (spec 0034, Design tokens). `globals.css` stays the one place a
 * colour is written (AGENTS.md, Commands and repo facts); this file is
 * generated, never edited, and `src/tokens.test.ts` fails when it is stale.
 *
 * Only the `@theme inline`, `@theme` and top level `:root` blocks are read.
 * The media query overrides (reduced transparency, no `backdrop-filter`) and
 * the `@utility` rules are web behaviour, not tokens; mobile rebuilds the
 * plate rule natively.
 */

/**
 * The web stylesheet that owns every colour (AGENTS.md, Commands and repo
 * facts), resolved from this file so the script and its test run from any
 * working directory.
 */
export const GLOBALS_CSS = fileURLToPath(
  new URL("../../../apps/web/app/globals.css", import.meta.url),
);
/**
 * The one generated copy of the tokens that the mobile app reads, kept in core
 * because core is the only package both apps share (packages/core/AGENTS.md).
 */
export const TOKENS_FILE = fileURLToPath(
  new URL("../src/tokens.generated.ts", import.meta.url),
);

/** The custom properties declared directly inside the first matching block. */
function block(css: string, opener: RegExp): [string, string][] {
  const start = css.search(opener);
  if (start < 0) throw new Error(`globals.css has no ${opener} block`);
  const open = css.indexOf("{", start);
  // Match the brace that closes this block, so a nested rule cannot cut the
  // token list short; only declarations at the block's own depth are kept.
  let depth = 0;
  let body = "";
  let close = open;
  for (; close < css.length; close++) {
    const char = css[close];
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) break;
    else if (depth === 1) body += char;
  }
  if (depth !== 0)
    throw new Error(`globals.css has an unclosed ${opener} block`);
  return [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].replace(/\s+/g, " ").trim(),
  ]);
}

/**
 * Every token by name (without the leading `--`), with a value that is only a
 * `var(--name)` reference replaced by what it points at, so a colour reads as
 * the colour rather than as another name. Mobile has no CSS variables to
 * follow a reference at runtime, so it needs the final value (AGENTS.md,
 * Commands and repo facts).
 */
export function readTokens(css: string): Record<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const entries = [
    ...block(source, /:root\s*\{/),
    ...block(source, /@theme\s+inline\s*\{/),
    ...block(source, /@theme\s*\{/),
  ];
  const raw = Object.fromEntries(entries);
  const resolve = (value: string, depth = 0): string => {
    const ref = /^var\(--([a-z0-9-]+)\)$/.exec(value);
    if (!ref || depth > 8 || !(ref[1] in raw)) return value;
    return resolve(raw[ref[1]], depth + 1);
  };
  return Object.fromEntries(
    Object.keys(raw)
      .sort()
      .map((name) => [name, resolve(raw[name])]),
  );
}

/** A gradient a glass utility paints: its CSS angle and its stops. */
export type GlassGradient = {
  angle: number;
  stops: { color: string; at: number }[];
};

/**
 * The utilities whose first gradient the app redraws natively: the glass
 * sheen, the selected sheen (white, and the personal cyan tab's) and the two rims
 * (prompts/mobile-web-parity-foundation.md, decision 5). They live in
 * `@utility` rules rather than tokens, so they are read from there and
 * `globals.css` stays the one place they are written.
 */
export const GLASS_UTILITIES = [
  "glass",
  "glass-selected",
  "glass-selected-personal",
  "glass-rim",
  "glass-rim-score",
] as const;

/** The body of `@utility name { ... }`, braces balanced. */
function utilityBody(css: string, name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  if (start < 0) throw new Error(`globals.css has no @utility ${name}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`globals.css has an unclosed @utility ${name}`);
}

/** `text` split on the commas outside any parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The text inside the parentheses that open at `open`, balanced. */
function insideParens(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unbalanced parentheses in ${text}`);
}

type Rgba = { r: number; g: number; b: number; a: number };

/**
 * A stop colour as straight RGBA: `rgb()`, hex, `white`, `transparent`, a
 * `var()` of a token, or an sRGB `color-mix()` of those (premultiplied, as
 * CSS mixes). The selected personal tab tints its sheen from the score cyan
 * with `color-mix`, so this is how its stops reach the app without the app
 * restating a percentage (prompts/mobile-web-parity-foundation.md, decision
 * 12 and requirement 3).
 */
function parseColor(value: string, tokens: Record<string, string>): Rgba {
  const text = value.trim();
  if (text === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(text);
  if (ref) {
    if (!(ref[1] in tokens)) throw new Error(`unknown token --${ref[1]}`);
    return parseColor(tokens[ref[1]], tokens);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb =
    /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(
      text,
    );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  if (text.startsWith("color-mix(")) {
    const [space, first, second] = splitTopLevel(
      insideParens(text, text.indexOf("(")),
    );
    if (space !== "in srgb") throw new Error(`only srgb mixes: ${text}`);
    const part = (arg: string) => {
      const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(arg.trim());
      if (!m) throw new Error(`bad color-mix argument ${arg}`);
      return {
        color: parseColor(m[1], tokens),
        weight: m[2] === undefined ? null : Number(m[2]) / 100,
      };
    };
    const one = part(first);
    const two = part(second);
    const w1 = one.weight ?? 1 - (two.weight ?? 0.5);
    const w2 = two.weight ?? 1 - w1;
    const a = one.color.a * w1 + two.color.a * w2;
    const channel = (key: "r" | "g" | "b") =>
      a === 0
        ? 0
        : (one.color[key] * one.color.a * w1 +
            two.color[key] * two.color.a * w2) /
          a;
    return { r: channel("r"), g: channel("g"), b: channel("b"), a };
  }
  throw new Error(`unsupported colour ${text}`);
}

/** RGBA in the `rgb(r g b / a)` form the other stops are written in. */
function rgbaCss({ r, g, b, a }: Rgba): string {
  const alpha = Math.round(a * 1000) / 1000;
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${alpha})`;
}

/** The first `linear-gradient` in a utility, its angle and its stops. */
export function readGradient(css: string, name: string): GlassGradient {
  const body = utilityBody(css.replace(/\/\*[\s\S]*?\*\//g, ""), name);
  const start = body.indexOf("linear-gradient(");
  if (start < 0) throw new Error(`@utility ${name} has no angled gradient`);
  const [angle, ...rest] = splitTopLevel(
    insideParens(body, start + "linear-gradient".length),
  );
  const degrees = /^(\d+)deg$/.exec(angle);
  if (!degrees) throw new Error(`@utility ${name} has no angled gradient`);
  let tokens: Record<string, string> | undefined;
  const tokenValues = () => {
    tokens ??= readTokens(css);
    return tokens;
  };
  const stops = rest.map((stop) => {
    const m = /^([\s\S]*\S)\s+([\d.]+)%$/.exec(stop.replace(/\s+/g, " "));
    if (!m) throw new Error(`@utility ${name} has a stop with no position`);
    const color = m[1].startsWith("rgb(")
      ? m[1]
      : rgbaCss(parseColor(m[1], tokenValues()));
    return { color, at: Number(m[2]) / 100 };
  });
  if (stops.length < 2) throw new Error(`@utility ${name} has no stops`);
  return { angle: Number(degrees[1]), stops };
}

/** `glass-shadow`'s offset, blur and colour, for React Native's `boxShadow`. */
export function readShadow(css: string): string {
  const match = /box-shadow:\s*([^;]+);/.exec(utilityBody(css, "glass-shadow"));
  if (!match) throw new Error("@utility glass-shadow has no box-shadow");
  return match[1].trim();
}

/**
 * An `oklch(L C H)` colour as sRGB hex, or null when the value is not one.
 * React Native cannot draw oklch, so the page background's colours reach the
 * app as this conversion, still derived from `globals.css` rather than
 * written by hand (AGENTS.md, Commands and repo facts, the token rule). The
 * maths is Björn Ottosson's OKLab to linear sRGB, then the sRGB transfer
 * curve, clamped to the gamut.
 */
export function oklchToHex(value: string): string | null {
  const match =
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/.exec(value);
  if (!match) return null;
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const chroma = Number(match[3]);
  const hue = (Number(match[4]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((channel) => {
      const c = Math.min(1, Math.max(0, channel));
      const encoded =
        c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/**
 * The generated module's full text for the given stylesheet. It is a pure
 * string so `src/tokens.test.ts` can rebuild it in memory and fail on drift
 * without writing to disk, which is how CI keeps the one copy honest
 * (AGENTS.md, Commands and repo facts).
 */
export function renderTokens(css: string): string {
  const tokens = readTokens(css);
  const lines = Object.entries(tokens).map(
    ([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)},`,
  );
  const srgb = Object.entries(tokens).flatMap(([name, value]) => {
    const hex = oklchToHex(value);
    return hex ? [`  ${JSON.stringify(name)}: ${JSON.stringify(hex)},`] : [];
  });
  return [
    "// Generated by `pnpm tokens` from apps/web/app/globals.css. Do not edit.",
    "// spec 0034, Design tokens: globals.css stays the single source.",
    "",
    "export const TOKENS = {",
    ...lines,
    "} as const;",
    "",
    "export type TokenName = keyof typeof TOKENS;",
    "",
    "// The oklch tokens as sRGB hex, for React Native, which cannot draw oklch.",
    "export const TOKENS_SRGB = {",
    ...srgb,
    "} as const;",
    "",
    "// The glass utilities' gradients and shadow, redrawn natively by the app.",
    `export const GLASS = ${JSON.stringify(
      {
        gradients: Object.fromEntries(
          GLASS_UTILITIES.map((name) => [name, readGradient(css, name)]),
        ),
        shadow: readShadow(css),
      },
      null,
      2,
    )} as const;`,
    "",
  ].join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  writeFileSync(TOKENS_FILE, renderTokens(readFileSync(GLOBALS_CSS, "utf8")));
  console.log(`Wrote ${TOKENS_FILE}`);
}
