import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  channelsFromComputed,
  channelsFromHex,
  contrastRatio as contrast,
  type Rgb,
  relativeLuminance,
  TEXT_CONTRAST,
} from "@/lib/color/contrast";

/**
 * covers: prompts/frosted-glass.md, AC-3
 *
 * The frosted plates trade opacity for legibility, and the trade is only
 * safe at the values this file checks. Every number is read from
 * `globals.css` (and the dimming backdrop from the components that draw it),
 * so lowering a frost value, brightening the sheen or darkening a text token
 * fails here rather than on someone's screen.
 *
 * Composited in gamma encoded sRGB, the way browsers blend: the glass
 * gradient's stops over the plate at its frost opacity over the worst pixel
 * that can sit behind that surface.
 */

const CSS = readFileSync("app/globals.css", "utf8");

/** The hex value a token is declared with in globals.css. */
function hex(token: string): Rgb {
  const match = CSS.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
  const channels = match && channelsFromHex(match[1]);
  if (!channels) throw new Error(`${token} is not a hex token`);
  return channels;
}

/** The first declaration of a percentage token, the one `:root` sets. */
function percent(token: string): number {
  const match = CSS.match(new RegExp(`${token}:\\s*(\\d+)%`));
  if (!match) throw new Error(`${token} is not a percentage`);
  return Number(match[1]) / 100;
}

/** The colour and alpha of each stop in a utility's first gradient. */
function stops(utility: string): { color: Rgb; alpha: number }[] {
  const start = CSS.indexOf(`@utility ${utility} {`);
  const block = CSS.slice(start, CSS.indexOf("padding-box", start));
  return [...block.matchAll(/rgb\(([\d ]+) \/ ([\d.]+)\)/g)].map(
    ([, channels, alpha]) => {
      const color = channelsFromComputed(channels);
      if (!color) throw new Error(`${utility} has an unreadable stop`);
      return { color, alpha: Number(alpha) };
    },
  );
}

function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** The sRGB grey whose relative luminance is `target`. */
function greyOf(target: number): Rgb {
  const linear = target;
  const c =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return [c, c, c];
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];

/**
 * The background's brightest pixel. The scene caps every fragment so muted
 * text keeps 4.5:1 over it (`peakLuminance`, which also shaves a safety
 * margin); this uses the uncapped ceiling, the stricter case.
 */
const PEAK = greyOf(
  (relativeLuminance(hex("--muted-foreground")) + 0.05) / TEXT_CONTRAST - 0.05,
);

/** White behind the dialog and menu sheet's dimming backdrop. */
const DIMMED_WHITE = (() => {
  const dims = [
    "components/ui/dialog.tsx",
    "components/layout/mobile-menu-sheet.tsx",
  ].map((path) => {
    const match = readFileSync(path, "utf8").match(/bg-background\/(\d+)/);
    if (!match) throw new Error(`${path} lost its dimming backdrop`);
    return Number(match[1]) / 100;
  });
  return over(BLACK, Math.min(...dims), WHITE);
})();

/** Every text colour a frosted surface carries. */
const TEXT = {
  foreground: hex("--foreground"),
  secondary: hex("--color-text-secondary"),
  label: hex("--color-text-label"),
  link: hex("--color-text-link"),
  muted: hex("--muted-foreground"),
  destructive: hex("--destructive"),
};

const ROLES = [
  {
    role: "control",
    plate: "--color-glass-plate",
    frost: "--frost-control",
    behind: PEAK,
    text: TEXT,
  },
  {
    role: "panel",
    plate: "--color-glass-plate-panel",
    frost: "--frost-panel",
    behind: PEAK,
    text: TEXT,
  },
  {
    role: "sheet",
    plate: "--color-glass-plate-sheet",
    frost: "--frost-sheet",
    behind: DIMMED_WHITE,
    text: TEXT,
  },
  {
    role: "float",
    plate: "--color-glass-plate-sheet",
    frost: "--frost-float",
    behind: WHITE,
    text: TEXT,
  },
  {
    role: "score",
    plate: "--color-glass-plate-score",
    frost: "--frost-score",
    behind: PEAK,
    text: {
      personal: hex("--color-score-personal"),
      foreground: TEXT.foreground,
    },
  },
] as const;

/** The weakest contrast of any text on the surface, at any gradient stop. */
function weakest(
  plate: Rgb,
  opacity: number,
  behind: Rgb,
  text: Record<string, Rgb>,
  gradient = stops("glass"),
): number {
  const base = over(plate, opacity, behind);
  return Math.min(
    ...gradient.flatMap(({ color, alpha }) =>
      Object.values(text).map((t) => contrast(t, over(color, alpha, base))),
    ),
  );
}

describe("frosted plates keep AA text (prompts/frosted-glass.md)", () => {
  for (const { role, plate, frost, behind, text } of ROLES) {
    it(`keeps every ${role} text colour at 4.5:1 over its worst background`, () => {
      expect(
        weakest(hex(plate), percent(frost), behind, text),
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    });
  }

  it("keeps near white text at 4.5:1 on a selected surface, whose plate stays solid", () => {
    const selected = weakest(
      hex("--color-glass-plate"),
      1,
      BLACK,
      {
        foreground: TEXT.foreground,
      },
      stops("glass-selected"),
    );
    expect(selected).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("keeps the selected tab's dark text at 4.5:1 on its darkest stop", () => {
    const cyan = over(
      hex("--color-score-personal"),
      0.8,
      hex("--color-glass-plate"),
    );
    expect(
      contrast(hex("--color-text-on-personal"), cyan),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it("turns every plate solid and stops the blur in each fallback", () => {
    const fallbacks = [
      "@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)",
      "@supports not (",
    ];
    for (const opening of fallbacks) {
      const start = CSS.indexOf(opening);
      expect(start, opening).toBeGreaterThan(-1);
      const block = CSS.slice(start, CSS.indexOf("}\n}", start));
      for (const { frost } of ROLES) {
        expect(block).toContain(`${frost}: 100%;`);
      }
      for (const blur of ["control", "panel", "overlay"]) {
        expect(block).toContain(`--frost-blur-${blur}: none;`);
      }
    }
  });
});
