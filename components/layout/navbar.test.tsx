import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "@/components/layout/navbar";

const pathname = vi.hoisted(() => ({ current: "/shows" }));
const search = vi.hoisted(() => ({ current: "type=movie" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.current),
}));

/**
 * The account control the layout passes in (spec 0005, AC-14). The navbar does
 * not read the session itself, so the test supplies the same shape the real
 * slot renders: a link to the account page. That keeps the "sign in points at
 * /sign-in" assertion honest for the signed out case without pulling a Supabase
 * client into jsdom.
 */
function ACCOUNT_SLOT() {
  return <a href="/sign-in">Sign in</a>;
}

/**
 * covers: AC-13, AC-16
 *
 * The navbar's two layouts swap at `md` in CSS, which jsdom cannot show. What
 * it can prove is the decision underneath them: one tree, not two. The spec's
 * reason for that is a keyboard and screen reader one, so it is testable
 * without a viewport. There must be exactly one tab control in the document at
 * any width, or a mobile user tabs through the tabs twice.
 *
 * The transparent, non sticky bar is asserted as classes for the same reason
 * the glass tests are: a transparent bar pinned over scrolling content is
 * unreadable, so `sticky` or `fixed` creeping back without a background is a
 * regression. Whether it looks right stays a `/check verify` step.
 */
describe("Navbar", () => {
  it("is a banner landmark", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("sends the brand to the catalog of the page, /shows here", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/shows",
    );
  });

  it("renders one tab control, not one per layout", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Media type" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "SHOWS" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "MOVIES" })).toHaveLength(1);
  });

  it("renders the account slot it is given, in both layouts", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    // Two copies on purpose: one per layout, each hidden by CSS at the other
    // breakpoint. jsdom cannot apply that, so both are in the document here.
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
  });

  it("offers sign in, pointing at the sign in route", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    for (const link of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(link).toHaveAttribute("href", "/sign-in");
    }
  });

  // covers: spec 0010, AC-1, AC-6. The desktop field and the mobile icon are
  // both in the document; CSS hides one at each width.
  it("searches the catalog the page is on", () => {
    pathname.current = "/movies/550";
    const { unmount } = render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search movies",
    );
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    unmount();

    // A typed page searches its `type` parameter, here `movie` (feature 22).
    pathname.current = "/watchlist";
    const typed = render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search movies",
    );
    typed.unmount();
    pathname.current = "/shows";
  });

  // covers: prompts/hide-tabs-without-type.md, AC-1. A page about neither
  // catalog has no search or tabs; the Library links are in the account
  // slot, covered by `library-nav.test.tsx`.
  it.each(["/account", "/privacy", "/sign-in"])(
    "renders no search or tabs on %s",
    (current) => {
      pathname.current = current;
      render(
        <Navbar
          mobileAccountSlot={<ACCOUNT_SLOT />}
          desktopAccountSlot={<ACCOUNT_SLOT />}
        />,
      );
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Search" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Media type" }),
      ).not.toBeInTheDocument();
      pathname.current = "/shows";
    },
  );

  // covers: spec 0027, AC-3; spec 0029, AC-15. A games tab has the GAMES tab
  // lit and searches games.
  it("lights GAMES and searches games on a games tab (spec 0029, AC-15)", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
    window.localStorage.removeItem("bestats:last-media-type");
    pathname.current = "/watched";
    search.current = "type=game";
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search games",
    );
    // spec 0028, AC-16: the logo follows a games tab and remembers it.
    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/games",
    );
    expect(window.localStorage.getItem("bestats:last-media-type")).toBe("game");

    vi.unstubAllEnvs();
    window.localStorage.removeItem("bestats:last-media-type");
    pathname.current = "/shows";
    search.current = "type=movie";
  });

  // spec 0028, AC-14 to AC-16
  it.each(["/games", "/games/coming-soon"])(
    "lights GAMES on %s, searching games, with the logo on /games",
    (path) => {
      vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
      pathname.current = path;
      search.current = "";
      render(
        <Navbar
          mobileAccountSlot={<ACCOUNT_SLOT />}
          desktopAccountSlot={<ACCOUNT_SLOT />}
        />,
      );

      expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("combobox")).toHaveAttribute(
        "placeholder",
        "Search games",
      );
      expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
        "href",
        "/games",
      );

      vi.unstubAllEnvs();
      window.localStorage.removeItem("bestats:last-media-type");
      pathname.current = "/shows";
      search.current = "type=movie";
    },
  );

  // spec 0029, AC-15, AC-18
  it("searches games on /search?type=game, with the logo on /games", () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
    pathname.current = "/search";
    search.current = "type=game&q=zelda";
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search games",
    );
    expect(screen.getByRole("link", { name: "GAMES" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/games",
    );
    vi.unstubAllEnvs();
    window.localStorage.removeItem("bestats:last-media-type");
    pathname.current = "/shows";
    search.current = "type=movie";
  });

  it("lights SHOWS and searches shows on /search?type=game with the flag off", () => {
    pathname.current = "/search";
    search.current = "type=game";
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search shows",
    );
    expect(screen.queryByRole("link", { name: "GAMES" })).toBeNull();
    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/shows",
    );
    window.localStorage.removeItem("bestats:last-media-type");
    pathname.current = "/shows";
    search.current = "type=movie";
  });

  it("takes the type from the type parameter on /search", () => {
    pathname.current = "/search";
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Search movies",
    );
    pathname.current = "/shows";
  });

  it("scrolls with the page, with no background, border or blur", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    const banner = screen.getByRole("banner");
    expect(banner.className).not.toMatch(
      /\b(sticky|fixed|bg-|border|backdrop-blur)/,
    );
  });

  it("keeps the padding and gap that --navbar-height is written from", () => {
    render(
      <Navbar
        mobileAccountSlot={<ACCOUNT_SLOT />}
        desktopAccountSlot={<ACCOUNT_SLOT />}
      />,
    );

    // Two 40px rows, an 8px gap and 8px padding on a phone; one row from md.
    const row = screen.getByRole("banner").firstElementChild;
    expect(row).toHaveClass("flex-col", "gap-2", "py-2", "md:flex-row");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(
      "--navbar-height: calc(2 * 2.5rem + 0.5rem + 2 * 0.5rem);",
    );
    expect(css).toContain("--navbar-height: calc(2.5rem + 2 * 0.5rem);");
  });
});
