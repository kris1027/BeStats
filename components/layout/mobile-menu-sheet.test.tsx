import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileMenuSheet } from "@/components/layout/mobile-menu-sheet";

/**
 * covers: spec 0004, AC-15; spec 0010, AC-6; prompts/mobile-navigation.md,
 * AC-2 to AC-6
 *
 * Tested against the real Base UI Dialog and Autocomplete rather than mocked.
 * Base UI supplies the behaviour, so the thing that can actually break is the
 * wiring, and the wiring is exactly what a mock would hide. A regression here
 * means a keyboard user is trapped outside an open menu or dumped at the top
 * of the page on close, which is invisible to a type checker and to anyone
 * testing with a mouse.
 */
const pathname = vi.hoisted(() => ({ current: "/up-next" }));
const search = vi.hoisted(() => ({ current: "" as string | null }));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push }),
  useSearchParams: () => {
    // `null` stands for a query not known yet, which suspends, as at prerender.
    if (search.current === null) throw new Promise(() => {});
    return new URLSearchParams(search.current);
  },
}));

const fetchMock = vi.fn(async (input: string) => {
  const url = new URL(input, "http://localhost");
  const type = url.searchParams.get("type");
  const query = url.searchParams.get("q");
  return new Response(
    JSON.stringify({
      totalResults: 1,
      results: [
        {
          id: 1,
          title: `${query} (${type})`,
          year: 2021,
          posterUrl: null,
          rating: null,
          href: `/movies/1`,
        },
      ],
    }),
  );
});

/**
 * The breakpoint query, which jsdom lacks; `widen` fires its change event
 * and `watched` is the last query asked for.
 */
let widen: () => void = () => {};
let watched = "";
function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => {
    watched = query;
    const target = new EventTarget();
    widen = () => {
      const event = Object.assign(new Event("change"), { matches: true });
      target.dispatchEvent(event);
    };
    return Object.assign(target, { matches: false, media: query });
  });
}

beforeEach(() => {
  pathname.current = "/up-next";
  search.current = "";
  vi.stubGlobal("fetch", fetchMock);
  stubMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  push.mockClear();
});

function Sheet({
  signedIn = true,
  hiddenFrom,
}: {
  signedIn?: boolean;
  hiddenFrom?: "md" | "xl";
}) {
  return (
    <MobileMenuSheet
      hiddenFrom={hiddenFrom}
      account={signedIn ? <a href="/account">Account</a> : null}
    />
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open menu" }));
  return screen.findByRole("dialog", { name: "Menu" });
}

/** Tabs forward until `target` has focus, failing rather than looping forever. */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  target: Element,
) {
  for (let step = 0; step < 20 && document.activeElement !== target; step++) {
    await user.tab();
  }
  expect(target).toHaveFocus();
}

function rowNames() {
  return within(screen.getByRole("navigation", { name: "Library" }))
    .getAllByRole("link")
    .map((link) => link.textContent);
}

