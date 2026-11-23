import { GLASS, type TokenName } from "@bestats/core/tokens.generated";

import { PLATE_ROLES, type PlateRole } from "@/components/glass/plate";
import { SHEET_DIM } from "@/components/score-sheet";

import { fractionToken, tokenColor } from "./token-vars";

/**
 * covers: prompts/mobile-web-parity-foundation.md, requirement 5 and AC-2
 *
 * The app's form of the web's `app/glass-contrast.test.ts`: every text
 * colour a plate carries keeps 4.5:1 over the worst pixel behind it, frosted
 * (iOS) and opaque (Android, Reduce Transparency), at every stop of the
 * sheen. Every number comes from the generated tokens and `GLASS`, so a
 * token change that breaks legibility fails here, not on a phone.
 *
 * Composited in gamma encoded sRGB, as UIKit and Skia blend.
 */
type Rgb = [number, number, number];

const AA = 4.5;

function hex(name: TokenName): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(tokenColor(name));
  if (!match) throw new Error(`${name} is not a hex colour`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as Rgb;
}

function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A gradient's stops as colour and alpha, from `GLASS`. */
function stops(name: keyof typeof GLASS.gradients) {
  return GLASS.gradients[name].stops.map(({ color }) => {
    const m = /^rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)$/.exec(color);
    if (!m) throw new Error(`${name} has an unreadable stop ${color}`);
    return {
      color: [Number(m[1]), Number(m[2]), Number(m[3])].map(
        (c) => c / 255,
      ) as Rgb,
      alpha: Number(m[4]),
    };
  });
}

const WHITE: Rgb = [1, 1, 1];

/** White artwork under the score sheet's backdrop, which dims the whole screen. */
const DIMMED_WHITE = (): Rgb => over(hex("color-background"), SHEET_DIM, WHITE);

/**
 * An upper bound on the still background's brightest pixel
 * (`components/page-background.tsx`): its brightest base stop, every blob
 * at its full centre alpha stacked on that one pixel, a stripe, then the
 * wash that covers the whole screen, then the grain at its strongest
 * (overlay of white, taken as plain white over). The vignette only darkens,
 * so leaving it out keeps the bound safe.
 */
const PEAK = (() => {
  const base = [hex("color-page-top"), hex("color-page-mid")].sort(
    (a, b) => luminance(b) - luminance(a),
  )[0];
  const blobs = (
    [
      ["color-page-blob-red", "page-blob-red-alpha"],
      ["color-page-blob-amber", "page-blob-amber-alpha"],
      ["color-page-blob-deep", "page-blob-deep-alpha"],
    ] as const
  ).reduce<Rgb>((pixel, [color, alpha]) => {
    const lit = over(hex(color), fractionToken(alpha), pixel);
    return luminance(lit) > luminance(pixel) ? lit : pixel;
  }, base);
  const striped = over(
    hex("color-page-stripe"),
    fractionToken("page-stripe-alpha"),
    blobs,
  );
  const washed = over(
    hex("color-page-wash"),
    fractionToken("page-wash-alpha"),
    striped,
  );
  return over(WHITE, fractionToken("page-grain-alpha"), washed);
})();

/** Every text colour a plate can carry. */
const TEXT: TokenName[] = [
  "color-foreground",
  "color-text-secondary",
  "color-text-label",
  "color-text-link",
  "color-muted-foreground",
  "color-destructive",
];

/**
 * What can sit behind each role. Panels and controls sit on the page; the
 * score sheet sits over screen content under its dimming backdrop, and the
 * toast over screen content, artwork included, with no dimming at all.
 */
const ROLES: { role: PlateRole; behind: Rgb; text: TokenName[] }[] = [
  { role: "control", behind: PEAK, text: TEXT },
  { role: "panel", behind: PEAK, text: TEXT },
  { role: "sheet", behind: DIMMED_WHITE(), text: TEXT },
  { role: "float", behind: WHITE, text: TEXT },
  {
    role: "score",
    behind: PEAK,
    text: ["color-score-personal", "color-foreground"],
  },
];

function weakest(
  plate: Rgb,
  opacity: number,
  behind: Rgb,
  text: TokenName[],
  sheen: keyof typeof GLASS.gradients = "glass",
): number {
  const base = over(plate, opacity, behind);
  return Math.min(
    ...stops(sheen).flatMap(({ color, alpha }) =>
      text.map((t) => contrast(hex(t), over(color, alpha, base))),
    ),
  );
}

describe("plates keep AA text over the still background", () => {
  for (const { role, behind, text } of ROLES) {
    const { color, frost } = PLATE_ROLES[role];
    it(`keeps every ${role} text colour at 4.5:1 frosted`, () => {
      expect(
        weakest(hex(color), fractionToken(frost), behind, text),
      ).toBeGreaterThanOrEqual(AA);
    });
    it(`keeps every ${role} text colour at 4.5:1 opaque`, () => {
      expect(weakest(hex(color), 1, behind, text)).toBeGreaterThanOrEqual(AA);
    });
  }

  it("keeps near white text on the selected sheen, whose plate stays solid", () => {
    expect(
      weakest(
        hex("color-glass-plate"),
        1,
        PEAK,
        ["color-foreground"],
        "glass-selected",
      ),
    ).toBeGreaterThanOrEqual(AA);
  });

  it("keeps the cyan tab's dark text at every stop of its sheen", () => {
    expect(
      weakest(
        hex("color-glass-plate"),
        1,
        PEAK,
        ["color-text-on-personal"],
        "glass-selected-personal",
      ),
    ).toBeGreaterThanOrEqual(AA);
  });

  it("bounds the background's peak below the brightest page colour", () => {
    expect(luminance(PEAK)).toBeLessThan(
      luminance(hex("color-page-blob-amber")),
    );
  });
});
