import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Proves the node project runs and that the `@/*` alias resolves in it.
 * Spec 0003 calls the alias the single easiest thing to get wrong here: Vite
 * does not read it from tsconfig.json, so without the top level
 * `vite-tsconfig-paths` plugin every `@/lib/...` import in a test fails.
 */
describe("vitest node project", () => {
  it("resolves the @/* alias", () => {
    expect(cn("a", "b")).toBeTypeOf("string");
  });
});
