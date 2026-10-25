import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrandLink, LAST_MEDIA_TYPE_KEY } from "@/components/layout/brand-link";

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
 * covers: prompts/logo-follows-media-type.md, AC-1 to AC-4; spec 0028, AC-16
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
    window.localStorage.setItem(LAST_MEDIA_TYPE_KEY, "anime");
    pathname.value = "/privacy";
    render(<BrandLink />);
    expect(brandHref()).toBe("/shows");
  });

  // spec 0028, AC-16
  describe("on games", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      ["/games", ""],
      ["/games/top-rated", ""],
      ["/games/1942", ""],
      ["/watched", "type=game"],
    ])("links %s?%s to /games and remembers game", (path, query) => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
      pathname.value = path;
      search.value = query;
      render(<BrandLink />);

      expect(brandHref()).toBe("/games");
      expect(window.localStorage.getItem(LAST_MEDIA_TYPE_KEY)).toBe("game");
    });

    it("sends a remembered game to /games only while the flag is on", () => {
      window.localStorage.setItem(LAST_MEDIA_TYPE_KEY, "game");
      pathname.value = "/account";

      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
      render(<BrandLink />).unmount();
      expect(window.localStorage.getItem(LAST_MEDIA_TYPE_KEY)).toBe("game");
      render(<BrandLink />);
      expect(brandHref()).toBe("/games");
    });

    it("reads a stale remembered game as nothing with the flag off", () => {
      window.localStorage.setItem(LAST_MEDIA_TYPE_KEY, "game");
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "off");
      pathname.value = "/account";
      render(<BrandLink />);

      expect(brandHref()).toBe("/shows");
    });
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
