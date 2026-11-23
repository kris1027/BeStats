import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLOBALS_CSS,
  oklchToHex,
  readGradient,
  readTokens,
  renderTokens,
  TOKENS_FILE,
} from "../scripts/tokens";
import { TOKENS } from "./tokens.generated";

/**
 * spec 0034, Design tokens: `tokens.generated.ts` is a copy of the web's
 * `globals.css` tokens, so a colour changed there without `pnpm tokens` would
 * leave the phone a shade apart. CI runs this suite, which makes that drift a
 * failed check rather than a quiet difference.
 */
describe("generated design tokens", () => {
  it("match apps/web/app/globals.css (run `pnpm tokens` if this fails)", () => {
    expect(readFileSync(TOKENS_FILE, "utf8")).toBe(
      renderTokens(readFileSync(GLOBALS_CSS, "utf8")),
    );
  });

  it("carry the three meaning colours", () => {
    expect(TOKENS["color-rating-tmdb"]).toMatch(/^#/);
    expect(TOKENS["color-score-personal"]).toMatch(/^#/);
    expect(TOKENS["color-status-planned"]).toMatch(/^#/);
  });

  it("resolves a plain var() reference to its value", () => {
    const css =
      ":root { --bg: 4px; }\n@theme inline { --color-bg: var(--bg); }\n@theme { --x: 1px; }";
    expect(readTokens(css)).toEqual({
      bg: "4px",
      "color-bg": "4px",
      x: "1px",
    });
  });

  it("ignores declarations in comments and media overrides", () => {
    const css =
      ":root { /* --gone: 1; */ --a: 1; }\n@theme inline { }\n@theme { }\n@media (x) { :root { --a: 2; } }";
    expect(readTokens(css)).toEqual({ a: "1" });
  });

  it("converts oklch to sRGB hex", () => {
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
    // CSS Color 4's own example: oklch(62.8% 0.2577 29.23) is sRGB red.
    expect(oklchToHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
    expect(oklchToHex("#123456")).toBeNull();
  });

  it("gives every oklch token an sRGB copy", async () => {
    const { TOKENS_SRGB } = await import("./tokens.generated");
    const oklch = Object.entries(TOKENS)
      .filter(([, value]) => value.startsWith("oklch("))
      .map(([name]) => name);
    expect(oklch.length).toBeGreaterThan(0);
    expect(Object.keys(TOKENS_SRGB).sort()).toEqual(oklch.sort());
  });

  it("reads a glass utility's angle and stops", () => {
    const css =
      "@utility glass { background: linear-gradient( 169deg, rgb(1 2 3 / 0.5) 0%, rgb(4 5 6 / 0.1) 100% ) padding-box; }";
    expect(readGradient(css, "glass")).toEqual({
      angle: 169,
      stops: [
        { color: "rgb(1 2 3 / 0.5)", at: 0 },
        { color: "rgb(4 5 6 / 0.1)", at: 1 },
      ],
    });
  });
});
