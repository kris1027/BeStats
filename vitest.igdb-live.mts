import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The opt in live IGDB check, in its own config so it never runs as part of
 * `pnpm test` and never runs or labels itself as the TMDB check (spec 0023,
 * AC-18). `vitest.live.mts` is narrowed to `lib/tmdb` for the same reason.
 *
 * Run it with `pnpm igdb:live`. With no Twitch credentials it skips.
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
    name: "igdb-live",
    environment: "node",
    include: ["lib/igdb/**/*.live.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Real round trips through a limiter spacing requests 250 ms apart.
    testTimeout: 60_000,
  },
});
