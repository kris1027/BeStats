import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: AC-1, AC-2, AC-3, AC-4
 *
 * Spec 0004's token rules are single direction rules: a colour lives in
 * `globals.css` and nowhere else, the typeface is Inter and nothing else, and
 * the theme has no light/dark split to fall out of sync. Each of them holds
 * perfectly the day it ships and then erodes one hardcoded hex at a time, in
 * whichever component a later feature adds, long after anyone thinks to run
 * the grep by hand.
 *
 * `/check verify` greps for all of this once. This file makes the same three
 * greps part of the suite, in the shape `security-boundary.test.ts` already
 * established for the service role key.
 *
 * The walk covers the whole repository rather than a list of directories, for
 * the same reason that file gives: the violation arrives in a directory nobody
 * remembered to add.
 */

/**
 * Directories skipped at any depth. Dependencies and build output are not ours
 * to police; documentation and the design references are where the raw hex
 * values legitimately live, being the source these tokens were read from.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "coverage",
  "docs",
  "design",
  "public",
  "supabase",
  "fixtures",
  "__fixtures__",
]);

/**
 * Every extension a colour value could reach the browser through, not just the
 * component ones. A second stylesheet, or a config file that hands a colour to
 * a plugin, breaks the rule exactly as a hardcoded hex in a component does.
 */
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs", ".js"]);

/** Every scannable file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry) || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (SCANNED_EXTENSIONS.has(extname(path))) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Paths the colour rule does not apply to: this file, whose own subject is the
 * rule, and `globals.css`, which is the one place a colour value may be
 * written (AGENTS.md, the Tailwind v4 note).
 */
const EXEMPT_FROM_COLOUR_RULE =
  /(^|\/)(design-tokens-boundary\.test\.ts|app\/globals\.css)$/;

const SOURCE_FILES = filesUnder(".").filter(
  (path) => !EXEMPT_FROM_COLOUR_RULE.test(path),
);

const GLOBALS_CSS = readFileSync("app/globals.css", "utf8");

describe("typeface boundary (AC-2)", () => {
  it("finds no trace of the starter's typefaces in application code", () => {
    const offenders = SOURCE_FILES.filter((path) =>
      /geist/i.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("finds no Geist declaration left in the stylesheet", () => {
    expect(GLOBALS_CSS).not.toMatch(/geist/i);
  });

  it("keeps Inter as the one typeface the root layout loads", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");

    expect(layout).toMatch(/from "next\/font\/google"/);
    expect(layout.match(/Inter\(/g)).toHaveLength(1);
  });
});

describe("colour boundary (AC-3, AC-4)", () => {
  /**
   * Any colour literal at all, not just today's brand values. Naming the six
   * current colours would pass the moment someone pastes a seventh, which is
   * the way this rule actually erodes.
   *
   * Functional notation counts too. `globals.css` already writes one
   * (`--border`), so a component reaching for `rgb(...)` instead of a hex is a
   * realistic way past a hex only grep rather than a hypothetical one.
   */
  const COLOUR_LITERAL =
    /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

  /**
   * The showcase deliberately builds a light, non brand swatch as a data URI
   * so the plate rule has something legible to fail against (AC-5). It is test
   * fixture artwork living in a development only route, not a product colour.
   */
  const ALLOWED = new Map([["app/showcase/page.tsx", ["#C8B89A"]]]);

  it("keeps every colour value in globals.css and out of the components", () => {
    const offenders = SOURCE_FILES.flatMap((path) => {
      const allowed = ALLOWED.get(path.replace(/^\.\//, "")) ?? [];
      const found = readFileSync(path, "utf8").match(COLOUR_LITERAL) ?? [];
      const unexpected = found.filter(
        (value) =>
          !allowed.some((ok) => ok.toLowerCase() === value.toLowerCase()),
      );
      return unexpected.map((value) => `${path}: ${value}`);
    });

    expect(offenders).toEqual([]);
  });

  it("declares the product tokens the badges and plates read from", () => {
    for (const token of [
      "--color-rating-tmdb",
      "--color-score-personal",
      "--color-glass-plate-panel",
      "--blur-glass",
      "--ring",
    ]) {
      expect(GLOBALS_CSS).toContain(token);
    }
  });
});

describe("theme boundary (AC-1)", () => {
  it("has one theme, with no dark variant structure to drift out of sync", () => {
    expect(GLOBALS_CSS).not.toMatch(/@custom-variant\s+dark/);
    expect(GLOBALS_CSS).not.toMatch(/(^|[\s,{])\.dark\b/m);
  });

  it("tells the browser the one theme is a dark one", () => {
    expect(GLOBALS_CSS).toMatch(/color-scheme:\s*dark/);
  });
});
