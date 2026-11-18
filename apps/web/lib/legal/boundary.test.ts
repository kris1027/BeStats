import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CONTACT_EMAIL,
  IGDB_ATTRIBUTION,
  IGDB_HOME_URL,
  JUSTWATCH_ATTRIBUTION,
  OPERATOR_COUNTRY,
  OPERATOR_GITHUB_URL,
  OPERATOR_HANDLE,
  SUPERVISORY_AUTHORITY,
  TMDB_HOME_URL,
} from "./operator";

/**
 * covers: spec 0017, AC-3, AC-6, AC-10; spec 0032, AC-8
 *
 * The legal facts and TMDB's notice each have one home, so a later edit that
 * pastes a copy somewhere else would publish two versions that drift apart.
 * The rendered tests cannot see that: a hardcoded copy renders the same text
 * until the day the constant changes. So this reads the source instead.
 */

/**
 * The workspace root, found from this file rather than the working directory,
 * so the scan covers every app and package (`apps/mobile`, `packages/core`)
 * the day it appears, whichever folder vitest runs from.
 */
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const WEB = "apps/web";

/** Application source only; tests name the strings they forbid. */
const SOURCE_ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIPPED_DIRS = new Set(["node_modules"]);

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry) || entry.startsWith(".")) continue;
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

const SOURCES = SOURCE_ROOTS.map((root) => join(WORKSPACE_ROOT, root))
  .filter((root) => existsSync(root))
  .flatMap(filesUnder)
  .map((path) => relative(WORKSPACE_ROOT, path));

/** Reads a file by its workspace relative path. */
function read(path: string): string {
  return readFileSync(join(WORKSPACE_ROOT, path), "utf8");
}

/** The files that contain a literal, as workspace relative paths. */
function filesContaining(literal: string): string[] {
  return SOURCES.filter((path) => read(path).includes(literal));
}

describe("one home for each legal fact", () => {
  it("writes TMDB's notice only in lib/tmdb/constants.ts (AC-3)", () => {
    // A fragment, so a reworded copy of the sentence is caught too.
    expect(filesContaining("otherwise approved by TMDB")).toEqual([
      `${WEB}/lib/tmdb/constants.ts`,
    ]);
  });

  it("writes IGDB's credit only in lib/legal/operator.ts (spec 0032, AC-8)", () => {
    expect(filesContaining(IGDB_ATTRIBUTION)).toEqual([
      `${WEB}/lib/legal/operator.ts`,
    ]);
  });

  it("writes IGDB's site URL only in lib/legal/operator.ts", () => {
    expect(filesContaining(IGDB_HOME_URL)).toEqual([
      `${WEB}/lib/legal/operator.ts`,
    ]);
  });

  it("writes TMDB's site URL only in lib/legal/operator.ts", () => {
    expect(filesContaining(TMDB_HOME_URL)).toEqual([
      `${WEB}/lib/legal/operator.ts`,
    ]);
  });

  it("names no processor's country in /privacy itself", () => {
    expect(read(`${WEB}/app/privacy/page.tsx`)).not.toContain("United States");
  });

  it("writes the JustWatch credit only in lib/legal/operator.ts (spec 0022, AC-12)", () => {
    expect(filesContaining(JUSTWATCH_ATTRIBUTION)).toEqual([
      `${WEB}/lib/legal/operator.ts`,
    ]);
  });

  it("writes the contact email only in lib/legal/operator.ts (AC-10)", () => {
    expect(filesContaining(CONTACT_EMAIL)).toEqual([
      `${WEB}/lib/legal/operator.ts`,
    ]);
  });

  it.each([`${WEB}/app/privacy/page.tsx`, `${WEB}/app/terms/page.tsx`])(
    "%s hardcodes no operator value (AC-10)",
    (page) => {
      const source = read(page);
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
    `${WEB}/app/privacy/page.tsx`,
    `${WEB}/app/terms/page.tsx`,
    `${WEB}/components/legal/legal-document.tsx`,
  ])("%s has no client boundary and reads no request state", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/^\s*["']use client["']/m);
    expect(source).not.toMatch(
      /\b(cookies|headers|connection|draftMode)\s*\(|@\/lib\/supabase|searchParams/,
    );
  });

  it("keeps the operator module pure, with no server-only guard (AC-10)", () => {
    expect(read(`${WEB}/lib/legal/operator.ts`)).not.toMatch(
      /import\s+["']server-only["']/,
    );
  });
});
