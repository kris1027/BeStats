import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0006, AC-13, as amended by spec 0007, AC-19
 *
 * The movie routes are public catalog pages served from a prerendered shell
 * and a shared cache. One `cookies()` call or Supabase client in them would
 * make them request scoped and risk a user specific value reaching a cached
 * scope, silently. So the source is scanned, like `app/layout-purity.test.ts`.
 *
 * Spec 0007 moved the one legitimate request scoped read, the tracking state,
 * into `components/tracking/`, rendered inside its own Suspense boundaries.
 * Route and `components/movie` files may import from there, but still reach
 * for no request API or Supabase client directly. `app/movies/actions.ts` is
 * exempt: a Server Action is a POST handler, not render code.
 *
 * The real leak risk is a `"use cache"` scope anywhere near private state, so
 * no file in `components/tracking/` or `lib/tracking/` may contain one. That
 * request scoped reads sit inside Suspense is enforced by the build itself
 * under `cacheComponents`, so this test does not try to.
 */
const FORBIDDEN = [
  "cookies(",
  "headers(",
  "draftMode(",
  "@/lib/supabase",
  "@/lib/auth/user",
];

/** The Server Actions file: request scoped by nature, and never rendered. */
const ACTIONS = "app/movies/actions.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the movie routes read no request scoped value directly (AC-13)", () => {
  const files = [
    ...sourceFiles("app/movies"),
    ...sourceFiles("components/movie"),
  ].filter((path) => path !== ACTIONS);

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

/**
 * covers: spec 0009, AC-17, AC-18
 *
 * The TV routes are public catalog pages with no tracking at all yet, so they
 * and the pieces they render reach for no request API, no Supabase client and
 * not even `components/tracking/`. Features 12 to 14 relax the last rule when
 * they fill the reserved places.
 */
describe("the show routes read no request scoped value (spec 0009, AC-18)", () => {
  const files = [
    ...sourceFiles("app/shows"),
    ...sourceFiles("components/show"),
    ...sourceFiles("components/catalog"),
  ];

  it("finds the route files", () => {
    expect(files).toContain("app/shows/page.tsx");
    expect(files).toContain(join("app/shows/[id]/page.tsx"));
    expect(files).toContain(join("app/shows/[id]/season/[number]/page.tsx"));
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of [...FORBIDDEN, "@/components/tracking"]) {
      expect(source, `${path} must not use ${api}`).not.toContain(api);
    }
  });

  it.each([
    "app/shows/page.tsx",
    "app/shows/[id]/page.tsx",
    "app/shows/[id]/season/[number]/page.tsx",
  ])("%s does not opt out of the static shell (AC-17)", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/instant\s*=\s*false/);
  });
});

describe("private tracking state never enters a cache scope (spec 0007, AC-19; spec 0008, AC-17)", () => {
  const files = [
    ...sourceFiles("components/tracking"),
    ...sourceFiles("lib/tracking"),
    ...sourceFiles("app/watchlist"),
    ...sourceFiles("app/watched"),
    ...sourceFiles("components/library"),
    ACTIONS,
  ];

  it("finds the tracking files", () => {
    expect(files).toContain(join("lib/tracking/movie-state.ts"));
    expect(files).toContain(
      join("components/tracking/movie-tracking-slot.tsx"),
    );
    expect(files).toContain(join("app/watchlist/page.tsx"));
    expect(files).toContain(join("app/watched/page.tsx"));
    expect(files).toContain(join("lib/tracking/movie-lists.ts"));
    expect(files).toContain(join("components/library/library-section.tsx"));
  });

  it("keeps each list page's private read behind its Suspense boundary (spec 0008, AC-12)", () => {
    for (const path of ["app/watchlist/page.tsx", "app/watched/page.tsx"]) {
      expect(readFileSync(path, "utf8")).toMatch(
        /<Suspense fallback=\{<LibrarySkeleton \/>\}>\s*<LibrarySection/,
      );
    }
  });

  it.each(files)("%s declares no use cache scope", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/["']use cache/);
  });

  it("keeps each tracking read behind its own Suspense boundary", () => {
    expect(readFileSync("app/movies/[id]/page.tsx", "utf8")).toMatch(
      /<Suspense fallback=\{null\}>\s*<MovieTrackingSlot/,
    );
    expect(readFileSync("app/movies/page.tsx", "utf8")).toMatch(
      /<Suspense fallback=\{null\}>\s*<CardBookmark/,
    );
  });
});
