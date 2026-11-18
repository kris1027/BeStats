import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0022, AC-9
 *
 * The one place the country header is read: it goes through `parseRegion`,
 * so a real country is named and anything else falls back to the United
 * States. `next/headers` is the boundary and is replaced; the parsing is real.
 */
const header = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => header(name) }),
}));

const { getVisitorRegion } = await import("./region");

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
