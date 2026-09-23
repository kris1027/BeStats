import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-14, AC-15
 *
 * The lit link comes from the pathname, so the pathname is what the test sets.
 */
let pathname = "/watchlist";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { LibraryNav } = await import("./library-nav");

describe("LibraryNav", () => {
  it("links Watchlist and Watched, with no Upcoming until feature 15", () => {
    render(<LibraryNav variant="bar" />);
    const nav = screen.getByRole("navigation", { name: "Library" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watchlist" })).toHaveAttribute(
      "href",
      "/watchlist",
    );
    expect(screen.getByRole("link", { name: "Watched" })).toHaveAttribute(
      "href",
      "/watched",
    );
    expect(screen.queryByRole("link", { name: "Upcoming" })).toBeNull();
  });

  it.each(["/watchlist", "/watched"])(
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

  it("gives the sheet rows a 44px touch target", () => {
    pathname = "/movies";
    render(<LibraryNav variant="sheet" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("h-11");
    }
  });
});
