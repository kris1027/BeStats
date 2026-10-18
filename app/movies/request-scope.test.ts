import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOVIE_LIST_SLUGS, TV_LIST_SLUGS } from "@/lib/catalog/lists";

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
    // spec 0021, AC-17: every list page is scanned too.
    for (const slug of MOVIE_LIST_SLUGS) {
      expect(files).toContain(join(`app/movies/${slug}/page.tsx`));
    }
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of FORBIDDEN) {
      expect(source, `${path} must not use ${api}`).not.toContain(api);
    }
  });

  it("does not opt any route out of the static shell (AC-11; spec 0021, AC-7)", () => {
    for (const path of [
      "app/movies/page.tsx",
      "app/movies/[id]/page.tsx",
      ...MOVIE_LIST_SLUGS.map((slug) => `app/movies/${slug}/page.tsx`),
    ]) {
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
    // spec 0021, AC-17: every list page and the landing's row pieces too.
    for (const slug of TV_LIST_SLUGS) {
      expect(files).toContain(join(`app/shows/${slug}/page.tsx`));
    }
    expect(files).toContain(
      join("components/catalog/landing/landing-items.ts"),
    );
    expect(files).toContain(join("components/catalog/catalog-list-page.tsx"));
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
    ...TV_LIST_SLUGS.map((slug) => `app/shows/${slug}/page.tsx`),
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

  it("keeps the movie card slots behind their own Suspense boundaries (AC-16)", () => {
    const source = readFileSync("components/search/search-results.tsx", "utf8");
    expect(source).toMatch(/<Suspense fallback=\{null\}>\s*<MovieCardControls/);
    expect(source).toMatch(
      /<Suspense\s+fallback=\{<TmdbRatingBadge[^}]*\} \/>\}\s*>\s*<MovieCardBadge/,
    );
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
 * covers: spec 0019, AC-13; spec 0020, AC-21
 *
 * No page writes on load (spec 0020, AC-21): automatic completion and its
 * writes on `/shows/{id}` and `/upcoming` are gone. So no file a library page
 * or the show page reaches, followed through every import, holds a write call
 * or imports a completion check. The grids' own removals and marks go
 * through Server Actions, which a click runs, not the render, so those are
 * not followed.
 */
describe.each([
  "app/watchlist/page.tsx",
  "app/upcoming/page.tsx",
  "app/watched/page.tsx",
  "app/shows/[id]/page.tsx",
])("%s writes nothing on load (spec 0020, AC-21)", (page) => {
  const files = renderGraph(page);

  it("follows the render into the reads it makes", () => {
    expect(files).toEqual(
      expect.arrayContaining(
        page.startsWith("app/shows")
          ? [
              "components/tracking/show-tracking-slot.tsx",
              "lib/tracking/show-state.ts",
            ]
          : [
              "components/library/library-section.tsx",
              "components/library/library-card.tsx",
              "lib/tracking/library-lists.ts",
              "lib/tracking/show-ratings.ts",
            ],
      ),
    );
    expect(files).not.toContain("app/movies/actions.ts");
    expect(files).not.toContain("app/shows/actions.ts");
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
    ...sourceFiles("app/upcoming"),
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
    for (const path of [
      "app/watchlist/page.tsx",
      "app/upcoming/page.tsx",
      "app/watched/page.tsx",
    ]) {
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
    // spec 0021, AC-4: the landing rows and list pages share these cards.
    const movies = readFileSync("components/catalog/list-cards.tsx", "utf8");
    expect(movies).toMatch(/<Suspense fallback=\{null\}>\s*<MovieCardControls/);
    expect(movies).toMatch(
      /<Suspense\s+fallback=\{<TmdbRatingBadge[^}]*\} \/>\}\s*>\s*<MovieCardBadge/,
    );
  });

  it("keeps the show tracking, progress and TV bookmarks each behind their own boundary (spec 0013, AC-11, AC-22; spec 0020, AC-2, AC-6)", () => {
    const show = readFileSync("app/shows/[id]/page.tsx", "utf8");
    expect(show).toMatch(/<Suspense fallback=\{null\}>\s*<ShowTrackingSlot/);
    expect(show).toMatch(/<Suspense fallback=\{null\}>\s*<ShowProgressSlot/);
    // spec 0021, AC-4: the landing rows and list pages share these cards.
    const shows = readFileSync("components/catalog/list-cards.tsx", "utf8");
    expect(shows).toMatch(/<Suspense fallback=\{null\}>\s*<ShowCardControls/);
    expect(shows).toMatch(/<Suspense fallback=\{null\}>\s*<ShowCardMeta/);
    expect(shows).toMatch(
      /<Suspense\s+fallback=\{<TmdbRatingBadge[^}]*\} \/>\}\s*>\s*<ShowCardBadge/,
    );
    const search = readFileSync("components/search/search-results.tsx", "utf8");
    expect(search).toMatch(/<Suspense fallback=\{null\}>\s*<ShowCardControls/);
    expect(search).toMatch(/<Suspense fallback=\{year\}>\s*<ShowCardMeta/);
    expect(
      readFileSync("components/library/watchlist-show-card.tsx", "utf8"),
    ).toMatch(/<Suspense fallback=\{null\}>\s*<NextEpisodeName/);
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

/**
 * covers: spec 0021, AC-7, AC-17
 *
 * The landing rows read TMDB at request time, never inside a cache scope of
 * their own: `connection()` comes before the read in the row component, and
 * the only cached scopes are the TMDB module's reads. Nothing in the catalog
 * row and list pieces declares `use cache`.
 */
describe("the catalog rows and list pages (spec 0021, AC-7, AC-17)", () => {
  const files = [
    ...sourceFiles("components/catalog"),
    "lib/catalog-list-read.ts",
    "lib/landing-metadata.ts",
  ];

  it.each(files)("%s declares no use cache scope", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/["']use cache/);
  });

  it("waits for the request before a landing section reads TMDB", () => {
    // prompts/home-parallax-landing.md: every section reads through here.
    const source = readFileSync(
      "components/catalog/landing/landing-items.ts",
      "utf8",
    );
    expect(source.indexOf("await connection()")).toBeGreaterThan(-1);
    expect(source.indexOf("await connection()")).toBeLessThan(
      source.indexOf("readTaggedCatalogList(list, 1)"),
    );
  });
});
