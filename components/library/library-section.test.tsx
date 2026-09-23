import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItem } from "./types";

/**
 * covers: spec 0008, AC-1 to AC-3, AC-9 to AC-11, AC-13
 *
 * `LibrarySection` is an async Server Component, so each test awaits it and
 * renders what it returns. The session, the two Postgres reads and the TMDB
 * read are the boundaries and are replaced; `libraryLastPage` stays real, so
 * the redirect follows the same arithmetic the app uses. `LibraryGrid` is a
 * Client Component with its own suite, so here it is a stub that shows the
 * items and props it was handed. `redirect()` throws, as it does in Next.
 */
const requireUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ requireUser: () => requireUser() }));

const getWatchlistPage = vi.fn();
const getWatchedPage = vi.fn();
const getLibraryTitles = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({
  getMovieSummaries: vi.fn(),
  TmdbError: class extends Error {},
}));
vi.mock("@/lib/tracking/movie-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking/movie-lists")>()),
  getWatchlistPage: (...args: unknown[]) => getWatchlistPage(...args),
  getWatchedPage: (...args: unknown[]) => getWatchedPage(...args),
  getLibraryTitles: (...args: unknown[]) => getLibraryTitles(...args),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

vi.mock("./library-grid", () => ({
  LibraryGrid: (props: {
    list: string;
    items: LibraryItem[];
    label: string;
    page: number;
    returnPath: string;
  }) => (
    <ul aria-label={props.label} data-return-path={props.returnPath}>
      {props.items.map((item) => (
        <li key={item.movieId} data-testid={`item-${item.movieId}`}>
          {JSON.stringify(item)}
        </li>
      ))}
    </ul>
  ),
}));

const { LibrarySection } = await import("./library-section");

type List = "watchlist" | "watched";

async function renderSection(
  list: List,
  params: Record<string, string | string[] | undefined> = {},
) {
  return render(
    await LibrarySection({ list, searchParams: Promise.resolve(params) }),
  );
}

/** The item the grid stub received for one movie. */
function received(movieId: number): LibraryItem {
  return JSON.parse(screen.getByTestId(`item-${movieId}`).textContent ?? "");
}

function summary(id: number, title: string) {
  return {
    id,
    title,
    posterUrl: `https://image.tmdb.org/t/p/w342/${id}.jpg`,
    tmdbRating: 8.4,
  };
}

beforeEach(() => {
  requireUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  getLibraryTitles.mockResolvedValue({ kind: "ok", titles: new Map() });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the session comes first (AC-3)", () => {
  it("reads nothing when requireUser refuses the request", async () => {
    requireUser.mockRejectedValue(
      new RedirectSignal("/sign-in?next=%2Fwatchlist"),
    );
    await expect(renderSection("watchlist")).rejects.toMatchObject({
      url: "/sign-in?next=%2Fwatchlist",
    });
    expect(getWatchlistPage).not.toHaveBeenCalled();
    expect(getLibraryTitles).not.toHaveBeenCalled();
  });

  it("reads the rows of the verified user only", async () => {
    getWatchedPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await renderSection("watched", { page: "1" });
    expect(getWatchedPage).toHaveBeenCalledWith("user-a", 1);
    expect(getWatchlistPage).not.toHaveBeenCalled();
  });
});

