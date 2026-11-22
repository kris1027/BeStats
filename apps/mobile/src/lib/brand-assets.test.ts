import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SPLASH_IMAGE_POINTS } from "@bestats/core/brand/mark";
import { TOKENS } from "@bestats/core/tokens.generated";

import appJson from "../../app.json";

/**
 * prompts/mobile-app-icon-launch.md, decisions 4 to 6: `pnpm brand-icons`
 * renders every icon and splash PNG `app.json` names, `app.json` (a file the
 * colour boundary does not scan) holds the black ground the tokens define,
 * and the splash's `imageWidth` is the size the launch overlay draws the
 * bars at, so the native splash hands over without a jump.
 */

const asset = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)));

/** A PNG's size and colour type, from its IHDR chunk. */
function pngHeader(file: Buffer) {
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    colourType: file[25],
  };
}

const expo = appJson.expo;
const splash = expo.plugins.find(
  (
    plugin,
  ): plugin is [
    string,
    { backgroundColor: string; image: string; imageWidth: number },
  ] => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
)?.[1];

test.each([
  [expo.icon, 1024],
  [expo.android.adaptiveIcon.foregroundImage, 512],
  [expo.android.adaptiveIcon.backgroundImage, 512],
  [expo.android.adaptiveIcon.monochromeImage, 432],
  [splash?.image ?? "", SPLASH_IMAGE_POINTS * 3],
])("%s is a %i px square", (path, size) => {
  const { width, height } = pngHeader(asset(path));
  expect([width, height]).toEqual([size, size]);
});

test("the iOS icon is opaque (iOS refuses an alpha channel)", () => {
  // Colour type 2 is RGB with no alpha.
  expect(pngHeader(asset(expo.icon)).colourType).toBe(2);
});

test("the splash and adaptive grounds are the app's background token", () => {
  const ground = TOKENS["color-background"].toUpperCase();
  expect(splash?.backgroundColor.toUpperCase()).toBe(ground);
  expect(expo.android.adaptiveIcon.backgroundColor.toUpperCase()).toBe(ground);
});

test("the splash image is drawn at the overlay's bar size", () => {
  expect(splash?.imageWidth).toBe(SPLASH_IMAGE_POINTS);
});
