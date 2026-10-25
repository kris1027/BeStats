import { act, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaTypeTabs } from "@/components/layout/media-type-tabs";

const pathname = vi.hoisted(() => ({ value: "/shows" }));
const search = vi.hoisted(() => ({ value: "" }));
// While set, reading the query suspends forever, so the Suspense fallback the
// prerendered shell would hold is what renders.
const suspendSearch = vi.hoisted(() => ({ value: false }));
const never = new Promise<never>(() => {});

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useSearchParams: () => {
    if (suspendSearch.value) use(never);
    return new URLSearchParams(search.value);
  },
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

  it.each(["/account", "/privacy", "/sign-in"])(
    "renders nothing on %s, a page about neither catalog",
    (path) => {
      pathname.value = path;
      render(<MediaTypeTabs />);
      expect(
        screen.queryByRole("navigation", { name: "Media type" }),
      ).not.toBeInTheDocument();
    },
  );

  // covers: spec 0027, AC-3
  describe("with the games library on", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each(["/watchlist", "/upcoming", "/watched"])(
      "adds GAMES on %s and lights it on a games tab",
      (path) => {
        pathname.value = path;
        search.value = "type=game&page=2";
        render(<MediaTypeTabs />);

        expect(
          screen.getAllByRole("link").map((link) => link.textContent),
        ).toEqual(["SHOWS", "MOVIES", "GAMES"]);
        expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
          "href",
          `${path}?type=game`,
        );
        expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
          "aria-current",
          "page",
        );
        expect(screen.getByRole("link", { name: "SHOWS" })).not.toHaveAttribute(
          "aria-current",
        );
      },
    );

    // spec 0028, AC-14: GAMES on every page, leading to /games.
    it.each(["/search", "/shows", "/movies/550"])(
      "adds GAMES to /games on %s, unlit",
      (path) => {
        pathname.value = path;
        search.value = "type=movie";
        render(<MediaTypeTabs />);

        const games = screen.getByRole("link", { name: "GAMES" });
        expect(games).toHaveAttribute("href", "/games");
        expect(games).not.toHaveAttribute("aria-current");
      },
    );

    it.each(["/games", "/games/top-rated", "/games/1942"])(
      "lights GAMES on %s, with the catalogs one click away",
      (path) => {
        pathname.value = path;
        search.value = "";
        render(<MediaTypeTabs />);

        expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
          "aria-current",
          "page",
        );
        expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
          "href",
          "/shows",
        );
      },
    );
  });

  it("shows no tabs on /games with the games library off", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "off");
    pathname.value = "/games";
    search.value = "";
    render(<MediaTypeTabs />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("never renders GAMES with the games library off", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "off");
    pathname.value = "/watchlist";
    search.value = "type=game";
    render(<MediaTypeTabs />);

    expect(
      screen.queryByRole("link", { name: "GAMES" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    vi.unstubAllEnvs();
  });

  /** covers: spec 0027, AC-1, AC-3 */
  describe("the games tab edges", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      suspendSearch.value = false;
    });

    it("reads an invalid flag as off, still rendering the two tabs", () => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "maybe");
      pathname.value = "/watched";
      search.value = "type=game";
      render(<MediaTypeTabs />);

      expect(
        screen.queryByRole("link", { name: "GAMES" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("renders all three tabs with none lit before ?type is known", async () => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
      suspendSearch.value = true;
      pathname.value = "/upcoming";
      await act(async () => {
        render(<MediaTypeTabs />);
      });

      const tabs = screen.getAllByRole("link");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "SHOWS",
        "MOVIES",
        "GAMES",
      ]);
      for (const tab of tabs) expect(tab).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "href",
        "/upcoming?type=game",
      );
    });

    it("gives the /search fallback a GAMES link to /games (spec 0028, AC-14)", async () => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
      suspendSearch.value = true;
      pathname.value = "/search";
      await act(async () => {
        render(<MediaTypeTabs />);
      });

      expect(screen.getAllByRole("link")).toHaveLength(3);
      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "href",
        "/games",
      );
    });
  });
});