describe("MobileMenuSheet", () => {
  it("opens from the keyboard and moves focus into the sheet", async () => {
    const user = userEvent.setup();
    render(<Sheet />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("hides the page behind it while open, and gives it back on close", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind the sheet</button>
        <Sheet />
      </>,
    );

    const findBehind = () =>
      screen.queryByRole("button", { name: "Behind the sheet" });
    expect(findBehind()).toBeInTheDocument();

    await openMenu(user);

    /*
     * This is the assertion that carries the focus trap, expressed the way
     * jsdom can actually prove it. While the sheet is open the page behind is
     * not in the accessible tree at all, so nothing there can be reached by
     * keyboard or read by a screen reader. Tab containment itself is checked
     * in a real browser, since jsdom does not implement `inert`.
     */
    expect(findBehind()).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(findBehind()).toBeInTheDocument());
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Sheet />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes from its own close button", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("holds the search, the tabs, the page's library rows and the account block", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    const dialog = await openMenu(user);

    expect(
      within(dialog).getByRole("combobox", { name: "Search shows" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "SHOWS" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toEqual(["Up next", "Upcoming", "Watched"]);
    expect(screen.getByRole("link", { name: "Up next" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(dialog).getByRole("link", { name: "Account" }),
    ).toBeInTheDocument();
  });

  it("previews another tab's rows without navigating, lighting none", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.click(screen.getByRole("button", { name: "GAMES" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([
      "Coming soon",
      "Want to play",
      "Playing",
      "Finished",
    ]);
    expect(screen.getByRole("link", { name: "Playing" })).toHaveAttribute(
      "href",
      "/playing?type=game",
    );
    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Search games" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
      "href",
      "/games",
    );
  });

  it("starts from the page's tab again when it reopens", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "MOVIES" }));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await openMenu(user);
    expect(screen.getByRole("button", { name: "SHOWS" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("closes when a row is chosen", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.click(screen.getByRole("link", { name: "Watched" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("gives search the whole screen on a tap, and Cancel brings the menu back", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.click(screen.getByRole("combobox", { name: "Search shows" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
    // The tabs stay, so the type can change without leaving search.
    expect(screen.getByRole("button", { name: "MOVIES" })).toBeInTheDocument();

    await user.type(screen.getByRole("combobox"), "dune");
    expect(await screen.findByText("dune (tv)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("navigation", { name: "Library" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Search shows" })).toHaveValue(
      "",
    );
    // Cancel unmounts itself, so focus goes back to the field, not the void.
    expect(
      screen.getByRole("combobox", { name: "Search shows" }),
    ).toHaveFocus();
  });

  it("opens straight into search mode when asked, for /showcase", async () => {
    const user = userEvent.setup();
    render(<MobileMenuSheet account={null} searching />);
    await openMenu(user);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  // covers: prompts/mobile-navigation.md, AC-6
  it("lets the keyboard tab past the field to the rows and the account block", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);
    const field = screen.getByRole("combobox", { name: "Search shows" });

    await tabTo(user, field);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    const account = screen.getByRole("link", { name: "Account" });
    await tabTo(user, account);
    expect(screen.getByRole("navigation", { name: "Library" })).toBeVisible();
  });

  it("starts search mode when the keyboard types into the field", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);
    const field = screen.getByRole("combobox", { name: "Search shows" });
    await tabTo(user, field);

    await user.keyboard("d");

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Library" })).toBeNull();
  });

  // covers: prompts/mobile-navigation.md, decision 5
  it("closes the whole menu on Escape while results show", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);
    await user.type(screen.getByRole("combobox"), "dune");
    expect(await screen.findByText("dune (tv)")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("keeps the query when the tab changes during a search", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.type(
      screen.getByRole("combobox", { name: "Search shows" }),
      "dune",
    );
    expect(await screen.findByText("dune (tv)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "MOVIES" }));
    expect(screen.getByRole("combobox", { name: "Search movies" })).toHaveValue(
      "dune",
    );
    expect(await screen.findByText("dune (movie)")).toBeInTheDocument();
  });

  it("closes when a search result is chosen", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    await user.type(screen.getByRole("combobox"), "dune");
    await user.click(await screen.findByText("dune (tv)"));

    expect(push).toHaveBeenCalledWith("/movies/1");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows search and tabs but no rows when signed out", async () => {
    const user = userEvent.setup();
    render(<Sheet signedIn={false} />);
    await openMenu(user);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GAMES" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Library" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  // covers: prompts/mobile-navigation.md, decision 7
  it.each(["/account", "/privacy", "/sign-in"])(
    "on %s still holds the search, tabs and rows, from the last catalog viewed",
    async (current) => {
      pathname.current = current;
      window.localStorage.setItem("bestats:last-media-type", "movie");
      const user = userEvent.setup();
      render(<Sheet />);
      await openMenu(user);

      expect(
        screen.getByRole("combobox", { name: "Search movies" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "MOVIES" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(rowNames()).toEqual(["Watchlist", "Coming soon", "Watched"]);
      expect(screen.queryByRole("link", { current: "page" })).toBeNull();
      expect(screen.getByRole("link", { name: "BeStats" })).toHaveAttribute(
        "href",
        "/movies",
      );
      expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
      window.localStorage.removeItem("bestats:last-media-type");
    },
  );

  it("starts on shows on a page with no type when nothing is remembered", async () => {
    pathname.current = "/account";
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    expect(screen.getByRole("button", { name: "SHOWS" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rowNames()).toEqual(["Up next", "Upcoming", "Watched"]);
  });

  it("follows the type parameter on a typed page", async () => {
    pathname.current = "/watched";
    search.current = "type=movie";
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    expect(screen.getByRole("button", { name: "MOVIES" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("link", { name: "Watched" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("previews the last catalog viewed, lighting nothing, until the query is known", async () => {
    pathname.current = "/search";
    search.current = null;
    window.localStorage.setItem("bestats:last-media-type", "movie");
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    expect(screen.getByRole("button", { name: "MOVIES" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
    window.localStorage.removeItem("bestats:last-media-type");
  });

  it("closes when the window widens past md, where the bar has no menu", async () => {
    const user = userEvent.setup();
    render(<Sheet />);
    await openMenu(user);

    act(() => widen());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  // covers: prompts/mobile-navigation.md, decision 10
  it.each([
    [undefined, "(width >= 48rem)"],
    ["xl", "(width >= 80rem)"],
  ] as const)(
    "hidden from %s, it closes as the window crosses %s",
    async (hiddenFrom, query) => {
      const user = userEvent.setup();
      render(<Sheet hiddenFrom={hiddenFrom} />);
      await openMenu(user);
      expect(watched).toBe(query);
    },
  );

  // The queries above are Tailwind's `md` and `xl`, restated in JS.
  it.each([
    ["md", "48rem"],
    ["xl", "80rem"],
  ])("matches Tailwind's %s breakpoint, %s", (name, width) => {
    const theme = readFileSync(
      createRequire(import.meta.url).resolve("tailwindcss/theme.css"),
      "utf8",
    );
    const globals = readFileSync("app/globals.css", "utf8");
    expect(theme).toContain(`--breakpoint-${name}: ${width};`);
    expect(globals).not.toContain(`--breakpoint-${name}:`);
  });

  it("names the trigger for assistive technology, since it is icon only", () => {
    render(<Sheet />);
    expect(screen.getByRole("button", { name: "Open menu" })).toBeVisible();
  });
});
