import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0006, AC-13
 *
 * The movie routes are public catalog pages served from a prerendered shell
 * and a shared cache. One `cookies()` call or Supabase client in them would
 * make them request scoped and risk a user specific value reaching a cached
 * scope, silently. So the source is scanned, like `app/layout-purity.test.ts`.
 */
const FORBIDDEN = [
  "cookies(",
  "headers(",
  "draftMode(",
  "@/lib/supabase",
  "@/lib/auth/user",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the movie routes read no request scoped value (AC-13)", () => {
  const files = [
    ...sourceFiles("app/movies"),
    ...sourceFiles("components/movie"),
  ];

  it("finds the route files", () => {
    expect(files).toContain("app/movies/page.tsx");
    expect(files).toContain(join("app/movies/[id]/page.tsx"));
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of FORBIDDEN) {
      expect(source, `${path} must not use ${api}`).not.toContain(api);
    }
  });

  it("does not opt either route out of the static shell (AC-11)", () => {
    for (const path of ["app/movies/page.tsx", "app/movies/[id]/page.tsx"]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/instant\s*=\s*false/);
    }
  });
});
