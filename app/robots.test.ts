import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "./robots";

/**
 * covers: spec 0016, AC-4, AC-5
 *
 * Only the production deployment lets crawlers in; every other deployment
 * shuts them out and names no sitemap.
 */
const ORIGIN = "https://bestats.example";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("allows the catalog and names the sitemap on production (AC-4)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `${ORIGIN}/`);

    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
      sitemap: `${ORIGIN}/sitemap.xml`,
    });
  });

  it("does not disallow private or sign in pages, so their noindex is read (AC-4)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);

    const { rules } = robots();
    expect(JSON.stringify(rules)).not.toMatch(
      /watchlist|watched|upcoming|account|sign-in/,
    );
  });

  it.each([
    ["a preview", "preview", ORIGIN],
    ["a local run", undefined, ORIGIN],
    ["production with no site URL", "production", undefined],
  ])("disallows everything on %s (AC-5)", (_, vercelEnv, site) => {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
