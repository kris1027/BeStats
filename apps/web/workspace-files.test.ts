import { describe, expect, it } from "vitest";

import { GENERATED_DIRS, workspaceFiles } from "./workspace-files";

/**
 * The walker skips Expo's generated native folders by path and nothing else by
 * that name, so a boundary scan never times out on a local `ios/Pods` and never
 * loses real code to a folder called `ios` (AGENTS.md section 11).
 */
describe("workspaceFiles", () => {
  const mobile = workspaceFiles({
    roots: ["apps/mobile"],
    skipDirs: new Set(["node_modules"]),
    keep: () => true,
  });

  it("never lists a file under a generated native folder", () => {
    const generated = mobile.filter((path) =>
      [...GENERATED_DIRS].some((dir) => path.startsWith(`${dir}/`)),
    );
    expect(generated).toEqual([]);
  });

  it("still lists the mobile app's own source", () => {
    expect(mobile.some((path) => path.startsWith("apps/mobile/src/"))).toBe(
      true,
    );
  });

  it("skips the generated folders by workspace path, not by folder name", () => {
    expect([...GENERATED_DIRS].sort()).toEqual([
      "apps/mobile/android",
      "apps/mobile/ios",
    ]);
  });
});
