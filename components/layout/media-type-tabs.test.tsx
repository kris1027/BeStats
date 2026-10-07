import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaTypeTabs } from "@/components/layout/media-type-tabs";

const pathname = vi.hoisted(() => ({ value: "/shows" }));
const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams(search.value),
}));

/**
 * AC-14's real claim is that selection is *derived*, not stored. That is what
 * keeps a deep link, a back button and a server render agreeing, and it is the
 * thing a component holding its own state would silently break.
 *
 * So these tests change only the pathname and assert the rendered selection
 * follows, and they assert on `aria-current` rather than on a class, because
 * the gradient alone tells a screen reader nothing.
 */
describe("MediaTypeTabs", () => {
  beforeEach(() => {
    pathname.value = "/shows";
    search.value = "";
  });

  it("renders both tabs as links, not buttons", () => {
    render(<MediaTypeTabs />);

    expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
      "href",
      "/shows",
    );
    expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
      "href",
      "/movies",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("marks the tab matching the current path", () => {
    render(<MediaTypeTabs />);

    expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "MOVIES" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("follows the path when it changes", () => {
    pathname.value = "/movies";
    render(<MediaTypeTabs />);

    expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "SHOWS" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a nested route selected, so a detail page still lights its tab", () => {
    pathname.value = "/movies/550";
    render(<MediaTypeTabs />);

    expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gives the control a landmark name", () => {
    render(<MediaTypeTabs />);
    expect(
      screen.getByRole("navigation", { name: "Media type" }),
    ).toBeVisible();
  });

  // covers: feature 22. On a typed page the tabs switch its `type` in place.
  it.each(["/watchlist", "/upcoming", "/watched"])(
    "switches the type of %s in place and lights the one in the URL",
    (path) => {
      pathname.value = path;
      search.value = "type=movie&page=3";
      render(<MediaTypeTabs />);

      expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
        "href",
        `${path}?type=tv`,
      );
      expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
        "href",
        `${path}?type=movie`,
      );
      expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );

  it("lights SHOWS on a typed page with no type, the default", () => {
    pathname.value = "/watchlist";
    render(<MediaTypeTabs />);
    expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the search's query, year and rating, and drops genres and page", () => {
    pathname.value = "/search";
    search.value = "type=tv&q=office&genre=35&year=2005&rating=7&page=2";
    render(<MediaTypeTabs />);

    expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
      "href",
      "/search?type=movie&q=office&year=2005&rating=7",
    );
  });

  it("lights nothing on a page about neither catalog", () => {
    pathname.value = "/account";
    render(<MediaTypeTabs />);
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
      "href",
      "/movies",
    );
  });
});
