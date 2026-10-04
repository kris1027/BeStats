import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_UNCONFIGURED_MESSAGE } from "@/lib/auth/messages";
import SignUpPage from "./page";

vi.mock("../actions", () => ({
  signUpAction: vi.fn(),
}));

type Element = React.ReactElement<Record<string, unknown>>;

/**
 * The panel's children, read from the element tree. jsdom's client renderer
 * does not reliably commit the async form slot, and the line under test must
 * not depend on it anyway: it is the boundary's sibling, not its child.
 */
function panelChildren(): Element[] {
  const page = SignUpPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  } as PageProps<"/sign-up">) as Element;
  return page.props.children as Element[];
}

/**
 * The acceptance line, found by type rather than position, so a new sibling in
 * the panel (the Google button feature 20 restores) does not break the test.
 */
function termsLine(): Element {
  const line = panelChildren().find((child) => child?.type === "p");
  if (!line) throw new Error("the sign up panel has no terms line");
  return line;
}

/**
 * covers: spec 0017, AC-14
 *
 * The acceptance line has to be in the static shell, so it must sit beside the
 * form's Suspense boundary rather than inside it, and below it, so it also
 * covers the Google button feature 20 restores above the fields.
 */
describe("the sign up terms line", () => {
  it("renders after the form's Suspense boundary, outside it", () => {
    const children = panelChildren();
    const boundary = children.findIndex((child) => child?.type === Suspense);
    const line = children.findIndex((child) => child?.type === "p");

    expect(boundary).toBeGreaterThanOrEqual(0);
    expect(line).toBeGreaterThan(boundary);
  });

  it("links the terms and the privacy policy", () => {
    render(termsLine());

    const paragraph = screen.getByText(/By creating an account/);
    expect(paragraph).toHaveTextContent(
      "By creating an account, you agree to the Terms of Service and acknowledge the Privacy Policy.",
    );
    expect(paragraph).toHaveClass("text-xs", "text-muted-foreground");
    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("asks for no checkbox", () => {
    const { container } = render(termsLine());
    expect(container.querySelector("input")).toBeNull();
  });
});

/**
 * Renders the form slot the way the page's Suspense boundary would, awaiting
 * the async Server Component as a function (see the sign in page test).
 */
async function renderSlot() {
  const boundary = panelChildren().find((child) => child?.type === Suspense);
  if (!boundary) throw new Error("the sign up panel has no form boundary");
  const slot = boundary.props.children as Element;
  const resolve = slot.type as (props: unknown) => Promise<React.ReactElement>;

  render(await resolve(slot.props));
}

/**
 * covers: spec 0018, AC-21
 *
 * A Vercel preview carries no Supabase variables, so the page shows a notice
 * instead of a form that could only fail on submit.
 */
describe("the sign up page without auth configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows the notice instead of the form", async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SITE_URL",
    ]) {
      vi.stubEnv(name, undefined);
    }

    await renderSlot();

    expect(screen.getByRole("status")).toHaveTextContent(
      AUTH_UNCONFIGURED_MESSAGE,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the form once auth is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    await renderSlot();

    expect(
      screen.queryByText(AUTH_UNCONFIGURED_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });
});
