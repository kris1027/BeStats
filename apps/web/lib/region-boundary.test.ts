import { describe, expect, it } from "vitest";
import { readWorkspaceFile, workspaceFiles } from "@/workspace-files";

/**
 * covers: spec 0022, AC-8, AC-9
 *
 * The request scope boundary around the region: it is read only in the title
 * page slots, never inside the TMDB module, and no library or grid read ever
 * reaches the extras read. Local runs have no `x-vercel-ip-country` (Vercel)
 * or `x-country` (Netlify) header, so another real country is checked on a
 * deployment with `curl -H "x-vercel-ip-country: PL"`. The scan is web only on purpose (core
 * cannot read a header), and walks the tree the way every boundary test does
 * (AGENTS.md, Commands and repo facts); paths are reported relative to the
 * web app.
 */
const WEB = "apps/web/";

/** Vercel's and Netlify's country headers (prompts/netlify-mirror.md). */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "x-country"] as const;

/** Application source under web app folders, tests left out. */
function sourcesUnder(...dirs: string[]): string[] {
  return workspaceFiles({
    skipDirs: new Set(["node_modules"]),
    roots: dirs.map((dir) => WEB + dir),
    keep: (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path),
  });
}

/** A web relative path as the assertions name it. */
const webPath = (path: string) => path.slice(WEB.length);

describe("the request scope boundary (AC-8, AC-9)", () => {
  it("keeps request state out of the TMDB module, extras included", () => {
    for (const path of sourcesUnder("lib/tmdb")) {
      const source = readWorkspaceFile(path);
      expect(source, path).not.toContain("next/headers");
      for (const name of COUNTRY_HEADERS) {
        expect(source, path).not.toContain(`"${name}"`);
      }
    }
  });

  it("reads the country header only in lib/region.ts", () => {
    const readers = sourcesUnder("app", "components", "lib")
      .filter((path) =>
        COUNTRY_HEADERS.some((name) =>
          readWorkspaceFile(path).includes(`"${name}"`),
        ),
      )
      .map(webPath);
    expect(readers).toEqual(["lib/region.ts"]);
  });

  it("never reaches the extras read from a library or grid read", () => {
    const callers = sourcesUnder("app", "components", "lib")
      .filter((path) =>
        /\b(getMovieExtras|getTvExtras)\b/.test(readWorkspaceFile(path)),
      )
      .map(webPath)
      .filter((path) => !path.startsWith("lib/tmdb/"));
    // The app's extras routes (prompts/mobile-look-title-extras.md) read it
    // for one title, as the web's title page slots do.
    expect(callers).toEqual([
      "app/api/v1/movies/[id]/extras/route.ts",
      "app/api/v1/shows/[id]/extras/route.ts",
      "components/catalog/title-extras.tsx",
    ]);
  });
});
