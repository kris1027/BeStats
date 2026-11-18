import { describe, expect, it } from "vitest";

import { DEFAULT_REGION, parseRegion } from "./region";

/**
 * covers: spec 0022, AC-9
 *
 * The region rule. The request scope boundary around it reads the web app's
 * sources, so it lives beside them in `apps/web/lib/region-boundary.test.ts`.
 */

describe("parseRegion", () => {
  it("names a real two letter country in English", () => {
    expect(parseRegion("PL")).toEqual({ code: "PL", name: "Poland" });
    expect(parseRegion("DE")).toEqual({ code: "DE", name: "Germany" });
  });

  it.each<[string | null | undefined, string]>([
    [null, "missing"],
    [undefined, "missing"],
    ["", "empty"],
    ["pl", "lower case"],
    ["POL", "three letters"],
    ["P1", "a digit"],
    ["XX", "Vercel's unknown country"],
    ["T1", "Tor"],
    ["ZZ", "Unicode's unknown region"],
    ["QQ", "a code nobody can name"],
  ])("falls back to US for %j (%s)", (header) => {
    expect(parseRegion(header)).toEqual(DEFAULT_REGION);
  });

  it("falls back to the United States, named", () => {
    expect(DEFAULT_REGION).toEqual({ code: "US", name: "United States" });
  });
});
