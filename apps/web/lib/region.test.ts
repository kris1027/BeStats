import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0022, AC-9
 *
 * The one place the country header is read: it goes through `parseRegion`,
 * so a real country is named and anything else falls back to the United
 * States. `next/headers` is the boundary and is replaced; the parsing is real.
 */
const header = vi.fn<(name: string) => string | null>();

/** Answers each header from `values`, and null for any other. */
function headersOf(values: Record<string, string>) {
  header.mockImplementation((name) => values[name] ?? null);
}

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => header(name) }),
}));

const { getVisitorRegion, regionFromHeaders } = await import("./region");

afterEach(() => {
  header.mockReset();
});

describe("getVisitorRegion", () => {
  it("reads Vercel's country header and names the country", async () => {
    header.mockReturnValue("PL");

    const region = await getVisitorRegion();

    expect(header).toHaveBeenCalledWith("x-vercel-ip-country");
    expect(region).toEqual({ code: "PL", name: "Poland" });
  });

  it.each<[string | null, string]>([
    [null, "no header, as on a local run"],
    ["XX", "Vercel's unknown country"],
    ["pl", "a lower case code"],
  ])("falls back to the United States for %j (%s)", async (value) => {
    header.mockReturnValue(value);

    await expect(getVisitorRegion()).resolves.toEqual({
      code: "US",
      name: "United States",
    });
  });
});

/**
 * covers: prompts/netlify-mirror.md, decision 7
 *
 * The same build runs on Vercel and on the Netlify backup host, which names
 * the country `x-country`.
 */
describe("the country header on either host", () => {
  it("reads Netlify's country header when Vercel's is absent", async () => {
    headersOf({ "x-country": "PL" });

    await expect(getVisitorRegion()).resolves.toEqual({
      code: "PL",
      name: "Poland",
    });
  });

  it("prefers Vercel's header when both are present", () => {
    const region = regionFromHeaders(
      new Headers({ "x-vercel-ip-country": "DE", "x-country": "PL" }),
    );

    expect(region.code).toBe("DE");
  });

  it("falls back to the United States with neither header", () => {
    expect(regionFromHeaders(new Headers()).code).toBe("US");
  });
});
