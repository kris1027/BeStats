import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0014, AC-2, AC-6, AC-15
 *
 * `/upcoming` is private, so unlike the catalog routes it does read the
 * session. What must never happen is a user specific value reaching a shared
 * cache: no file behind the page may open a `use cache` scope, the page keeps
 * its static shell (the heading) with every session read behind its one
 * Suspense boundary, and each card's pill streams in a boundary of its own.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const PAGE = "app/upcoming/page.tsx";

describe("/upcoming keeps private values out of shared caches (AC-15)", () => {
  const files = [
    ...sourceFiles("app/upcoming"),
    ...sourceFiles("components/upcoming"),
    "lib/tracking/up-next.ts",
    "lib/tv/up-next.ts",
  ];

  it("finds the page and its pieces", () => {
    expect(files).toContain(PAGE);
    expect(files).toContain(join("components/upcoming/upcoming-sections.tsx"));
  });

  it.each(files)("%s opens no cache scope", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/["']use cache/);
    expect(source).not.toContain("next/cache");
  });

  it("does not opt the page out of the static shell (AC-2)", () => {
    expect(readFileSync(PAGE, "utf8")).not.toMatch(/instant\s*=\s*false/);
  });

  it("reads no request value in the page itself, only behind Suspense (AC-2)", () => {
    const source = readFileSync(PAGE, "utf8");
    for (const api of [
      "cookies(",
      "headers(",
      "@/lib/supabase",
      "@/lib/auth/user",
    ]) {
      expect(source, `${PAGE} must not use ${api}`).not.toContain(api);
    }
    expect(source).toMatch(
      /<Suspense fallback=\{<UpcomingSkeleton \/>\}>[\s\S]*<UpcomingSections \/>/,
    );
  });

  it("streams each card's pill in its own boundary (AC-6)", () => {
    expect(
      readFileSync("components/upcoming/up-next-card.tsx", "utf8"),
    ).toMatch(
      /<Suspense fallback=\{<UpNextPillSkeleton \/>\}>\s*<UpNextControls/,
    );
  });

  it("checks the session in the streamed section itself (AC-1)", () => {
    expect(
      readFileSync("components/upcoming/upcoming-sections.tsx", "utf8"),
    ).toMatch(
      /async function UpcomingSections\(\) \{\s*await requireUser\(\);/,
    );
  });
});
