import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-14, AC-15; spec 0014, AC-1
 *
 * The lit link comes from the pathname, so the pathname is what the test sets.
 */
let pathname = "/watchlist";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { LibraryNav } = await import("./library-nav");

describe("LibraryNav", () => {
  it("links Watchlist, Upcoming and Watched, in that order (spec 0014, AC-1)", () => {
    render(<LibraryNav variant="bar" />);
    const nav = screen.getByRole("navigation", { name: "Library" });
    expect(nav).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Watchlist", "/watchlist"],
      ["Upcoming", "/upcoming"],
      ["Watched", "/watched"],
    ]);
  });

  it.each(["/watchlist", "/upcoming", "/watched"])(
    "lights only the link for %s as a selected pill with aria-current",
    (current) => {
      pathname = current;
      render(<LibraryNav variant="sheet" />);
      for (const link of screen.getAllByRole("link")) {
        const selected = link.getAttribute("href") === current;
        if (selected) {
          expect(link).toHaveAttribute("aria-current", "page");
          expect(link).toHaveClass("glass-selected");
        } else {
          expect(link).not.toHaveAttribute("aria-current");
          expect(link).not.toHaveClass("glass-selected");
        }
      }
    },
  );

  it("lights nothing on another page", () => {
    pathname = "/movies";
    render(<LibraryNav variant="bar" />);
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
  });

  it("gives the bar links the hidden tab tap area, and the sheet rows none", () => {
    pathname = "/movies";
    const { unmount } = render(<LibraryNav variant="bar" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("hit-area-tab", "h-7");
    }
    unmount();
    render(<LibraryNav variant="sheet" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveClass("hit-area-tab");
    }
  });

  it("gives the sheet rows a 44px touch target", () => {
    pathname = "/movies";
    render(<LibraryNav variant="sheet" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("h-11");
    }
  });
});
