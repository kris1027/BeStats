import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "./robots";

/**
 * covers: spec 0016, AC-5; prompts/web-off-keep-api.md
 *
 * The website is off, so every deployment, production included, shuts
 * crawlers out and names no sitemap.
 */
const ORIGIN = "https://bestats.example";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it.each([
    ["production", "production", ORIGIN],
    ["a preview", "preview", ORIGIN],
    ["a local run", undefined, ORIGIN],
    ["production with no site URL", "production", undefined],
  ])(
    "disallows everything and names no sitemap on %s",
    (_, vercelEnv, site) => {
      vi.stubEnv("VERCEL_ENV", vercelEnv);
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);

      expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    },
  );
});
