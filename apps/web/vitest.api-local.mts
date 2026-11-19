import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The opt in cross user check of `/api/v1` against the local Supabase stack
 * (spec 0035, Security model; AGENTS.md section 11), in its own config so it
 * never runs as part of `pnpm test`: it needs Docker and the seeded users.
 * Run it with `pnpm api:local`, which reads the stack's URL and publishable
 * key from `supabase status` (never the secret key).
 */
const SERVER_ONLY_STUB = fileURLToPath(
  new URL("./node_modules/server-only/empty.js", import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": SERVER_ONLY_STUB },
  },
  test: {
    name: "api-local",
    environment: "node",
    include: ["app/api/v1/**/*.local.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Real round trips to the local stack, run in order on one database.
    testTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
