import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

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
