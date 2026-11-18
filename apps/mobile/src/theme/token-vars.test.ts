import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TOKEN_VARS } from "./token-vars";

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
  expect(new Set(named)).toEqual(new Set(Object.keys(TOKEN_VARS)));
});

test("no oklch value reaches React Native, which cannot draw it", () => {
  for (const value of Object.values(TOKEN_VARS)) {
    expect(value).not.toContain("oklch");
  }
});
