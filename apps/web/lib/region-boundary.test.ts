import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0022, AC-8, AC-9
 *
 * The request scope boundary around the region: it is read only in the title
 * page slots, never inside the TMDB module, and no library or grid read ever
 * reaches the extras read. Local runs have no `x-vercel-ip-country` header, so
 * another real country is checked on a preview with
 * `curl -H "x-vercel-ip-country: PL"`. Paths resolve from this file, not the
 * working directory, and are reported relative to the web app.
 */
const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Application source under a directory, tests left out. */
function sourcesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(WEB_ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(join(WEB_ROOT, path)).isDirectory())
      found.push(...sourcesUnder(path));
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
      const source = readFileSync(join(WEB_ROOT, path), "utf8");
      expect(source, path).not.toContain("next/headers");
      expect(source, path).not.toContain('"x-vercel-ip-country"');
    }
  });

  it("reads the country header only in lib/region.ts", () => {
    const readers = ["app", "components", "lib"]
      .flatMap(sourcesUnder)
      .filter((path) =>
        readFileSync(join(WEB_ROOT, path), "utf8").includes(
          '"x-vercel-ip-country"',
        ),
      );
    expect(readers).toEqual(["lib/region.ts"]);
  });

  it("never reaches the extras read from a library or grid read", () => {
    const callers = ["app", "components", "lib"]
      .flatMap(sourcesUnder)
      .filter((path) =>
        /\b(getMovieExtras|getTvExtras)\b/.test(
          readFileSync(join(WEB_ROOT, path), "utf8"),
        ),
      )
      .filter((path) => !path.startsWith("lib/tmdb/"));
    expect(callers).toEqual(["components/catalog/title-extras.tsx"]);
  });
});
