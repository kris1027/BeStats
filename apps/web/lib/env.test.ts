import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAuthEmailDelivery,
  getPublicEnv,
  publicEnvProblems,
} from "@/lib/env";

/**
 * covers: spec 0005, public catalog without auth configuration
 *
 * The proxy and the navbar account slot run on every page and fall back to a
 * signed out experience when this reports a problem. It must judge exactly
 * what `getPublicEnv()` judges: a narrower check once let an environment with
 * the Supabase keys but no site URL through, and every public page then
 * returned 500.
 */

function stubEnv(values: Record<string, string>) {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    vi.stubEnv(name, values[name]);
  }
}

const COMPLETE = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicEnvProblems", () => {
  it("reports nothing for a complete configuration", () => {
    stubEnv(COMPLETE);
    expect(publicEnvProblems()).toBeNull();
    expect(() => getPublicEnv()).not.toThrow();
  });

  it("reports a missing site URL even when the Supabase keys are set", () => {
    const { NEXT_PUBLIC_SITE_URL: _, ...supabaseOnly } = COMPLETE;
    stubEnv(supabaseOnly);

    expect(publicEnvProblems()).toContain("NEXT_PUBLIC_SITE_URL");
    expect(() => getPublicEnv()).toThrow();
  });

  it("reports a clone with nothing configured", () => {
    stubEnv({});
    expect(publicEnvProblems()).not.toBeNull();
  });

  it("never includes a value in the message, so it is safe to log", () => {
    stubEnv({ ...COMPLETE, NEXT_PUBLIC_SUPABASE_URL: "not-a-url-secret" });
    expect(publicEnvProblems()).not.toContain("not-a-url-secret");
  });
});

/**
 * covers: spec 0018, AC-10
 *
 * Every surface that sends or promises an auth email reads this one switch.
 * Production has no email yet, so anything short of a deliberate `on` must
 * read as `off`, and a typo must fail loudly rather than pick a side.
 */
describe("getAuthEmailDelivery", () => {
  it("reads unset as off", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", undefined);
    expect(getAuthEmailDelivery()).toBe("off");
  });

  it("reads empty as off", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "");
    expect(getAuthEmailDelivery()).toBe("off");
  });

  it.each(["on", "off"] as const)("returns %s as given", (value) => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", value);
    expect(getAuthEmailDelivery()).toBe(value);
  });

  it("throws on anything else, naming the variable and never the value", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_EMAIL_DELIVERY", "yes-please");

    expect(() => getAuthEmailDelivery()).toThrow(
      "NEXT_PUBLIC_AUTH_EMAIL_DELIVERY",
    );
    expect(() => getAuthEmailDelivery()).not.toThrow("yes-please");
  });
});
