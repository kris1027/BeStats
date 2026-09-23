import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "@/components/layout/navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/shows",
}));

/**
 * The account control the layout passes in (spec 0005, AC-14). The navbar does
 * not read the session itself, so the test supplies the same shape the real
 * slot renders: a link to the account page. That keeps the "sign in points at
 * /sign-in" assertion honest for the signed out case without pulling a Supabase
 * client into jsdom.
 */
function ACCOUNT_SLOT() {
  return <a href="/sign-in">Sign in</a>;
}

/**
 * covers: AC-13, AC-16
 *
 * The navbar's two layouts swap at `md` in CSS, which jsdom cannot show. What
 * it can prove is the decision underneath them: one tree, not two. The spec's
 * reason for that is a keyboard and screen reader one, so it is testable
 * without a viewport. There must be exactly one tab control in the document at
 * any width, or a mobile user tabs through the tabs twice.
 *
 * The blur and the sticky behaviour are asserted as classes for the same
 * reason the glass tests are: `backdrop-blur-glass` is the contract with
 * `--blur-glass` in `globals.css`, and AC-16 is specifically about blur
 * appearing only on surfaces content scrolls under. Whether it looks right
 * stays a `/check verify` step.
 */
describe("Navbar", () => {
  it("is a banner landmark", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("sends the brand to /shows, the default landing route", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/shows",
    );
  });

  it("renders one tab control, not one per layout", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Media type" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "SHOWS" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "MOVIES" })).toHaveLength(1);
  });

  it("renders the account slot it is given, in both layouts", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    // Two copies on purpose: one per layout, each hidden by CSS at the other
    // breakpoint. jsdom cannot apply that, so both are in the document here.
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
  });

  it("offers sign in, pointing at the sign in route", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
  });

  it("leaves out the search field rather than faking one", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    // Feature 11 owns search; a dead search box would be a false affordance.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("sticks to the top and blurs what scrolls underneath it", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(screen.getByRole("banner")).toHaveClass(
      "sticky",
      "top-0",
      "backdrop-blur-glass",
    );
  });
});
