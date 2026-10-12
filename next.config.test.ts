import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends / to /shows", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "on");
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual(
      expect.objectContaining({ source: "/", destination: "/shows" }),
    );
    expect(redirects).not.toContainEqual(
      expect.objectContaining({ source: "/check-email" }),
    );
  });

  /** covers: spec 0021, AC-14 */
  it.each([
    ["/shows", "/shows/popular"],
    ["/movies", "/movies/popular"],
  ])("sends %s with a page to %s, permanently", async (source, destination) => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source,
      has: [{ type: "query", key: "page" }],
      destination,
      permanent: true,
    });
  });

  it("redirects a landing only when it carries a page (spec 0021, AC-14)", async () => {
    const redirects = await nextConfig.redirects?.();

    for (const redirect of redirects ?? []) {
      if (redirect.source === "/shows" || redirect.source === "/movies") {
        expect(redirect.has).toEqual([{ type: "query", key: "page" }]);
      }
    }
  });

  /** covers: spec 0018, AC-13 */
  it("sends /check-email to /sign-in, temporarily, only while email is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "off");
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/check-email",
      destination: "/sign-in",
      permanent: false,
    });
  });

  it("makes the / redirect temporary, so no browser caches it forever", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects?.find((r) => r.source === "/")?.permanent).toBe(false);
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
