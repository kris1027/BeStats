import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isDotfile,
  readWorkspaceFile,
  WORKSPACE_ROOT,
  workspaceFiles,
} from "./workspace-files";

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
 *
 * "The repository" is the whole workspace, found from this file rather than the
 * working directory, so `apps/mobile` and `packages/core` are scanned too and a
 * test run from `apps/web` still sees them (spec 0034, Tooling). Paths are
 * reported relative to the workspace root.
 */
/** The web app's folder, relative to the workspace root. */
const WEB = "apps/web";

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

/** The web app's committed example env file, the one IGDB must be listed in. */
const ENV_EXAMPLE = `${WEB}/.env.example`;

/**
 * Code, scripts and config. JSON is here because Expo sets build env in
 * `app.json` and `eas.json`, exactly where an `EXPO_PUBLIC_` secret would land.
 */
const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".sh",
  "",
]);

/**
 * Every committed example env file, in any app or package. Dotted, so the
 * extension match would skip them; matched by name instead, so a later
 * `apps/mobile/.env.example` is scanned the day it appears.
 */
const ENV_EXAMPLE_NAME = /(^|\/)\.env\.example$/;

/** A test file names the thing it forbids, so scanning one is a false alarm. */
function isTest(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function scannedPaths(): string[] {
  return workspaceFiles({
    skipDirs: EXCLUDED_DIRS,
    keep: (path) =>
      ENV_EXAMPLE_NAME.test(path) ||
      (!isDotfile(path) &&
        SCANNED_EXTENSIONS.has(extname(path)) &&
        !isTest(path)),
  });
}

function offenders(needle: string): string[] {
  return scannedPaths().filter((path) =>
    readWorkspaceFile(path).toLowerCase().includes(needle),
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
    expect(scannedPaths()).toContain(`${WEB}/proxy.ts`);
  });

  it("scans the committed example env file", () => {
    expect(scannedPaths()).toContain(ENV_EXAMPLE);
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
  `${WEB}/lib/tmdb/env.ts`,
  `${WEB}/lib/tmdb/tmdb.live.ts`,
  ENV_EXAMPLE,
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

  it("is never given an EXPO_PUBLIC_ prefix, which bakes it into the app", () => {
    expect(offenders("expo_public_tmdb")).toEqual([]);
  });
});

/**
 * Spec 0023 AC-2: the Twitch app credentials behind IGDB are server only, and
 * only the IGDB module's environment reader names them (the live check loads
 * them through it, so it does not name them either).
 */
const IGDB_VARIABLES = ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"];
const IGDB_READERS = new Set([`${WEB}/lib/igdb/env.ts`, ENV_EXAMPLE]);

describe("the IGDB credential boundary", () => {
  it.each(IGDB_VARIABLES)("%s is read only by its env reader", (variable) => {
    const named = offenders(variable.toLowerCase()).filter(
      (path) => !IGDB_READERS.has(path),
    );
    expect(named).toEqual([]);
  });

  it("is never given a NEXT_PUBLIC_ prefix, which would publish it", () => {
    expect(offenders("next_public_igdb")).toEqual([]);
  });

  it("is never given an EXPO_PUBLIC_ prefix, which bakes it into the app", () => {
    expect(offenders("expo_public_igdb")).toEqual([]);
  });

  it("is listed in .env.example", () => {
    const example = readWorkspaceFile(ENV_EXAMPLE);
    for (const variable of IGDB_VARIABLES) {
      expect(example).toContain(`${variable}=`);
    }
  });
});

/**
 * Spec 0032 AC-12: the games library flag is gone, so games are simply on.
 * Any tracked file outside `docs/` that still names it, a test included, is a
 * leftover branch or a stale instruction. Built from fragments so this file
 * does not match its own search; `docs/` keeps the history of specs 0027 to
 * 0032.
 */
const GAMES_FLAG = ["NEXT_PUBLIC", "GAMES", "LIBRARY"].join("_");

describe("the removed games flag", () => {
  it("is named by no tracked file outside docs/", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    })
      .split("\0")
      .filter(
        (path) =>
          path !== "" &&
          !path.startsWith("docs/") &&
          path !== `${WEB}/security-boundary.test.ts` &&
          statSync(join(WORKSPACE_ROOT, path), {
            throwIfNoEntry: false,
          })?.isFile(),
      );
    const named = tracked.filter((path) =>
      readWorkspaceFile(path).includes(GAMES_FLAG),
    );
    expect(named).toEqual([]);
  });
});
