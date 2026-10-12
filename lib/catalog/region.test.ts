import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_REGION, parseRegion } from "./region";

/**
 * covers: spec 0022, AC-8, AC-9
 *
 * The region rule, and the request scope boundary around it: the region is
 * read only in the title page slots, never inside the TMDB module, and no
 * library or grid read ever reaches the extras read. Local runs have no
 * `x-vercel-ip-country` header, so another real country is checked on a
 * preview with `curl -H "x-vercel-ip-country: PL"`.
 */

describe("parseRegion", () => {
  it("names a real two letter country in English", () => {
    expect(parseRegion("PL")).toEqual({ code: "PL", name: "Poland" });
    expect(parseRegion("DE")).toEqual({ code: "DE", name: "Germany" });
  });

  it.each<[string | null | undefined, string]>([
    [null, "missing"],
    [undefined, "missing"],
    ["", "empty"],
    ["pl", "lower case"],
    ["POL", "three letters"],
    ["P1", "a digit"],
    ["XX", "Vercel's unknown country"],
    ["T1", "Tor"],
    ["ZZ", "Unicode's unknown region"],
    ["QQ", "a code nobody can name"],
  ])("falls back to US for %j (%s)", (header) => {
    expect(parseRegion(header)).toEqual(DEFAULT_REGION);
  });

  it("falls back to the United States, named", () => {
    expect(DEFAULT_REGION).toEqual({ code: "US", name: "United States" });
  });
});

/** Application source under a directory, tests left out. */
function sourcesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourcesUnder(path));
    else if (
      [".ts", ".tsx"].includes(extname(path)) &&
      !/\.test\.tsx?$/.test(path)
    ) {
      found.push(path);
    }
  }
  return found;
}

describe("the request scope boundary (AC-8, AC-9)", () => {
  it("keeps request state out of the TMDB module, extras included", () => {
    for (const path of sourcesUnder("lib/tmdb")) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("next/headers");
      expect(source, path).not.toContain('"x-vercel-ip-country"');
    }
  });

  it("reads the country header only in lib/region.ts", () => {
    const readers = ["app", "components", "lib"]
      .flatMap(sourcesUnder)
      .filter((path) =>
        readFileSync(path, "utf8").includes('"x-vercel-ip-country"'),
      );
    expect(readers).toEqual(["lib/region.ts"]);
  });

  it("never reaches the extras read from a library or grid read", () => {
    const callers = ["app", "components", "lib"]
      .flatMap(sourcesUnder)
      .filter((path) =>
        /\b(getMovieExtras|getTvExtras)\b/.test(readFileSync(path, "utf8")),
      )
      .filter((path) => !path.startsWith("lib/tmdb/"));
    expect(callers).toEqual(["components/catalog/title-extras.tsx"]);
  });
});
