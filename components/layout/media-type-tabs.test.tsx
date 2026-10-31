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

  // covers: feature 22; prompts/library-page-urls.md, decision 5 (AC-3). On a
  // library page each tab opens the matching page of its own.
  it.each([
    ["/up-next", "tv", "/up-next", "/watchlist", "/want-to-play"],
    ["/upcoming", "tv", "/upcoming", "/coming-soon", "/playing"],
    ["/watched", "tv", "/watched", "/watched", "/finished"],
    ["/watchlist", "movie", "/up-next", "/watchlist", "/want-to-play"],
    ["/coming-soon", "movie", "/upcoming", "/coming-soon", "/playing"],
    ["/watched", "movie", "/watched", "/watched", "/finished"],
    ["/coming-soon", "game", "/up-next", "/watchlist", "/coming-soon"],
    ["/want-to-play", "game", "/up-next", "/watchlist", "/want-to-play"],
    ["/playing", "game", "/upcoming", "/coming-soon", "/playing"],
    ["/finished", "game", "/watched", "/watched", "/finished"],
  ])(
    "switches %s?type=%s to the matching page of each tab",
    (path, type, tv, movie, game) => {
      pathname.value = path;
      search.value = `type=${type}&page=3`;
      render(<MediaTypeTabs />);

      expect(screen.getByRole("link", { name: "SHOWS" })).toHaveAttribute(
        "href",
        `${tv}?type=tv`,
      );
      expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
        "href",
        `${movie}?type=movie`,
      );
      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "href",
        `${game}?type=game`,
      );
      const lit = { tv: "SHOWS", movie: "MOVIES", game: "GAMES" }[type];
      expect(screen.getByRole("link", { name: lit })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );

  it.each([
    ["/up-next", "SHOWS"],
    ["/watchlist", "MOVIES"],
    ["/playing", "GAMES"],
  ])("lights the default tab on %s with no type", (path, tab) => {
    pathname.value = path;
    search.value = "";
    render(<MediaTypeTabs />);
    expect(screen.getByRole("link", { name: tab })).toHaveAttribute(
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

  // covers: spec 0027, AC-3; spec 0032, AC-12
  describe("the GAMES tab, always shown", () => {
    it.each(["/coming-soon", "/want-to-play", "/playing", "/finished"])(
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
    it.each(["/shows", "/movies/550"])(
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

    // spec 0029, AC-14: on /search, GAMES switches the type in place.
    it("switches /search to games in place, keeping what games can take", () => {
      pathname.value = "/search";
      search.value = "type=movie&q=dune&year=1940&genre=878";
      render(<MediaTypeTabs />);

      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "href",
        "/search?type=game&q=dune",
      );
    });

    it("lights GAMES on /search?type=game and keeps the query on a switch back", () => {
      pathname.value = "/search";
      search.value = "type=game&q=zelda&platform=130";
      render(<MediaTypeTabs />);

      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "MOVIES" })).toHaveAttribute(
        "href",
        "/search?type=movie&q=zelda",
      );
    });

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

  /** covers: spec 0027, AC-3 */
  describe("the games tab edges", () => {
    afterEach(() => {
      suspendSearch.value = false;
    });

    it("renders all three tabs with none lit before ?type is known", async () => {
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
        "/playing?type=game",
      );
    });

    it("gives the /search fallback a GAMES link that stays on /search (spec 0029, AC-14)", async () => {
      suspendSearch.value = true;
      pathname.value = "/search";
      await act(async () => {
        render(<MediaTypeTabs />);
      });

      expect(screen.getAllByRole("link")).toHaveLength(3);
      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "href",
        "/search?type=game",
      );
    });
  });
});
