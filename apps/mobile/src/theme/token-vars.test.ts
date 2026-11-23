import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fractionToken,
  lengthToken,
  TOKEN_VARS,
  tokenColor,
  tokenColorAlpha,
  tokenColorOver,
} from "./token-vars";

/**
 * covers: spec 0034, Design tokens (the app holds no colour of its own)
 *
 * `global.css` names each colour token and `TOKEN_VARS` supplies its value at
 * runtime; a token added on the web must reach both, or a class would point at
 * a variable nobody sets.
 */
test("global.css names exactly the colour tokens TOKEN_VARS supplies", () => {
  const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");
  const named = [...css.matchAll(/--(color-[a-z0-9-]+): var\(--bs-\1\);/g)].map(
    (match) => `--bs-${match[1]}`,
  );
  expect(named.length).toBeGreaterThan(0);
  const colours = Object.keys(TOKEN_VARS).filter((name) =>
    name.startsWith("--bs-color-"),
  );
  expect(new Set(named)).toEqual(new Set(colours));
});

test("no oklch value reaches React Native, which cannot draw it", () => {
  for (const value of Object.values(TOKEN_VARS)) {
    expect(value).not.toContain("oklch");
  }
});

test("global.css names every radius token TOKEN_VARS supplies", () => {
  const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");
  const named = [...css.matchAll(/--(radius[a-z0-9-]*): var\(--bs-\1\);/g)].map(
    (match) => `--bs-${match[1]}`,
  );
  const radii = Object.keys(TOKEN_VARS).filter((name) =>
    name.startsWith("--bs-radius"),
  );
  expect(radii.length).toBeGreaterThan(0);
  expect(new Set(named)).toEqual(new Set(radii));
});

test("the radius scale follows the web's calc() steps", () => {
  expect(lengthToken("radius")).toBe(12);
  expect(lengthToken("radius-2xl")).toBeCloseTo(21.6);
  expect(lengthToken("radius-panel")).toBe(24);
  expect(TOKEN_VARS["--bs-radius-panel"]).toBe("24px");
});

test("percentages and alpha colours read from the tokens", () => {
  expect(fractionToken("frost-panel")).toBeCloseTo(0.6);
  expect(tokenColorAlpha("color-page-top", 0.5)).toMatch(/^.{7}80$/);
});

test("a token over another flattens to the mix, ends included", () => {
  expect(tokenColorOver("color-page-top", "color-page-wash", 0)).toBe(
    tokenColor("color-page-top"),
  );
  expect(tokenColorOver("color-page-top", "color-page-wash", 1)).toBe(
    tokenColor("color-page-wash"),
  );
  expect(tokenColorOver("color-page-top", "color-page-wash", 0.6)).toMatch(
    /^#[0-9a-f]{6}$/,
  );
});
