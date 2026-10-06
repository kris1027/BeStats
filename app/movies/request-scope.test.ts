import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
 * covers: spec 0009, AC-17, AC-18, as amended by spec 0011, AC-20
 *
 * The TV routes are public catalog pages. Spec 0011 put the episode and
 * season tracking reads in `components/tracking/`, inside their own Suspense
 * boundaries, so the routes and `components/show` may import from there, but
 * still reach for no request API, Supabase client or session read directly.
 * `app/shows/actions.ts` is exempt, like `app/movies/actions.ts`.
 */
const SHOW_ACTIONS = "app/shows/actions.ts";

describe("the show routes read no request scoped value (spec 0009, AC-18; spec 0011, AC-20)", () => {
  const files = [
    ...sourceFiles("app/shows"),
    ...sourceFiles("components/show"),
    ...sourceFiles("components/catalog"),
  ].filter((path) => path !== SHOW_ACTIONS);

  it("finds the route files", () => {
    expect(files).toContain("app/shows/page.tsx");
    expect(files).toContain(join("app/shows/[id]/page.tsx"));
    expect(files).toContain(join("app/shows/[id]/season/[number]/page.tsx"));
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of FORBIDDEN) {
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

  it("keeps each season tracking read behind its own Suspense boundary (spec 0011, AC-20)", () => {
    expect(
      readFileSync("app/shows/[id]/season/[number]/page.tsx", "utf8"),
    ).toMatch(/<Suspense fallback=\{null\}>\s*<SeasonTrackingSlot/);
    expect(readFileSync("components/show/episode-list.tsx", "utf8")).toMatch(
      /<Suspense fallback=\{null\}>\s*<EpisodeTrackingSlot/,
    );
  });
});

/**
 * covers: spec 0010, AC-20, AC-22
 *
 * Search is public. The page, the Route Handler and every search piece reach
 * for no request API and no Supabase client, and declare no cache scope of
 * their own; the only session read is each movie card's bookmark, inside its
 * own Suspense boundary, exactly as on `/movies`.
 */
describe("search reads no request scoped value (spec 0010, AC-22)", () => {
  const files = [
    ...sourceFiles("app/search"),
    ...sourceFiles("app/api/search"),
    ...sourceFiles("components/search"),
    ...sourceFiles("lib/search"),
  ];

  it("finds the search files", () => {
    expect(files).toContain(join("app/search/page.tsx"));
    expect(files).toContain(join("app/api/search/route.ts"));
    expect(files).toContain(join("components/search/search-results.tsx"));
    expect(files).toContain(join("lib/search/scan.ts"));
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of FORBIDDEN) {
      expect(source, `${path} must not use ${api}`).not.toContain(api);
    }
    expect(source).not.toMatch(/["']use cache/);
  });

  it("does not opt the page out of the static shell (AC-21)", () => {
    expect(readFileSync("app/search/page.tsx", "utf8")).not.toMatch(
      /instant\s*=\s*false/,
    );
  });

  it("keeps the movie bookmark behind its own Suspense boundary (AC-16)", () => {
    expect(
      readFileSync("components/search/search-results.tsx", "utf8"),
    ).toMatch(/<Suspense fallback=\{null\}>\s*<CardBookmark/);
  });

  it("reads nothing from the request but its query in the Route Handler (AC-20)", () => {
    const source = readFileSync("app/api/search/route.ts", "utf8");
    expect(source).not.toMatch(/request\.(cookies|headers)/);
  });
});

/**
 * The repo files a render of `entry` reaches: its relative and `@/` imports,
 * followed transitively. A Server Actions file (`"use server"`) is not
 * followed: a click runs it, not the render. Packages are not followed.
 */
function renderGraph(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    const source = readFileSync(file, "utf8");
    if (/^\s*["']use server["']/.test(source)) continue;
    seen.add(file);
    for (const [, specifier] of source.matchAll(
      /(?:from|import)\s*\(?\s*["']([^"']+)["']/g,
    )) {
      const base = specifier.startsWith("@/")
        ? specifier.slice(2)
        : specifier.startsWith(".")
          ? join(dirname(file), specifier)
          : null;
      if (base === null) continue;
      const resolved = [".ts", ".tsx", "/index.ts", "/index.tsx"]
        .map((extension) => base + extension)
        .find((candidate) => existsSync(candidate));
      if (resolved) pending.push(resolved);
    }
  }
  return [...seen];
}

/**
 * covers: spec 0019, AC-13
 *
 * `/watched` writes nothing on load: only `/shows/{id}` and `/upcoming` run
 * the automatic completion check (`AGENTS.md`, Commands and repo facts). So
 * no file its render reaches, followed through every import, holds a write
 * call or imports that check. The grid's own removal goes through Server
 * Actions, which a click runs, not the render, so those are not followed.
 */
describe("the watched page writes nothing on load (spec 0019, AC-13)", () => {
  const files = renderGraph("app/watched/page.tsx");

  it("follows the render into the reads it makes", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "components/library/library-section.tsx",
        "components/library/library-card.tsx",
        "lib/tracking/library-lists.ts",
        "lib/tracking/show-ratings.ts",
      ]),
    );
    expect(files).not.toContain("app/movies/actions.ts");
  });

  it.each(files)("%s holds no write and no completion check", (path) => {
    const source = readFileSync(path, "utf8");
    for (const write of [
      ".rpc(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      "auto-completion",
    ]) {
      expect(source, `${path} must not use ${write}`).not.toContain(write);
    }
  });
});

describe("private tracking state never enters a cache scope (spec 0007, AC-19; spec 0008, AC-17; spec 0011, AC-20)", () => {
  const files = [
    ...sourceFiles("components/tracking"),
    ...sourceFiles("lib/tracking"),
    ...sourceFiles("app/watchlist"),
    ...sourceFiles("app/watched"),
    ...sourceFiles("components/library"),
    ACTIONS,
    SHOW_ACTIONS,
  ];

  it("finds the tracking files", () => {
    expect(files).toContain(join("lib/tracking/movie-state.ts"));
    expect(files).toContain(
      join("components/tracking/movie-tracking-slot.tsx"),
    );
    expect(files).toContain(join("app/watchlist/page.tsx"));
    expect(files).toContain(join("app/watched/page.tsx"));
    expect(files).toContain(join("lib/tracking/library-lists.ts"));
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

  it("keeps the show status, progress and TV bookmarks each behind their own boundary (spec 0013, AC-11, AC-18, AC-22)", () => {
    const show = readFileSync("app/shows/[id]/page.tsx", "utf8");
    expect(show).toMatch(/<Suspense fallback=\{null\}>\s*<ShowStatusSlot/);
    expect(show).toMatch(/<Suspense fallback=\{null\}>\s*<ShowProgressSlot/);
    expect(readFileSync("app/shows/page.tsx", "utf8")).toMatch(
      /<Suspense fallback=\{null\}>\s*<ShowCardBookmark/,
    );
    expect(
      readFileSync("components/search/search-results.tsx", "utf8"),
    ).toMatch(/<Suspense fallback=\{null\}>\s*<ShowCardBookmark/);
    expect(
      readFileSync("components/library/library-section.tsx", "utf8"),
    ).toMatch(/<Suspense fallback=\{null\}>\s*<NextEpisodePill/);
  });

  it("gives no show route an instant = false opt out (spec 0013, AC-22)", () => {
    for (const path of [
      "app/shows/page.tsx",
      "app/shows/[id]/page.tsx",
      "app/search/page.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/instant\s*=\s*false/);
    }
  });
});
