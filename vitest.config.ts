import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Two projects, one runner. Pure logic (ratings, progress, TMDB normalization)
 * runs in node so it never pays for a simulated DOM; component tests run in
 * jsdom. Spec 0003 fixes the file naming: `*.test.ts` is node, `*.test.tsx` is
 * jsdom, and any other name silently matches no project.
 *
 * `tsconfigPaths` is registered at the top level so BOTH projects resolve the
 * `@/*` alias that AGENTS.md requires; Vite does not read it from tsconfig.json.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
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
