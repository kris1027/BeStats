import { readFileSync } from "node:fs";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "./proxy";

/**
 * covers: spec 0005, AC-10, AC-17
 *
 * The proxy guard must redirect a navigation and must not touch a Server
 * Action. That distinction is not obvious and it was not free: answering an
 * action POST with a redirect replaced the page with a raw payload, so the
 * change password form showed a blank screen instead of "your session has
 * ended, nothing was saved". Nothing type checks the difference, and the symptom
 * only appears when a session dies between render and submit, which nobody
 * tests by hand.
 *
 * A source assertion rather than a rendered one, because the thing being
 * protected is the shape of the guard. Running the proxy needs a request, a
 * Supabase project and a live session; the invariant does not.
 */
const PROXY = readFileSync("proxy.ts", "utf8");

describe("the proxy guard (AC-10, AC-17)", () => {
  it("guards only GET, so a Server Action POST is never redirected", () => {
    expect(PROXY).toMatch(/request\.method\s*===\s*"GET"/);

    // The method check has to gate the redirect itself, not sit unused nearby.
    expect(PROXY).toMatch(
      /if\s*\(\s*isNavigation\s*&&\s*!signedIn\s*&&\s*isPrivatePath\(pathname\)\s*\)/,
    );
  });

  it("still redirects a signed out navigation, carrying the path", () => {
    expect(PROXY).toContain("isPrivatePath(pathname)");
    expect(PROXY).toMatch(/searchParams\.set\(\s*"next"/);
  });

  it("keeps any refreshed session cookie on the redirect", () => {
    // Building a bare redirect here would drop a token that had just been
    // renewed, signing out the very person the guard let through.
    expect(PROXY).toMatch(/response\.cookies\.getAll\(\)/);
  });

  it("reads the private list rather than restating it", () => {
    // A second copy of the prefixes here would drift from the one features 9,
    // 14 and 15 register in.
    expect(PROXY).toContain('from "@/lib/auth/private-paths"');
    expect(PROXY).not.toMatch(/"\/watchlist"|"\/upcoming"|"\/watched"/);
  });
});

/**
 * covers: public catalog without auth configuration
 *
 * Run for real rather than read as source, because the bug was a mismatch
 * between two checks, not the shape of either. With the Supabase keys set and
 * the site URL missing, the proxy used to pass its own "not configured" check
 * and then throw from `getPublicEnv()` on every request, `/shows` included.
 */
describe("the proxy with incomplete auth configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["nothing configured", {}],
    [
      "the Supabase keys but no site URL",
      {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
    ],
  ])("still serves the public catalog with %s", async (_, env) => {
    const values: Record<string, string> = env;
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]) {
      vi.stubEnv(name, values[name]);
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest("http://localhost/shows"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

/**
 * covers: spec 0006, AC-8; spec 0009, AC-13
 *
 * Run for real: a malformed movie id, show id or season number must be a 404 decided here, before any
 * Supabase or TMDB call and whether or not auth is configured, because the
 * movie page streams its shell first and cannot change the status afterwards.
 */
describe("the proxy's catalog id rule", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function run(path: string) {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { proxy } = await import("./proxy");
    const response = await proxy(new NextRequest(`http://localhost${path}`));

    expect(fetchSpy).not.toHaveBeenCalled();
    return response;
  }

  it.each([
    "/movies/abc",
    "/movies/0123",
    "/movies/0",
    "/movies/-2",
    "/movies/2147483648",
    "/movies/550.jpg",
    // spec 0009, AC-13
    "/shows/abc",
    "/shows/0",
    "/shows/01396",
    "/shows/1396.jpg",
    "/shows/abc/season/1",
    "/shows/1396/season/01",
    "/shows/1396/season/00",
    "/shows/1396/season/-1",
    "/shows/1396/season/1.0",
    "/shows/1396/season/10000",
    "/shows/1396/season/x",
  ])("answers %s with a 404 rewrite", async (path) => {
    const response = await run(path);

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/_catalog-not-found",
    );
  });

  it.each(["/movies/%2B550", "/movies/%20550", "/movies/%E0%A4%A"])(
    "decodes %s before judging it, and answers 404",
    async (path) => {
      const response = await run(path);

      expect(response.status).toBe(404);
    },
  );

  it.each([
    "/shows/%2B1396",
    "/shows/%E0%A4%A",
    "/shows/1396/season/%2B1",
    "/shows/1396/season/%E0%A4%A",
  ])(
    "decodes the show path %s before judging it, and answers 404",
    async (path) => {
      const response = await run(path);

      expect(response.status).toBe(404);
    },
  );

  it("lets a percent encoded canonical show and season through", async () => {
    const response = await run("/shows/%31%33%39%36/season/%32");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets a percent encoded canonical id through", async () => {
    const response = await run("/movies/%35%35%30");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it.each([
    "/movies/550",
    "/movies",
    "/movies/550/extra",
    "/shows",
    "/shows/1396",
    "/shows/1396/season/0",
    "/shows/1396/season/2",
    "/shows/1396/season/9999",
    "/shows/1396/season",
    "/shows/1396/season/2/extra",
  ])("lets %s through untouched", async (path) => {
    const response = await run(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("decides before the auth configuration check", () => {
    expect(PROXY.indexOf("malformedCatalogResponse(request)")).toBeLessThan(
      PROXY.indexOf("publicEnvProblems()"),
    );
  });
});

/**
 * covers: spec 0006, AC-8; spec 0009, AC-13
 *
 * The matcher decides whether the proxy runs at all, so a movie path that
 * looks like an image file must still reach the malformed id rule, while real
 * static files keep skipping the proxy.
 */
describe("the proxy matcher", () => {
  function matches(url: string) {
    return unstable_doesMiddlewareMatch({ config, url });
  }

  it.each([
    "/movies/550.jpg",
    "/movies/550.png",
    "/movies/x.svg",
    "/shows/1396.jpg",
    "/shows/1396/season/1.png",
  ])("runs for %s so it can answer 404", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.svg",
    "/images/poster.webp",
  ])("skips the static file %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  // covers: spec 0010, AC-20. A session refresh on a Route Handler could add
  // Set-Cookie to a response the CDN is meant to share.
  it.each(["/api/search", "/api/search?type=tv&q=dune"])(
    "skips the Route Handler %s",
    (url) => {
      expect(matches(url)).toBe(false);
    },
  );

  it.each(["/search", "/search?q=api/"])("still runs for %s", (url) => {
    expect(matches(url)).toBe(true);
  });
});
