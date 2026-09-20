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
 * The scan covers the repo root as well as the scanned directories. `proxy.ts`
 * sits at the root and builds a Supabase client on every request, so leaving
 * the root out would have left the most exposed file in the project unchecked.
 */

/** Built from fragments so this file does not match its own search. */
const FORBIDDEN = ["service", "role"].join("_");
const FORBIDDEN_KEY_PREFIX = ["sb", "secret"].join("_");

const SCANNED_DIRS = ["app", "lib", "scripts"];
const SCANNED_FILES = [".env.example"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".sh", ""]);

/** Every scannable file under a directory, recursively, skipping build output. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (SCANNED_EXTENSIONS.has(extname(path))) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Scannable files sitting at the repo root, not under any scanned directory.
 * `proxy.ts` lives here and builds a Supabase client on every request
 * (AGENTS.md, "Commands and repo facts"), so a root-only scan is not padding:
 * it is the single most request-facing file in the project.
 */
function rootFiles(): string[] {
  return readdirSync(".")
    .filter((entry) => !entry.startsWith("."))
    .filter((entry) => !statSync(entry).isDirectory())
    .filter((entry) => SCANNED_EXTENSIONS.has(extname(entry)));
}

function scannedPaths(): string[] {
  return [
    ...SCANNED_DIRS.flatMap(filesUnder),
    ...rootFiles(),
    ...SCANNED_FILES,
  ].filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
}

function offenders(needle: string): string[] {
  return scannedPaths().filter((path) =>
    readFileSync(path, "utf8").toLowerCase().includes(needle),
  );
}

describe("the service role boundary", () => {
  it("never names the service role in app, lib, scripts, the repo root or .env.example", () => {
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
