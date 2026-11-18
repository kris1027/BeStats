import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GLOBALS_CSS,
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
});
