import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OPERATOR_NAME } from "@/lib/legal/operator";
import { TMDB_ATTRIBUTION } from "@/lib/tmdb/constants";

// The real entry point pulls `server-only` and the cached reads into jsdom.
// Only the constant crosses it here, taken from the file that owns it, so the
// footer still renders the real wording.
vi.mock("@/lib/tmdb", async () => {
  const constants = await import("@/lib/tmdb/constants");
  return { TMDB_ATTRIBUTION: constants.TMDB_ATTRIBUTION };
});

const { SiteFooter } = await import("./site-footer");

/**
 * covers: spec 0017, AC-2, AC-3, AC-4, AC-5
 *
 * The footer is TMDB's attribution on every route, so the exact notice, the
 * logo link and its attributes are pinned here. The row and stack swap at `md`
 * in CSS, which jsdom cannot show; the touch heights are asserted as classes,
 * the contract with `buttonVariants`' sizes, and the look stays a browser step.
 */
describe("SiteFooter", () => {
  it("renders TMDB's current notice from the one constant (AC-3)", () => {
    render(<SiteFooter />);
    expect(screen.getByText(TMDB_ATTRIBUTION)).toBeInTheDocument();
  });

  it("links the official logo to TMDB in a new tab (AC-2)", () => {
    render(<SiteFooter />);

    const logo = screen.getByRole("img", { name: "TMDB" });
    expect(logo).toHaveAttribute("src", "/tmdb-logo.svg");
    expect(logo).toHaveClass("h-3", "md:h-3.5", "w-auto");

    const link = logo.closest("a");
    expect(link).toHaveAttribute("href", "https://www.themoviedb.org");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links both legal pages at touch height (AC-4, AC-5)", () => {
    render(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "Legal" });

    const privacy = within(nav).getByRole("link", { name: "Privacy Policy" });
    const terms = within(nav).getByRole("link", { name: "Terms of Service" });
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(terms).toHaveAttribute("href", "/terms");
    for (const link of [privacy, terms]) {
      expect(link).toHaveClass("min-h-11", "md:min-h-9", "text-text-link");
    }
  });

  it("names the operator with no year and no email (AC-4)", () => {
    const { container } = render(<SiteFooter />);

    expect(
      screen.getByText(`© BeStats · ${OPERATOR_NAME}`),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(container.textContent).not.toContain("@");
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("sits on flat black, with no glass or blur (AC-5)", () => {
    const { container } = render(<SiteFooter />);
    expect(container.innerHTML).not.toMatch(/glass|backdrop-blur/);
  });
});
