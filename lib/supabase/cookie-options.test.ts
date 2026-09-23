import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * covers: spec 0005, AC-25
 *
 * `Secure` follows the site URL the build was made with, so the local `http`
 * origin still gets a cookie and the deployed `https` origin always gets a
 * secure one. Locally this unit test is the only proof of the `https` half
 * until feature 20 checks the deployed origin.
 */

function stubSiteUrl(url: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly but not Secure on an http site URL", () => {
    stubSiteUrl("http://localhost:3000");
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: false });
  });

  it("is HttpOnly and Secure on an https site URL", () => {
    stubSiteUrl("https://bestats.example");
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: true });
  });

  it("returns only the two flags, never name, maxAge or domain", () => {
    stubSiteUrl("https://bestats.example/");
    expect(Object.keys(sessionCookieOptions()).sort()).toEqual([
      "httpOnly",
      "secure",
    ]);
  });
});
