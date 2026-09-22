import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
