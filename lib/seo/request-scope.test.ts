import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0016, AC-24
 *
 * Nothing user specific may reach a share card, the sitemap or robots.txt,
 * and reading request state would also cost the public pages their
 * prerendered shells. A grep, like `app/layout-purity.test.ts`, because the
 * property is which modules reach for request state.
 */
const SEO_FILES = [
  ...readdirSync("lib/seo")
    .filter((name) => !name.endsWith(".test.ts"))
    .map((name) => join("lib/seo", name)),
  "app/robots.ts",
  "app/sitemap.ts",
  "app/opengraph-image.tsx",
];

const REQUEST_STATE = [
  "cookies(",
  "headers(",
  "lib/supabase",
  "getOptionalUser",
  "requireUser",
];

describe("the SEO surface reads no request state", () => {
  it.each(SEO_FILES)("%s", (path) => {
    const source = readFileSync(path, "utf8");
    const found = REQUEST_STATE.filter((needle) => source.includes(needle));
    expect(found).toEqual([]);
  });

  it("keeps lib/seo free of server-only and the TMDB module", () => {
    for (const path of SEO_FILES.filter((p) => p.startsWith("lib/seo"))) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/"server-only"|from "@\/lib\/tmdb"/);
    }
  });
});
