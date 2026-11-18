import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0005, AC-25
 *
 * Every Supabase server client must write its cookies `HttpOnly`, and the flags
 * come from one shared function. The failure this guards against is silent: a
 * third `createServerClient` call, or a `setAll` that drops `options`, writes
 * the session back script readable and nothing type checks or errors.
 *
 * It walks the source directories rather than naming the two call sites that
 * exist today, in the shape of `app/layout-purity.test.ts`, so a new call site
 * cannot slip past it.
 */

const SCANNED_DIRS = ["app", "lib", "components"];
const SCANNED_FILES = ["proxy.ts"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const THIS_FILE = "lib/supabase/cookie-boundary.test.ts";

/** Every TypeScript file under a directory, recursively. */
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

const SOURCES = [...SCANNED_DIRS.flatMap(filesUnder), ...SCANNED_FILES]
  .filter((path) => path !== THIS_FILE)
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));

/** A call, with or without a generic, not the import of the name. */
const CLIENT_CALL = /createServerClient\s*(?:<[^>]*>)?\s*\(/g;
const SHARED_OPTIONS = "cookieOptions: sessionCookieOptions()";

/**
 * The writes that reach the browser. The proxy's `request.cookies.set` is left
 * out on purpose: it only feeds the rest of the same request.
 */
const BROWSER_WRITE = /(?:cookieStore|response\.cookies)\.set\(([^)]*)\)/g;

/**
 * Built from fragments so this file does not match its own search. The
 * relative form counts only inside `lib/supabase/`, since `lib/tmdb/` has a
 * `./client` of its own.
 */
const CLIENT_NAME = ["cli", "ent"].join("");
const BROWSER_CLIENT_IMPORT = new RegExp(
  `from\\s+["']@/lib/supabase/${CLIENT_NAME}["']`,
);
const RELATIVE_CLIENT_IMPORT = new RegExp(`from\\s+["']\\./${CLIENT_NAME}["']`);

const clientFiles = SOURCES.filter(
  ({ source }) => (source.match(CLIENT_CALL)?.length ?? 0) > 0,
);

describe("Supabase session cookies stay HttpOnly (AC-25)", () => {
  it("finds the server client call sites, so the checks below are not vacuous", () => {
    expect(clientFiles.map(({ path }) => path).sort()).toEqual(
      expect.arrayContaining(["lib/supabase/server.ts", "proxy.ts"]),
    );
  });

  it.each(clientFiles)(
    "$path passes the shared cookie options to every createServerClient call",
    ({ source }) => {
      const calls = source.match(CLIENT_CALL)?.length ?? 0;
      const withOptions = source.split(SHARED_OPTIONS).length - 1;

      expect(withOptions).toBeGreaterThanOrEqual(calls);
      expect(source).toContain('from "@/lib/supabase/cookie-options"');
    },
  );

  it.each(clientFiles)(
    "$path forwards options on every cookie it writes in setAll",
    ({ source }) => {
      const writes = [...source.matchAll(BROWSER_WRITE)];

      expect(writes.length).toBeGreaterThan(0);
      for (const [call, args] of writes) {
        const parts = args.split(",").map((part) => part.trim());
        expect(parts, `${call} must pass options`).toHaveLength(3);
        expect(parts[2], `${call} must pass options`).toBe("options");
      }
    },
  );

  it("imports the browser client nowhere, since it cannot see the session", () => {
    const importers = SOURCES.filter(
      ({ path, source }) =>
        path !== "lib/supabase/client.test.ts" &&
        (BROWSER_CLIENT_IMPORT.test(source) ||
          (path.startsWith("lib/supabase/") &&
            RELATIVE_CLIENT_IMPORT.test(source))),
    ).map(({ path }) => path);

    expect(importers).toEqual([]);
  });
});
