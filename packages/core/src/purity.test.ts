import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Spec 0033 AC-2 and spec 0034, Purity rule: core runs unchanged in the web's
 * server, the browser and the Expo app, so no file in it may lean on one of
 * them. A rule that needs a session, a catalog read or a framework stays in
 * `apps/web`; only its pure half lives here. This suite is what keeps a later
 * edit from quietly pulling a server module onto the phone.
 *
 * The file list is walked from this file's folder rather than the working
 * directory (AGENTS.md, Commands and repo facts), and test files are skipped
 * because they may use `node:` modules to read fixtures.
 */
const SRC = fileURLToPath(new URL(".", import.meta.url));

/** Import specifiers a core file must never use, exactly or as a prefix. */
const FORBIDDEN_EXACT = ["server-only", "next", "react", "react-native"];
const FORBIDDEN_PREFIX = [
  "next/",
  "react/",
  "react-native/",
  "expo",
  "@supabase/",
];

/** A read of `process.env`, dotted or bracketed. */
const READS_ENV = /\bprocess\s*(?:\.\s*env\b|\[\s*["'`]env["'`]\s*\])/;

/** Every specifier a file imports, re-exports or loads dynamically. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

/** True when a specifier names a package core may not depend on. */
function isForbiddenSpecifier(specifier: string): boolean {
  return (
    FORBIDDEN_EXACT.includes(specifier) ||
    FORBIDDEN_PREFIX.some((prefix) => specifier.startsWith(prefix))
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

describe("core purity (spec 0033 AC-2)", () => {
  const files = sourceFiles(SRC);

  it("finds the core sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports no server, framework, native or Supabase module", () => {
    const offenders = files.flatMap((file) =>
      specifiers(readFileSync(file, "utf8"))
        .filter(isForbiddenSpecifier)
        .map((specifier) => `${relative(SRC, file)} imports ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reads no environment variable", () => {
    const offenders = files
      .filter((file) => READS_ENV.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("imports only zod and its own files", () => {
    const offenders = files.flatMap((file) =>
      specifiers(readFileSync(file, "utf8"))
        .filter((s) => !s.startsWith(".") && s !== "zod")
        .map((specifier) => `${relative(SRC, file)} imports ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("names the forbidden modules the spec lists", () => {
    for (const s of [
      "server-only",
      "next",
      "next/cache",
      "react",
      "react-native",
      "expo-image",
      "@supabase/supabase-js",
    ]) {
      expect(isForbiddenSpecifier(s), s).toBe(true);
    }
    expect(isForbiddenSpecifier("zod")).toBe(false);
  });

  it("spots an environment read in either spelling", () => {
    expect(READS_ENV.test("process.env.X")).toBe(true);
    expect(READS_ENV.test('process["env"].X')).toBe(true);
    expect(READS_ENV.test("processing.envelope")).toBe(false);
  });
});
