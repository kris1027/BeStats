import { TOKENS, TOKENS_SRGB } from "@bestats/core/tokens.generated";

/**
 * The web's colour tokens as the CSS variables `src/global.css` points its
 * `@theme` names at (spec 0034, Design tokens). The values come only from
 * `tokens.generated.ts`, the copy `pnpm tokens` writes from the web's
 * `globals.css`, so the app never holds a colour of its own. React Native
 * cannot draw oklch, so the page background's oklch tokens arrive as their
 * sRGB conversion, `TOKENS_SRGB` (prompts/mobile-web-parity-foundation.md,
 * decision 6); `token-vars.test.ts` checks `global.css` names every one.
 */
const COLOUR_VARS = (Object.keys(TOKENS) as (keyof typeof TOKENS)[])
  .filter((name) => name.startsWith("color-"))
  .map((name) => [`--bs-${name}`, tokenColor(name)]);

/** One rem in points, the web's 16px root size. */
const REM = 16;

/**
 * A web length token in points: `0.75rem`, `12px`, or the radius scale's
 * `calc(var(--radius) * 1.8)`, which React Native's CSS engine cannot follow
 * through a variable, so it is worked out here once.
 */
export function lengthToken(name: keyof typeof TOKENS): number {
  const value: string = TOKENS[name];
  const calc = /^calc\(var\(--([a-z0-9-]+)\) \* ([\d.]+)\)$/.exec(value);
  if (calc) {
    return lengthToken(calc[1] as keyof typeof TOKENS) * Number(calc[2]);
  }
  const plain = /^([\d.]+)(rem|px)$/.exec(value);
  if (!plain) throw new Error(`${name} is not a length: ${value}`);
  return Number(plain[1]) * (plain[2] === "rem" ? REM : 1);
}

/**
 * The radius scale as variables, so `rounded-lg` and `rounded-panel` are the
 * web's corners rather than Tailwind's defaults (decision 11).
 */
const RADIUS_VARS = Object.keys(TOKENS)
  .filter((name) => name.startsWith("radius"))
  .map((name) => [
    `--bs-${name}`,
    `${lengthToken(name as keyof typeof TOKENS)}px`,
  ]);

/** Every variable `global.css` reads, supplied by the root layout. */
export const TOKEN_VARS: Record<`--${string}`, string> = Object.fromEntries([
  ...COLOUR_VARS,
  ...RADIUS_VARS,
]);

/**
 * A token's raw value, for the few props that take a colour, not a class
 * (such as `placeholderTextColor`). It reads the generated copy so no colour
 * value is ever written in the app (AGENTS.md section 3; Commands and repo
 * facts, the token rule).
 */
export function tokenColor(name: keyof typeof TOKENS): string {
  return (TOKENS_SRGB as Record<string, string>)[name] ?? TOKENS[name];
}

/**
 * A percentage token (`frost-panel: 60%`, `page-wash-alpha: 60%`) as a
 * fraction, for the opacities the glass and the background draw at.
 */
export function fractionToken(name: keyof typeof TOKENS): number {
  const match = /^([\d.]+)%$/.exec(TOKENS[name]);
  if (!match) throw new Error(`${name} is not a percentage: ${TOKENS[name]}`);
  return Number(match[1]) / 100;
}

/**
 * A colour token at an opacity, as an eight digit hex (`RRGGBBAA`), for a
 * plate or a gradient stop. React Native reads that form, and building it
 * from the token keeps the app free of colour literals (AGENTS.md, the token
 * rule).
 */
export function tokenColorAlpha(
  name: keyof typeof TOKENS,
  alpha: number,
): string {
  return `${hexColor(name)}${hexByte(unit(alpha) * 255)}`;
}

/**
 * One colour token laid over another at an opacity, flattened to an opaque
 * six digit hex. A surface that cannot hold the page's layers (the native
 * header bar) takes the colour they settle to, so bar and page meet without
 * a seam (apps/mobile/AGENTS.md, Styling: screens stay transparent over the
 * page background).
 */
export function tokenColorOver(
  base: keyof typeof TOKENS,
  overlay: keyof typeof TOKENS,
  alpha: number,
): string {
  const under = channels(base);
  const over = channels(overlay);
  const a = unit(alpha);
  return `#${under
    .map((value, i) => hexByte(value * (1 - a) + (over[i] ?? 0) * a))
    .join("")}`;
}

/**
 * A colour token as `#RRGGBB`, the only form the alpha helpers can extend.
 * An oklch token with no sRGB copy, or a named colour, fails loudly here
 * rather than drawing a wrong colour.
 */
function hexColor(name: keyof typeof TOKENS): string {
  const hex = tokenColor(name);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`${name} is not a six digit hex colour: ${hex}`);
  }
  return hex;
}

/** A token's red, green and blue as 0 to 255. */
function channels(name: keyof typeof TOKENS): number[] {
  const hex = hexColor(name);
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
}

/** An opacity held to 0 to 1, so a stray value cannot wrap the hex. */
function unit(alpha: number): number {
  return Math.min(1, Math.max(0, alpha));
}

/** A 0 to 255 value as two hex digits. */
function hexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}
