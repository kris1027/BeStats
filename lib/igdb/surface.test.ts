import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * The module's surface (spec 0023, AC-2, AC-20): `index.ts` exports exactly
 * the reads, `isIgdbNotFound` and the two error classes at runtime, and every
 * file with state or a request in it is server only.
 */

vi.mock("next/cache", () => ({ cacheLife: () => {} }));

const index = await import("./index");

describe("lib/igdb/index.ts", () => {
  it("exports exactly the reads, isIgdbNotFound and the error classes", () => {
    expect(Object.keys(index).sort()).toEqual(
      [
        "IgdbError",
        "IgdbValidationError",
        "discoverGames",
        "getGame",
        "getGameGenres",
        "getGamePlatforms",
        "getGamesByIds",
        "isIgdbNotFound",
        "searchGames",
      ].sort(),
    );
  });
});

/** Pure files, free of `server-only` so the live check and tests read them. */
const PURE = new Set([
  "catalog-filter.ts",
  "constants.ts",
  "errors.ts",
  "query.ts",
  "types.ts",
  "validation.ts",
  "igdb.live.ts",
]);

describe("server only", () => {
  it("imports server-only in every file that is not a pure helper", () => {
    const dir = join("lib", "igdb");
    const missing = readdirSync(dir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => !PURE.has(file))
      .filter(
        (file) =>
          !readFileSync(join(dir, file), "utf8").startsWith(
            'import "server-only";',
          ),
      );
    expect(missing).toEqual([]);
  });
});
