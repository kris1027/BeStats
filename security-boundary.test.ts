import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 0001 AC-15: the Supabase service role key appears nowhere in
 * application code and nowhere in `.env.example`. The service role bypasses
 * Row Level Security entirely (AGENTS.md section 5), so one import of it in a
 * request path would undo every policy the rest of this suite proves.
 *
 * `/check verify` greps for this by hand. This locks the same check into the
 * suite, because the failure it guards against arrives quietly, in a later
 * feature, long after anyone thinks to run the grep again.
 *
 * The scan walks the whole repository rather than a list of directories. An
 * allow-list of directories is the wrong shape for a boundary check: the leak
 * this guards against arrives in whichever directory a later feature creates,
 * and a directory nobody remembered to add is exactly where it would sit.
 * Exclusions are therefore explicit and narrow — documentation, design
 * references, generated output and the tests themselves, none of which ship in
 * a request path.
 */

/** Built from fragments so this file does not match its own search. */
const FORBIDDEN = ["service", "role"].join("_");
const FORBIDDEN_KEY_PREFIX = ["sb", "secret"].join("_");

/**
 * Directories skipped at any depth. Dependencies and generated output are not
 * ours to police; documentation, design references and fixtures are prose and
 * sample data that never reach a request. Everything else in the repository is
 * scanned, including directories that do not exist yet.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "coverage",
  "docs",
  "design",
  "public",
  "fixtures",
  "__fixtures__",
]);
/** Dotted, so the directory walk skips it; scanned by name instead. */
const SCANNED_FILES = [".env.example"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".sh", ""]);

/** Every scannable file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry) || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (SCANNED_EXTENSIONS.has(extname(path))) {
      found.push(path);
    }
  }
  return found;
}

/** A test file names the thing it forbids, so scanning one is a false alarm. */
function isTest(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function scannedPaths(): string[] {
  return [...filesUnder("."), ...SCANNED_FILES]
    .map((path) => (path.startsWith("./") ? path.slice(2) : path))
    .filter((path) => !isTest(path));
}

function offenders(needle: string): string[] {
  return scannedPaths().filter((path) =>
    readFileSync(path, "utf8").toLowerCase().includes(needle),
  );
}

describe("the service role boundary", () => {
  it("never names the service role anywhere in the repository or .env.example", () => {
    expect(offenders(FORBIDDEN)).toEqual([]);
  });

  it("never carries a secret key value", () => {
    expect(offenders(FORBIDDEN_KEY_PREFIX)).toEqual([]);
  });

  it("scans a real set of files, so an empty result means something", () => {
    expect(scannedPaths().length).toBeGreaterThan(5);
  });

  it("scans the request-facing root files, proxy.ts above all", () => {
    expect(scannedPaths()).toContain("proxy.ts");
  });
});

/**
 * Spec 0002 AC-2 and AC-3: the TMDB token is server only, and only the TMDB
 * module's own environment reader touches it.
 *
 * The build proves the strong half of this (a Client Component that imports
 * `lib/tmdb` fails to compile, and the token appears nowhere in the client
 * bundle). This locks in the half a build cannot catch: a later feature reading
 * `process.env.TMDB_READ_ACCESS_TOKEN` somewhere else, or giving it a
 * `NEXT_PUBLIC_` prefix, which would inline it into the browser bundle.
 */
const TMDB_TOKEN_VARIABLE = "TMDB_READ_ACCESS_TOKEN";

/**
 * The only files allowed to name the variable: the reader itself, the opt in
 * live check that needs a real credential, and the committed example file.
 */
const TMDB_TOKEN_READERS = new Set([
  "lib/tmdb/env.ts",
  "lib/tmdb/tmdb.live.ts",
  ".env.example",
]);

describe("the TMDB token boundary", () => {
  it("is read only by the TMDB module's own environment reader", () => {
    const named = offenders(TMDB_TOKEN_VARIABLE.toLowerCase()).filter(
      (path) => !TMDB_TOKEN_READERS.has(path),
    );
    expect(named).toEqual([]);
  });

  it("is never given a NEXT_PUBLIC_ prefix, which would publish it", () => {
    expect(offenders("next_public_tmdb")).toEqual([]);
  });
});