describe("the page parameter (AC-9)", () => {
  it.each([["abc"], ["0"], ["501"], ["2.5"], [["1", "2"]]])(
    "shows 'That page doesn't exist' for %j, before any read",
    async (page) => {
      await renderSection("watchlist", { page });
      expect(
        screen.getByRole("heading", { name: "That page doesn't exist" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Back to page 1" }),
      ).toHaveAttribute("href", "/watchlist");
      expect(getWatchlistPage).not.toHaveBeenCalled();
    },
  );

  it("treats a missing page as page 1", async () => {
    getWatchlistPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await renderSection("watchlist");
    expect(getWatchlistPage).toHaveBeenCalledWith("user-a", 1);
  });

  it("redirects a page past the end to the last page", async () => {
    getWatchedPage.mockResolvedValue({ kind: "ok", rows: [], total: 21 });
    await expect(renderSection("watched", { page: "7" })).rejects.toMatchObject(
      { url: "/watched?page=2" },
    );
    expect(getLibraryTitles).not.toHaveBeenCalled();
  });

  it("redirects to the bare path when the list is now empty", async () => {
    getWatchlistPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await expect(
      renderSection("watchlist", { page: "2" }),
    ).rejects.toMatchObject({ url: "/watchlist" });
  });
});

describe("empty lists (AC-10)", () => {
  it.each([
    ["watchlist", "Your watchlist is empty", "Plan a movie to see it here."],
    ["watched", "Nothing watched yet", "Movies you mark watched show up here."],
  ] as const)(
    "the %s page shows its empty panel with Browse movies",
    async (list, title, body) => {
      const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
      read.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
      await renderSection(list);
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Browse movies" }),
      ).toHaveAttribute("href", "/movies");
      expect(getLibraryTitles).not.toHaveBeenCalled();
    },
  );
});

describe("failures never look like an empty list (AC-11)", () => {
  it.each([
    ["watchlist", "Couldn't load your watchlist"],
    ["watched", "Couldn't load your watched movies"],
  ] as const)(
    "a failed %s read shows the error panel with Try again on the same page",
    async (list, title) => {
      const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
      read.mockResolvedValue({ kind: "failed" });
      await renderSection(list, { page: "3" });
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
        "href",
        `/${list}?page=3`,
      );
      expect(screen.queryByText(/is empty|Nothing watched/)).toBeNull();
      expect(getLibraryTitles).not.toHaveBeenCalled();
    },
  );

  it("a systemic TMDB failure shows 'Couldn't reach TMDB', not the grid", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [{ movieId: 550 }],
      total: 1,
    });
    getLibraryTitles.mockResolvedValue({ kind: "failed" });
    await renderSection("watchlist");
    expect(
      screen.getByRole("heading", { name: "Couldn't reach TMDB" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/watchlist",
    );
    expect(screen.queryByTestId("item-550")).toBeNull();
  });

  it("keeps a card for a movie TMDB no longer has, with no title", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [{ movieId: 550 }, { movieId: 2147480000 }],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      titles: new Map([[550, summary(550, "Fight Club")]]),
    });
    await renderSection("watchlist");
    expect(received(2147480000)).toEqual({
      movieId: 2147480000,
      title: null,
      posterUrl: null,
      tmdbRating: null,
      rating: null,
      watchedAt: null,
    });
  });
});

describe("a page of cards (AC-1, AC-2, AC-9, AC-13)", () => {
  it("joins each watchlist row with its TMDB title, in the Postgres order", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [{ movieId: 603 }, { movieId: 550 }],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      titles: new Map([
        [550, summary(550, "Fight Club")],
        [603, summary(603, "The Matrix")],
      ]),
    });
    await renderSection("watchlist");

    expect(getLibraryTitles).toHaveBeenCalledWith([603, 550]);
    const grid = screen.getByRole("list", { name: "Your watchlist, page 1" });
    expect(grid).toHaveAttribute("data-return-path", "/watchlist");
    expect(
      within(grid)
        .getAllByRole("listitem")
        .map((item) => item.dataset.testid),
    ).toEqual(["item-603", "item-550"]);
    expect(received(603)).toMatchObject({
      title: "The Matrix",
      posterUrl: "https://image.tmdb.org/t/p/w342/603.jpg",
      tmdbRating: 8.4,
      rating: null,
      watchedAt: null,
    });
  });

  it("carries the personal score and watched time on the watched page", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [
        { movieId: 550, watchedAt: "2026-09-23T12:00:00+00:00", rating: 9 },
        { movieId: 603, watchedAt: "2026-09-22T12:00:00+00:00", rating: null },
      ],
      total: 2,
    });
    await renderSection("watched");
    expect(received(550)).toMatchObject({
      rating: 9,
      watchedAt: "2026-09-23T12:00:00+00:00",
    });
    expect(received(603)).toMatchObject({ rating: null });
  });

  it("shows no pagination when the list fits on one page", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [{ movieId: 550 }],
      total: 20,
    });
    await renderSection("watchlist");
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
  });

  it("pages a longer list, with page 1 as the bare path", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [{ movieId: 550 }],
      total: 41,
    });
    await renderSection("watchlist", { page: "2" });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Your watchlist, page 2" }),
    ).toHaveAttribute("data-return-path", "/watchlist?page=2");
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/watchlist");
    expect(hrefs).toContain("/watchlist?page=3");
  });

  it.each([
    ["watchlist", ["TMDB rating", "Planned"]],
    ["watched", ["Your score"]],
  ] as const)("the %s legend lists %j", async (list, labels) => {
    const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
    read.mockResolvedValue({
      kind: "ok",
      rows: [
        { movieId: 550, watchedAt: "2026-09-23T12:00:00+00:00", rating: 7 },
      ],
      total: 1,
    });
    await renderSection(list);
    const legend = screen.getByRole("list", { name: "Badge legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(labels);
  });
});

describe("the list pages are kept out of search engines (AC-3)", () => {
  it.each([
    ["watchlist", () => import("@/app/watchlist/page")],
    ["watched", () => import("@/app/watched/page")],
  ])("/%s declares noindex", async (_, load) => {
    const { metadata } = await load();
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
