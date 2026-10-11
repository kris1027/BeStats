import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrandLink } from "@/components/layout/brand-link";

const pathname = vi.hoisted(() => ({ value: "/shows" }));
const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams(search.value),
}));

function brandHref() {
  return screen.getByRole("link", { name: "BeStats" }).getAttribute("href");
}

/**
 * covers: prompts/logo-follows-media-type.md, AC-1 to AC-4
 *
 * The logo follows the page's catalog, and on a page about neither catalog
 * the one last viewed, falling back to `/shows` whenever the memory is
 * missing, invalid or unreadable.
 */
describe("BrandLink", () => {
  beforeEach(() => {
    pathname.value = "/shows";
    search.value = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each([
    ["/movies", "", "/movies"],
    ["/movies/550", "", "/movies"],
    ["/watchlist", "type=movie", "/movies"],
    ["/search", "type=movie&q=alien", "/movies"],
    ["/shows", "", "/shows"],
    ["/shows/1399", "", "/shows"],
    ["/watchlist", "", "/shows"],
    ["/upcoming", "type=tv", "/shows"],
  ])("on %s?%s links to %s", (path, query, href) => {
    pathname.value = path;
    search.value = query;
    render(<BrandLink />);
    expect(brandHref()).toBe(href);
  });

  it("remembers the last catalog for a page with no type", () => {
    pathname.value = "/movies/550";
    const { unmount } = render(<BrandLink />);
    unmount();

    pathname.value = "/account";
    const movie = render(<BrandLink />);
    expect(brandHref()).toBe("/movies");
    movie.unmount();

    pathname.value = "/shows";
    render(<BrandLink />).unmount();

    pathname.value = "/privacy";
    render(<BrandLink />);
    expect(brandHref()).toBe("/shows");
  });

  it("falls back to /shows with nothing remembered", () => {
    pathname.value = "/privacy";
    render(<BrandLink />);
    expect(brandHref()).toBe("/shows");
  });

  it("ignores an invalid remembered value", () => {
    window.localStorage.setItem("bestats:last-media-type", "anime");
    pathname.value = "/privacy";
    render(<BrandLink />);
    expect(brandHref()).toBe("/shows");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    pathname.value = "/movies";
    render(<BrandLink />).unmount();
    pathname.value = "/terms";
    render(<BrandLink />);
    expect(brandHref()).toBe("/shows");
  });
});
