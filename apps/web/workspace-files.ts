import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The workspace root, found from this file rather than the working directory,
 * so a boundary test sees every app and package whichever folder vitest runs
 * from (AGENTS.md, Commands and repo facts; spec 0034, Tooling).
 */
export const WORKSPACE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Generated native projects, skipped by every scan whatever its `skipDirs`.
 * Expo's Continuous Native Generation writes `ios/` and `android/` from
 * `app.json` and config plugins; they are gitignored, never edited by hand
 * (apps/mobile/AGENTS.md) and absent in CI, while a local iOS build leaves
 * gigabytes of CocoaPods in `ios/Pods` that time the scans out. Matched by
 * workspace relative path, not by name, so a real folder called `ios` anywhere
 * else is still scanned (AGENTS.md section 11).
 */
export const GENERATED_DIRS: ReadonlySet<string> = new Set([
  "apps/mobile/ios",
  "apps/mobile/android",
]);

/**
 * Every file under the given workspace folders that `keep` accepts, as paths
 * relative to the workspace root, so the boundary scans (AGENTS.md section 11)
 * walk the tree one way and differ only in what they skip and keep.
 *
 * Dotted folders (`.next`, `.git`, `.vercel`) and `GENERATED_DIRS` are never
 * entered. Dotted files
 * reach `keep` like any other, because one of them (`.env.example`) is exactly
 * where a leaked secret would be written; each caller decides.
 */
export function workspaceFiles(options: {
  /** Folder names skipped at any depth. */
  skipDirs: ReadonlySet<string>;
  /** Decides per file, given its workspace relative path. */
  keep: (path: string) => boolean;
  /** Workspace relative folders to start from; the whole workspace by default. */
  roots?: readonly string[];
}): string[] {
  const { skipDirs, keep, roots = ["."] } = options;

  function walk(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const rel = relative(WORKSPACE_ROOT, path);
      if (statSync(path).isDirectory()) {
        if (skipDirs.has(entry) || entry.startsWith(".")) continue;
        if (GENERATED_DIRS.has(rel)) continue;
        found.push(...walk(path));
      } else if (keep(rel)) {
        found.push(rel);
      }
    }
    return found;
  }

  return roots
    .map((root) => join(WORKSPACE_ROOT, root))
    .filter((root) => statSync(root, { throwIfNoEntry: false })?.isDirectory())
    .flatMap(walk);
}

/** Reads a file by its workspace relative path, as `workspaceFiles` lists it. */
export function readWorkspaceFile(path: string): string {
  return readFileSync(join(WORKSPACE_ROOT, path), "utf8");
}

/**
 * True for a dotted file name. The scans skip these unless they ask for one by
 * name, which keeps `.gitignore` and friends out of an extension match on "".
 */
export function isDotfile(path: string): boolean {
  return basename(path).startsWith(".");
}
