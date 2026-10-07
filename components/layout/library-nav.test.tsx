import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0008, AC-14, AC-15; spec 0014, AC-1; feature 22
 *
 * The lit link comes from the pathname, and the type every link carries from
 * the page, so those are what the test sets.
 */
let pathname = "/watchlist";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

const { LibraryNav } = await import("./library-nav");

describe("LibraryNav", () => {
  it("links Watchlist, Upcoming and Watched, in that order (spec 0014, AC-1)", () => {
    pathname = "/watchlist";
    search = "";
    render(<LibraryNav variant="bar" />);
    const nav = screen.getByRole("navigation", { name: "Library" });
    expect(nav).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Watchlist", "/watchlist?type=tv"],
      ["Upcoming", "/upcoming?type=tv"],
      ["Watched", "/watched?type=tv"],
    ]);
  });

  it.each([
    ["/movies", "", "movie"],
    ["/movies/550", "", "movie"],
    ["/shows/1399", "", "tv"],
    ["/watched", "type=movie", "movie"],
    ["/search", "type=movie&q=dune", "movie"],
    ["/account", "", "tv"],
  ])(
    "on %s?%s every link carries type=%s (feature 22)",
    (current, query, type) => {
      pathname = current;
      search = query;
      render(<LibraryNav variant="bar" />);
      for (const link of screen.getAllByRole("link")) {
        expect(link.getAttribute("href")).toMatch(
          new RegExp(`\\?type=${type}$`),
        );
      }
    },
  );

  it.each(["/watchlist", "/upcoming", "/watched"])(
    "lights only the link for %s as a selected pill with aria-current",
    (current) => {
      pathname = current;
      search = "type=movie";
      render(<LibraryNav variant="sheet" />);
      for (const link of screen.getAllByRole("link")) {
        const selected = link.getAttribute("href") === `${current}?type=movie`;
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
