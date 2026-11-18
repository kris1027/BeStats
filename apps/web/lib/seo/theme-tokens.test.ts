import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { rootTokens } from "./theme-tokens";

/**
 * covers: spec 0016, AC-19
 *
 * The site card reads its colours from `globals.css` at build time, and a
 * missing token must fail the build. Named colours stand in for real values
 * here, so this file holds no colour literal either.
 */
describe("rootTokens", () => {
  const CSS = `
@theme inline {
  --background: var(--background);
}

:root {
  color-scheme: dark;
  --background: black;
  --foreground:white;
  --muted-foreground: gray;
}

.other {
  --background: red;
}
`;

  it("reads each token from the :root block only", () => {
    expect(
      rootTokens(CSS, ["--background", "--foreground", "--muted-foreground"]),
    ).toEqual({
      "--background": "black",
      "--foreground": "white",
      "--muted-foreground": "gray",
    });
  });

  it("does not confuse a token with a longer name ending the same way", () => {
    expect(() =>
      rootTokens(":root { --muted-foreground: gray; }", ["--foreground"]),
    ).toThrow(/--foreground/);
  });

  it("throws when the stylesheet has no :root block", () => {
    expect(() => rootTokens(".a { --x: y; }", ["--x"])).toThrow(/:root/);
  });

  it("finds all three tokens the card needs in the real stylesheet", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const tokens = rootTokens(css, [
      "--background",
      "--foreground",
      "--muted-foreground",
    ]);

    for (const value of Object.values(tokens)) {
      expect(value).not.toMatch(/var\(/);
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
