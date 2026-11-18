import { defineConfig } from "vitest/config";

/**
 * Core is pure TypeScript with no components, so one node project covers it
 * (spec 0034). Its suites moved here with their files from `apps/web/lib`.
 */
export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
