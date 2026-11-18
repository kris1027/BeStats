import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `server-only` is a marker package whose main entry throws the moment it is
 * imported; only Next's `react-server` condition resolves it to the empty
 * module. Vitest resolves the default condition and externalizes the package,
 * so the alias points straight at the empty file instead. Without it every test
 * of a server module would fail at import time on the very guard that keeps the
 * TMDB token off the browser (spec 0002, AC-2).
 */
const SERVER_ONLY_STUB = fileURLToPath(
  new URL("./node_modules/server-only/empty.js", import.meta.url),
);

/**
 * Two projects, one runner. Pure logic (ratings, progress, TMDB normalization)
 * runs in node so it never pays for a simulated DOM; component tests run in
 * jsdom. Spec 0003 fixes the file naming: `*.test.ts` is node, `*.test.tsx` is
 * jsdom, and any other name silently matches no project.
 *
 * `resolve.tsconfigPaths` is what makes the `@/*` alias AGENTS.md requires
 * resolve in BOTH projects; Vite does not read the alias from tsconfig.json on
 * its own, and it defaults to false. Spec 0003 specified the
 * `vite-tsconfig-paths` plugin for this, which Vite 8 replaced with this native
 * option and now warns about. Being top level `resolve` rather than a per
 * project setting is what keeps it applying to node and jsdom alike.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "**/*.config.*",
        ".next/**",
        "supabase/**",
        "**/__fixtures__/**",
      ],
    },
    projects: [
      {
        // `server-only` is a marker package whose default export throws on
        // import; only the `react-server` condition, which Next sets for Server
        // Components, resolves it to an empty module. Without this condition
        // every test of a server module would fail at import time on the very
        // guard that keeps the TMDB token off the browser (spec 0002, AC-2).
        resolve: {
          alias: {
            "server-only": SERVER_ONLY_STUB,
          },
        },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", ".next/**"],
        },
      },
      {
        test: {
          name: "components",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude: ["node_modules/**", ".next/**"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
