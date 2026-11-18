import { afterEach, describe, expect, it, vi } from "vitest";

import { isIndexableDeployment, siteUrl } from "./site";

/**
 * covers: spec 0016, AC-1, AC-2
 *
 * The origin and the deployment gate decide every canonical, the robots rules
 * and whether the sitemap lists anything, so each environment combination is
 * pinned here.
 */
afterEach(() => vi.unstubAllEnvs());

describe("siteUrl (AC-1)", () => {
  it("returns the origin of a valid site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bestats.example");
    expect(siteUrl()).toBe("https://bestats.example");
  });

  it.each([
    "https://bestats.example/",
    "https://bestats.example/some/path/",
    "https://bestats.example/path?x=1#y",
  ])("drops the path, query and trailing slash of %s", (value) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
    expect(siteUrl()).toBe("https://bestats.example");
  });

  it("keeps a port", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it.each([undefined, "", "not a url", "bestats.example"])(
    "returns null for %s without throwing",
    (value) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      expect(siteUrl()).toBeNull();
    },
  );

  it.each([
    "ftp://bestats.example",
    "ws://bestats.example",
    "file:///etc/hosts",
    "mailto:team@bestats.example",
  ])("returns null for the non web scheme %s", (value) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
    expect(siteUrl()).toBeNull();
  });

  it("does not depend on the Supabase keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bestats.example");
    expect(siteUrl()).toBe("https://bestats.example");
  });
});

describe("isIndexableDeployment (AC-2)", () => {
  it("is true on production with a site URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bestats.example");
    expect(isIndexableDeployment()).toBe(true);
  });

  it.each([undefined, "preview", "development", "Production"])(
    "is false when VERCEL_ENV is %s",
    (value) => {
      vi.stubEnv("VERCEL_ENV", value);
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bestats.example");
      expect(isIndexableDeployment()).toBe(false);
    },
  );

  it("is false on production with no valid site URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "nope");
    expect(isIndexableDeployment()).toBe(false);
  });
});
