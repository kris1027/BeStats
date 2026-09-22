import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaTypeTabs } from "@/components/layout/media-type-tabs";

const pathname = vi.hoisted(() => ({ value: "/shows" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
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
});
