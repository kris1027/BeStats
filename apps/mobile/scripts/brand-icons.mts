import { fileURLToPath } from "node:url";

import { brandMarkSvg, SPLASH_IMAGE_POINTS } from "@bestats/core/brand/mark";
import { TOKENS } from "@bestats/core/tokens.generated";
import sharp from "sharp";

/**
 * `pnpm --filter @bestats/mobile brand-icons`: renders every icon and splash
 * PNG `app.json` names from the one mark in `@bestats/core/brand/mark`, in
 * the `color-background` and `color-brand-mark` tokens, so the icon, the
 * splash and the launch animation share one geometry and no colour is
 * written here (prompts/mobile-app-icon-launch.md, decisions 4 and 5).
 * The PNGs are committed; rerun this after changing the mark or a token.
 */

const IMAGES = new URL("../assets/images/", import.meta.url);
const ground = TOKENS["color-background"];
const mark = TOKENS["color-brand-mark"];

/** Each output: file name, pixel size and what it draws. */
const OUTPUTS = [
  // iOS refuses an icon with an alpha channel, so it is flattened opaque.
  {
    file: "icon.png",
    size: 1024,
    variant: "icon",
    background: ground,
    opaque: true,
  },
  { file: "android-icon-foreground.png", size: 512, variant: "adaptive" },
  {
    file: "android-icon-background.png",
    size: 512,
    variant: "adaptive",
    background: ground,
    bare: true,
  },
  { file: "android-icon-monochrome.png", size: 432, variant: "adaptive" },
  // Three times the splash's point size, the largest density either OS asks for.
  { file: "splash-icon.png", size: SPLASH_IMAGE_POINTS * 3, variant: "splash" },
] as const;

for (const out of OUTPUTS) {
  const svg =
    "bare" in out
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${out.size}" height="${out.size}"><rect width="100%" height="100%" fill="${out.background}"/></svg>`
      : brandMarkSvg({
          size: out.size,
          mark,
          background: "background" in out ? out.background : undefined,
          variant: out.variant,
        });
  let image = sharp(Buffer.from(svg));
  if ("opaque" in out)
    image = image.flatten({ background: ground }).removeAlpha();
  const path = fileURLToPath(new URL(out.file, IMAGES));
  await image.png({ compressionLevel: 9 }).toFile(path);
  console.log(`Wrote ${path}`);
}
