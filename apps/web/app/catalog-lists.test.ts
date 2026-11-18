import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GAME_LIST_SLUGS,
  MOVIE_LIST_SLUGS,
  TV_LIST_SLUGS,
} from "@/lib/catalog/lists";

/**
 * covers: spec 0021, the registry invariant; spec 0028, AC-9
 *
 * A slug is defined once, in `lib/catalog/lists.ts`, and each list has its
 * own static route folder. This keeps the two in step: a folder with no
 * registry entry, an entry with no folder, or a route rendering another
 * list's entry fails here rather than as a 404 or a wrong page.
 */
function staticRouteFolders(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("[") && !name.startsWith("("))
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

describe.each([
  ["app/shows", "tv", TV_LIST_SLUGS],
  ["app/movies", "movie", MOVIE_LIST_SLUGS],
  ["app/games", "game", GAME_LIST_SLUGS],
] as const)("%s", (dir, mediaType, slugs) => {
  it("has one static folder per registry slug, and no other", () => {
    expect(staticRouteFolders(dir)).toEqual([...slugs].sort());
  });

  it.each(slugs)("renders the %s entry from its own folder", (slug) => {
    const source = readFileSync(join(dir, slug, "page.tsx"), "utf8");
    expect(source).toContain(`catalogList("${mediaType}", "${slug}")`);
    expect(source).toContain("<CatalogListPage");
    // spec 0032, AC-5: games lists share the TMDB lists' metadata flow.
    expect(source).toContain("catalogListMetadata(");
  });
});
