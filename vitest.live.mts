import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The opt in live TMDB check, deliberately in its own config so it can never
 * run as part of `pnpm test`.
 *
 * Spec 0002's AC-24 asks for exactly this separation: the fixture suite is the
 * suite, and this one only answers "does TMDB still send what the schemas
 * expect?". Its result is never a substitute for the fixture tests, and the
 * fixture tests are never reported as a live integration result.
 *
 * Run it with `pnpm tmdb:live`. With no token configured it skips.
 */
const SERVER_ONLY_STUB = fileURLToPath(
  new URL("./node_modules/server-only/empty.js", import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": SERVER_ONLY_STUB,
    },
  },
  test: {
    name: "tmdb-live",
    environment: "node",
    include: ["**/*.live.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // A real network round trip, several of them, against a rate limited API.
    testTimeout: 30_000,
  },
});
