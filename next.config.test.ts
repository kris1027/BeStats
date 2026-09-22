import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

/**
 * covers: AC-17, AC-18, AC-8
 *
 * Three routing and image decisions that are one word away from being wrong,
 * where the wrong word is not a crash but a slow, hard to undo problem.
 *
 * `permanent: true` would emit a 308, which browsers cache effectively
 * forever; a real home page later would be fighting every returning visitor's
 * cache, and no amount of redeploying fixes an already cached 308. That is the
 * one this file exists for. The other two pin the remote image host and the
 * Cache Components flag, both of which the rest of the suite quietly assumes.
 */
describe("next.config", () => {
  it("sends / to /shows", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual([
      expect.objectContaining({ source: "/", destination: "/shows" }),
    ]);
  });

  it("makes that redirect temporary, so no browser caches it forever", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects?.[0].permanent).toBe(false);
  });

  it("allows TMDB images and nothing else", () => {
    expect(nextConfig.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ]);
  });

  it("keeps Cache Components on, which every route is written against", () => {
    expect(nextConfig.cacheComponents).toBe(true);
  });
});
