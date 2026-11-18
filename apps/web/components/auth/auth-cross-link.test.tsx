import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";

import { AuthCrossLink } from "@/components/auth/auth-cross-link";

type Params = Record<string, string | string[] | undefined>;
type Href = "/sign-in" | "/sign-up";

type Rendered = React.ReactElement<{
  fallback: React.ReactElement;
  children: React.ReactElement<Record<string, unknown>>;
}>;

/**
 * Resolves the link the way the server does. jsdom's client renderer does not
 * reliably commit an async Server Component, so the Suspense element this
 * returns is opened by hand: its async child is awaited as the function it is,
 * and the element that comes back is rendered. That runs the real `next`
 * handling, with no copy of it in the test.
 */
async function resolvedLink(href: Href, params: Params): Promise<HTMLElement> {
  const boundary = AuthCrossLink({
    href,
    searchParams: Promise.resolve(params),
    children: "Go",
  }) as Rendered;
  const child = boundary.props.children;
  const resolve = child.type as (
    props: Record<string, unknown>,
  ) => Promise<React.ReactElement>;

  render(await resolve(child.props));
  return screen.getByRole("link", { name: "Go" });
}

async function resolvedHref(href: Href, params: Params) {
  return (await resolvedLink(href, params)).getAttribute("href");
}

/**
 * covers: spec 0005, AC-10, AC-11
 *
 * The footer link is how someone sent to sign in from a private page detours
 * through sign up and still lands back on that page (AC-10). The same link must
 * never echo an unsafe `next`, or it becomes an open redirect vector (AC-11).
 */
describe("AuthCrossLink", () => {
  it("carries a safe next from sign in to sign up (AC-10)", async () => {
    expect(await resolvedHref("/sign-up", { next: "/account" })).toBe(
      "/sign-up?next=%2Faccount",
    );
  });

  it("carries a safe next from sign up back to sign in (AC-10)", async () => {
    expect(await resolvedHref("/sign-in", { next: "/watchlist" })).toBe(
      "/sign-in?next=%2Fwatchlist",
    );
  });

  it("encodes a next that has its own query string", async () => {
    expect(
      await resolvedHref("/sign-up", { next: "/search?q=a&type=tv" }),
    ).toBe(`/sign-up?next=${encodeURIComponent("/search?q=a&type=tv")}`);
  });

  it("links plainly when there is no next", async () => {
    expect(await resolvedHref("/sign-up", {})).toBe("/sign-up");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "shows",
  ])(
    "drops the unsafe next %s rather than echoing it (AC-11)",
    async (next) => {
      expect(await resolvedHref("/sign-up", { next })).toBe("/sign-up");
    },
  );

  it("ignores a repeated next, which arrives as an array", async () => {
    expect(
      await resolvedHref("/sign-in", { next: ["/account", "/watchlist"] }),
    ).toBe("/sign-in");
  });

  it("paints a plain working link while the query string resolves", () => {
    // The footer is in the static shell; its fallback must already be a real
    // link to the other page, just without `next`.
    const boundary = AuthCrossLink({
      href: "/sign-up",
      searchParams: new Promise(() => {}),
      children: "Go",
    }) as Rendered;

    render(boundary.props.fallback);

    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });
});
