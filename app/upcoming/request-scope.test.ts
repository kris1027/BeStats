import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0014, AC-2, AC-6, AC-15; spec 0015, AC-11
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
    "lib/tracking/auto-completion.ts",
    "lib/tv/auto-completion.ts",
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
      /<Suspense fallback=\{<UpcomingSkeleton \/>\}>[\s\S]*<UpcomingSections searchParams=\{searchParams\} \/>/,
    );
  });

  it("streams each card's pill in its own boundary (AC-6)", () => {
    expect(
      readFileSync("components/upcoming/up-next-card.tsx", "utf8"),
    ).toMatch(
      /<Suspense fallback=\{<UpNextPillSkeleton \/>\}>\s*<UpNextControls/,
    );
  });

  it("checks the session in the streamed section itself, before reading the tab (AC-1; feature 22)", () => {
    expect(
      readFileSync("components/upcoming/upcoming-sections.tsx", "utf8"),
    ).toMatch(
      /async function UpcomingSections\([^)]*\}\) \{\s*await requireUser\(\);\s*const type = parseMediaTypeParam/,
    );
  });

  it("runs the automatic completion check before the one Up Next read (spec 0015, AC-11)", () => {
    const source = readFileSync(
      "components/upcoming/upcoming-sections.tsx",
      "utf8",
    );
    expect(source).toMatch(
      /async function loadUpNext\(\)[^{]*\{(?:(?!await)[\s\S])*await reconcileUpNextShows\(\);\s*const shows = await getUpNextShows\(\);/,
    );
    expect(source.match(/getUpNextShows\(/g)).toHaveLength(1);
    const readers = files.filter((path) =>
      /user_up_next_shows/.test(readFileSync(path, "utf8")),
    );
    expect(readers).toEqual(["lib/tracking/up-next.ts"]);
  });

  it("runs the completion check only on the shows tab, and reads one section per tab (feature 22)", () => {
    const source = readFileSync(
      "components/upcoming/upcoming-sections.tsx",
      "utf8",
    );
    // Called once, inside the shows tab's branch; the movies tab only reads
    // Coming soon, so it writes nothing.
    expect(source.match(/await loadUpNext\(\)/g)).toHaveLength(1);
    expect(source.match(/await loadComingSoon\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /if \(type === "tv"\) \{(?:(?!loadComingSoon)[\s\S])*await loadUpNext\(\)[\s\S]*?\n {2}\}\n/,
    );
    expect(source.match(/reconcileUpNextShows\(/g)).toHaveLength(1);
  });
});
