import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * covers: spec 0005, AC-14
 *
 * The account control is the only thing in the shared layout tree allowed to
 * read a request scoped value. Everything else must stay prerenderable, because
 * one `cookies()` call anywhere in that tree makes every route dynamic and
 * costs `/shows` and `/movies` the instant static shells feature 5 established.
 *
 * That failure is silent. Nothing type checks it, nothing errors, and the only
 * visible symptom is a slower first paint on pages nobody was editing. So the
 * rule is locked here rather than left to review: the layout and the shell
 * components it renders are scanned for the dynamic APIs and for a Supabase
 * client, and `account-slot.tsx` is the one file exempt.
 *
 * A grep, not a render, on purpose. The thing being asserted is which modules
 * are allowed to reach for request state, which is a property of the source,
 * not of one rendered tree. jsdom would happily render a layout that had lost
 * its static shell.
 */

/** The shared layout tree: the root layout and every shell piece it renders. */
const LAYOUT_TREE = [
  "app/layout.tsx",
  "components/layout/navbar.tsx",
  "components/layout/media-type-tabs.tsx",
  "components/layout/mobile-menu-sheet.tsx",
  // Rendered inside the account slot rather than the layout, but it sits in
  // the shell on every page, so it is held to the same rule (spec 0008).
  "components/layout/library-nav.tsx",
];

/**
 * The one exception, and the reason the boundary exists at all. It reads the
 * session, so `app/layout.tsx` wraps it in a Suspense boundary; nothing else in
 * the tree may.
 */
const ACCOUNT_SLOT = "components/layout/account-slot.tsx";

/**
 * Reading any of these makes a component request scoped, which is what pulls a
 * route out of its static shell under `cacheComponents`.
 */
const DYNAMIC_APIS = [
  "cookies(",
  "headers(",
  "draftMode(",
  "@/lib/supabase/server",
  "@/lib/auth/user",
];

describe("the shared layout tree stays prerenderable (AC-14)", () => {
  it.each(LAYOUT_TREE)("%s reads no request scoped value", (path) => {
    const source = readFileSync(path, "utf8");

    for (const api of DYNAMIC_APIS) {
      expect(source, `${path} must not reach for ${api}`).not.toContain(api);
    }
  });

  it("keeps the account slot behind a Suspense boundary in the layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");

    expect(layout).toContain("AccountSlot");
    expect(layout).toContain("Suspense");
    // The boundary has to wrap the slot, not merely exist somewhere in the
    // file: an unwrapped slot loses the static shell just the same.
    expect(layout).toMatch(/<Suspense[\s\S]*?<AccountSlot[\s\S]*?<\/Suspense>/);
    // Spec 0008 splits the slot in two, one per navbar layout. Each instance
    // needs its own boundary.
    expect(
      layout.match(/<AccountSlot variant="\w+" \/>\s*<\/Suspense>/g),
    ).toHaveLength(2);
  });

  it("is the account slot, and only it, that reads the session", () => {
    const source = readFileSync(ACCOUNT_SLOT, "utf8");
    expect(source).toContain("getOptionalUser");
  });
});
