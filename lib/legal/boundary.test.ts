import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTACT_EMAIL,
  OPERATOR_COUNTRY,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
  SUPERVISORY_AUTHORITY,
} from "./operator";

/**
 * covers: spec 0017, AC-3, AC-6, AC-10
 *
 * The legal facts and TMDB's notice each have one home, so a later edit that
 * pastes a copy somewhere else would publish two versions that drift apart.
 * The rendered tests cannot see that: a hardcoded copy renders the same text
 * until the day the constant changes. So this reads the source instead.
 */

/** Application source only; tests name the strings they forbid. */
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (
      SOURCE_EXTENSIONS.has(extname(path)) &&
      !/\.(test|spec)\.tsx?$/.test(path)
    ) {
      found.push(path);
    }
  }
  return found;
}

const SOURCES = [...SOURCE_DIRS.flatMap(filesUnder), "proxy.ts"];

/** The files that contain a literal, as repo relative paths. */
function filesContaining(literal: string): string[] {
  return SOURCES.filter((path) => readFileSync(path, "utf8").includes(literal));
}

describe("one home for each legal fact", () => {
  it("writes TMDB's notice only in lib/tmdb/constants.ts (AC-3)", () => {
    // A fragment, so a reworded copy of the sentence is caught too.
    expect(filesContaining("otherwise approved by TMDB")).toEqual([
      "lib/tmdb/constants.ts",
    ]);
  });

  it("writes the contact email only in lib/legal/operator.ts (AC-10)", () => {
    expect(filesContaining(CONTACT_EMAIL)).toEqual(["lib/legal/operator.ts"]);
  });

  it.each(["app/privacy/page.tsx", "app/terms/page.tsx"])(
    "%s hardcodes no operator value (AC-10)",
    (page) => {
      const source = readFileSync(page, "utf8");
      for (const value of [
        OPERATOR_HANDLE,
        OPERATOR_GITHUB_URL,
        OPERATOR_COUNTRY,
        CONTACT_EMAIL,
        SUPERVISORY_AUTHORITY.address,
        SUPERVISORY_AUTHORITY.url,
      ]) {
        expect(source).not.toContain(value);
      }
    },
  );
});

describe("the legal pages stay static Server Components (AC-6)", () => {
  it.each([
    "app/privacy/page.tsx",
    "app/terms/page.tsx",
    "components/legal/legal-document.tsx",
  ])("%s has no client boundary and reads no request state", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/^\s*["']use client["']/m);
    expect(source).not.toMatch(
      /\b(cookies|headers|connection|draftMode)\s*\(|@\/lib\/supabase|searchParams/,
    );
  });

  it("keeps the operator module pure, with no server-only guard (AC-10)", () => {
    expect(readFileSync("lib/legal/operator.ts", "utf8")).not.toMatch(
      /import\s+["']server-only["']/,
    );
  });
});
