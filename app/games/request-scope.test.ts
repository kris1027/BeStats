import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GAME_LIST_SLUGS } from "@/lib/catalog/lists";

/**
 * covers: spec 0028, AC-18, AC-19; spec 0032, AC-14
 *
 * `/games` and its list pages are public pages served from a prerendered
 * shell. The only session read on them is the hero's `GameTrackingSlot`,
 * inside its own Suspense boundary in `components/`, so no route file may
 * reach for a request API or a Supabase client, and none may opt out of the
 * static shell. `app/games/actions.ts` is a POST handler, not render code.
 * The visitor's region is request state too, and since spec 0032 these pages
 * feed search engines, so it stays out of them as well.
 */
const FORBIDDEN = [
  "cookies(",
  "headers(",
  "draftMode(",
  "@/lib/supabase",
  "@/lib/auth/user",
  "getVisitorRegion",
];

const ACTIONS = join("app/games/actions.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the games routes read no request scoped value directly", () => {
  const files = sourceFiles("app/games").filter((path) => path !== ACTIONS);
  const pages = [
    "app/games/page.tsx",
    ...GAME_LIST_SLUGS.map((slug) => join(`app/games/${slug}/page.tsx`)),
  ];

  it("finds the landing and every list page", () => {
    for (const page of pages) expect(files).toContain(page);
  });

  it.each(files)("%s reaches for none of them", (path) => {
    const source = readFileSync(path, "utf8");
    for (const api of FORBIDDEN) {
      expect(source, `${path} must not use ${api}`).not.toContain(api);
    }
  });

  it.each(pages)("%s keeps its static shell", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/instant\s*=\s*false/);
  });
});
