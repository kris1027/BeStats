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
  it("links Up next, Upcoming and Watched on shows, in that order (spec 0014, AC-1)", () => {
    pathname = "/up-next";
    search = "";
    render(<LibraryNav variant="bar" />);
    const nav = screen.getByRole("navigation", { name: "Library" });
    expect(nav).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Up next", "/up-next?type=tv"],
      ["Upcoming", "/upcoming?type=tv"],
      ["Watched", "/watched?type=tv"],
    ]);
  });

  it.each([
    ["movie", ["Watchlist", "Coming soon", "Watched"]],
    ["game", ["Coming soon", "Want to play", "Playing", "Finished"]],
  ] as const)(
    "names the links for the %s tab (prompts/library-page-names.md)",
    (type, names) => {
      pathname = "/upcoming";
      search = `type=${type}`;
      render(<LibraryNav variant="bar" />);
      expect(
        screen.getAllByRole("link").map((link) => link.textContent),
      ).toEqual(names);
    },
  );

  it.each([
    ["/movies", "", "movie"],
    ["/movies/550", "", "movie"],
    ["/shows/1399", "", "tv"],
    ["/watched", "type=movie", "movie"],
    ["/search", "type=movie&q=dune", "movie"],
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

  it.each(["/watchlist", "/coming-soon", "/watched"])(
    "lights only the link for %s as a selected pill with aria-current",
    (current) => {
      pathname = current;
      search = "type=movie";
      render(<LibraryNav variant="sheet" />);
      expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
      for (const link of screen.getAllByRole("link")) {
        const selected = link.getAttribute("href") === `${current}?type=movie`;
        if (selected) {
          expect(link).toHaveAttribute("aria-current", "page");
          expect(link).toHaveClass("glass-selected-personal");
        } else {
          expect(link).not.toHaveAttribute("aria-current");
          expect(link).not.toHaveClass("glass-selected-personal");
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

  // covers: prompts/mobile-navigation.md, R5, R8
  it("gives the sheet rows a 56px touch target with the page's mark", () => {
    pathname = "/movies";
    render(<LibraryNav variant="sheet" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("h-14");
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });
  it.each(["/account", "/privacy", "/sign-in"])(
    "renders nothing on %s, a page about neither catalog",
    (current) => {
      pathname = current;
      search = "";
      render(<LibraryNav variant="bar" />);
      expect(
        screen.queryByRole("navigation", { name: "Library" }),
      ).not.toBeInTheDocument();
    },
  );

  // covers: spec 0027, AC-4
  it("carries type=game on a games tab", () => {
    pathname = "/upcoming";
    search = "type=game";
    render(<LibraryNav variant="sheet" />);

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/coming-soon?type=game",
      "/want-to-play?type=game",
      "/playing?type=game",
      "/finished?type=game",
    ]);
  });

  // covers: prompts/game-coming-soon.md, R4
  it("lights Coming soon on its page", () => {
    pathname = "/coming-soon";
    search = "type=game";
    render(<LibraryNav variant="bar" />);

    expect(screen.getByRole("link", { name: "Coming soon" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // covers: spec 0028, AC-14
  it("carries type=game on /games", () => {
    pathname = "/games/top-rated";
    search = "";
    render(<LibraryNav variant="sheet" />);

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/coming-soon?type=game",
      "/want-to-play?type=game",
      "/playing?type=game",
      "/finished?type=game",
    ]);
  });

  // covers: prompts/library-page-urls.md, decision 6
  it.each([
    ["/playing", "Playing"],
    ["/watchlist", "Watchlist"],
    ["/up-next", "Up next"],
  ])(
    "lights %s on its default tab when the URL has no type",
    (current, name) => {
      pathname = current;
      search = "";
      render(<LibraryNav variant="bar" />);
      expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(
        name,
      );
    },
  );
});
