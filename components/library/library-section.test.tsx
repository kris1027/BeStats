import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryItem } from "./types";

/**
 * covers: spec 0008, AC-1 to AC-3, AC-9 to AC-11, AC-13; spec 0013, AC-13,
 * AC-15, AC-17; spec 0019, AC-1, AC-3, AC-5, AC-6, AC-8 to AC-11; feature 22
 *
 * `LibrarySection` is an async Server Component, so each test awaits it and
 * renders what it returns. The session, the Postgres reads and the TMDB
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
const getShowRatings = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({
  getMovieSummaries: vi.fn(),
  getTvShowsByIds: vi.fn(),
  getShowEpisodes: vi.fn(),
  TmdbError: class extends Error {},
}));
vi.mock("@/lib/tracking/library-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking/library-lists")>()),
  getWatchlistPage: (...args: unknown[]) => getWatchlistPage(...args),
  getWatchedPage: (...args: unknown[]) => getWatchedPage(...args),
  getLibraryTitles: (...args: unknown[]) => getLibraryTitles(...args),
}));
vi.mock("@/lib/tracking/show-ratings", () => ({
  getShowRatings: (...args: unknown[]) => getShowRatings(...args),
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
    nextEpisodes: Record<string, unknown>;
  }) => (
    <ul
      aria-label={props.label}
      data-return-path={props.returnPath}
      data-next-episodes={Object.keys(props.nextEpisodes).join(",")}
    >
      {props.items.map((item) => (
        <li
          key={`${item.kind}-${item.tmdbId}`}
          data-testid={`item-${item.kind}-${item.tmdbId}`}
        >
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

/** The item the grid stub received for one card. */
function received<Kind extends LibraryItem["kind"] = "movie">(
  id: number,
  kind = "movie" as Kind,
): Extract<LibraryItem, { kind: Kind }> {
  return JSON.parse(screen.getByTestId(`item-${kind}-${id}`).textContent ?? "");
}

/** A watchlist row for a planned movie. */
function planned(id: number) {
  return { kind: "movie", tmdbId: id, status: null };
}

/** A watched page row for a movie. */
function watchedMovie(id: number, watchedAt: string, rating: number | null) {
  return { kind: "movie", tmdbId: id, watchedAt, rating };
}

/** A watched page row for a Completed show. */
function completedShow(id: number, watchedAt = "2026-09-20T12:00:00+00:00") {
  return { kind: "tv", tmdbId: id, watchedAt, rating: null };
}

function showSummary(id: number, name: string) {
  return { id, name, posterUrl: null, tmdbRating: 8.9 };
}

/** The titles read with only these movies found. */
function movieTitles(entries: [number, ReturnType<typeof summary>][] = []) {
  return { kind: "ok", movies: new Map(entries), shows: new Map() };
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
  getLibraryTitles.mockResolvedValue(movieTitles());
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
    expect(getWatchedPage).toHaveBeenCalledWith("user-a", "tv", 1);
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
      ).toHaveAttribute("href", "/watchlist?type=tv");
      expect(getWatchlistPage).not.toHaveBeenCalled();
    },
  );

  it("treats a missing page as page 1, and a missing type as shows", async () => {
    getWatchlistPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await renderSection("watchlist");
    expect(getWatchlistPage).toHaveBeenCalledWith("user-a", "tv", 1);
  });

  it("reads the media type the navbar tab asks for (feature 22)", async () => {
    getWatchedPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await renderSection("watched", { type: "movie", page: "1" });
    expect(getWatchedPage).toHaveBeenCalledWith("user-a", "movie", 1);
  });

  it.each([["foo"], [""], [["tv", "movie"]]])(
    "shows 'That page doesn't exist' for type %j, before any read, never a redirect (feature 22)",
    async (type) => {
      await renderSection("watched", { type });
      expect(
        screen.getByRole("heading", { name: "That page doesn't exist" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("There is no Watched list at this address."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Back to Watched" }),
      ).toHaveAttribute("href", "/watched?type=tv");
      expect(getWatchedPage).not.toHaveBeenCalled();
    },
  );

  it("keeps the movies tab on a malformed page", async () => {
    await renderSection("watchlist", { type: "movie", page: "abc" });
    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/watchlist?type=movie");
    expect(getWatchlistPage).not.toHaveBeenCalled();
  });

  it("redirects a page past the end to the last page", async () => {
    getWatchedPage.mockResolvedValue({ kind: "ok", rows: [], total: 21 });
    await expect(renderSection("watched", { page: "7" })).rejects.toMatchObject(
      { url: "/watched?type=tv&page=2" },
    );
    expect(getLibraryTitles).not.toHaveBeenCalled();
  });

  it("redirects to page 1 of the same tab when the list is now empty", async () => {
    getWatchlistPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
    await expect(
      renderSection("watchlist", { type: "movie", page: "2" }),
    ).rejects.toMatchObject({ url: "/watchlist?type=movie" });
  });
});

describe("empty lists (AC-10; feature 22)", () => {
  it.each([
    [
      "watchlist",
      "tv",
      "Your show watchlist is empty",
      "Plan a show to see it here.",
      "Browse shows",
      "/shows",
    ],
    [
      "watchlist",
      "movie",
      "Your movie watchlist is empty",
      "Plan a movie to see it here.",
      "Browse movies",
      "/movies",
    ],
    [
      "watched",
      "tv",
      "No completed shows yet",
      "Shows you complete show up here.",
      "Browse shows",
      "/shows",
    ],
    [
      "watched",
      "movie",
      "No watched movies yet",
      "Movies you mark watched show up here.",
      "Browse movies",
      "/movies",
    ],
  ] as const)(
    "the %s page's %s tab shows its own empty panel with one Browse link",
    async (list, type, title, body, browse, href) => {
      const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
      read.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
      await renderSection(list, { type });
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: browse })).toHaveAttribute(
        "href",
        href,
      );
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(getLibraryTitles).not.toHaveBeenCalled();
    },
  );
});

describe("failures never look like an empty list (AC-11)", () => {
  it.each([
    ["watchlist", "Couldn't load your watchlist"],
    ["watched", "Couldn't load your watched titles"],
  ] as const)(
    "a failed %s read shows the error panel with Try again on the same page",
    async (list, title) => {
      const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
      read.mockResolvedValue({ kind: "failed" });
      await renderSection(list, { type: "movie", page: "3" });
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
        "href",
        `/${list}?type=movie&page=3`,
      );
      expect(screen.queryByText(/is empty|No watched/)).toBeNull();
      expect(getLibraryTitles).not.toHaveBeenCalled();
    },
  );

  it("a systemic TMDB failure shows 'Couldn't reach TMDB', not the grid", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [planned(550)],
      total: 1,
    });
    getLibraryTitles.mockResolvedValue({ kind: "failed" });
    await renderSection("watchlist");
    expect(
      screen.getByRole("heading", { name: "Couldn't reach TMDB" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/watchlist?type=tv",
    );
    expect(screen.queryByTestId("item-movie-550")).toBeNull();
  });

  it("keeps a card for a movie TMDB no longer has, with no title", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [planned(550), planned(2147480000)],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue(
      movieTitles([[550, summary(550, "Fight Club")]]),
    );
    await renderSection("watchlist");
    expect(received(2147480000)).toEqual({
      kind: "movie",
      tmdbId: 2147480000,
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
      rows: [planned(603), planned(550)],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue(
      movieTitles([
        [550, summary(550, "Fight Club")],
        [603, summary(603, "The Matrix")],
      ]),
    );
    await renderSection("watchlist", { type: "movie" });

    expect(getLibraryTitles).toHaveBeenCalledWith([603, 550], []);
    const grid = screen.getByRole("list", {
      name: "Movies on your watchlist, page 1",
    });
    expect(grid).toHaveAttribute("data-return-path", "/watchlist?type=movie");
    expect(
      within(grid)
        .getAllByRole("listitem")
        .map((item) => item.dataset.testid),
    ).toEqual(["item-movie-603", "item-movie-550"]);
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
        watchedMovie(550, "2026-09-23T12:00:00+00:00", 9),
        watchedMovie(603, "2026-09-22T12:00:00+00:00", null),
      ],
      total: 2,
    });
    await renderSection("watched");
    expect(received(550)).toEqual({
      kind: "movie",
      tmdbId: 550,
      title: null,
      posterUrl: null,
      tmdbRating: null,
      rating: 9,
      watchedAt: "2026-09-23T12:00:00+00:00",
    });
    expect(received(603)).toMatchObject({ rating: null });
    // No show on the page, so no rating read.
    expect(getShowRatings).not.toHaveBeenCalled();
  });

  it("shows no pagination when the list fits on one page", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [planned(550)],
      total: 20,
    });
    await renderSection("watchlist");
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
  });

  it("pages a longer list within its tab, with page 1 carrying no page", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [planned(550)],
      total: 41,
    });
    await renderSection("watchlist", { type: "movie", page: "2" });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Movies on your watchlist, page 2" }),
    ).toHaveAttribute("data-return-path", "/watchlist?type=movie&page=2");
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/watchlist?type=movie");
    expect(hrefs).toContain("/watchlist?type=movie&page=3");
  });

  it.each([
    [
      "watchlist",
      "tv",
      ["TMDB rating", "Planned", "Stop watching", "Next episode"],
    ],
    ["watchlist", "movie", ["TMDB rating", "Planned"]],
    ["watched", "tv", ["Your score"]],
    ["watched", "movie", ["Your score"]],
  ] as const)(
    "the %s legend on the %s tab lists %j",
    async (list, type, labels) => {
      const read = list === "watchlist" ? getWatchlistPage : getWatchedPage;
      read.mockResolvedValue({
        kind: "ok",
        rows: [
          list === "watchlist"
            ? planned(550)
            : watchedMovie(550, "2026-09-23T12:00:00+00:00", 7),
        ],
        total: 1,
      });
      await renderSection(list, { type });
      const legend = screen.getByRole("list", { name: "Badge legend" });
      expect(
        within(legend)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(labels);
    },
  );
});

describe("shows on the watchlist (spec 0013, AC-13, AC-15, AC-17)", () => {
  it("merges shows and movies in the Postgres order, each joined with its own titles", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [
        planned(550),
        { kind: "tv", tmdbId: 550, status: "watching" },
        { kind: "tv", tmdbId: 1399, status: "want_to_watch" },
      ],
      total: 3,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map([[550, summary(550, "Fight Club")]]),
      shows: new Map([
        [
          550,
          {
            id: 550,
            name: "A Show",
            posterUrl: null,
            tmdbRating: 7.1,
          },
        ],
      ]),
    });
    await renderSection("watchlist");

    expect(getLibraryTitles).toHaveBeenCalledWith([550], [550, 1399]);
    expect(
      screen.getAllByRole("listitem").map((item) => item.dataset.testid),
    ).toContain("item-tv-550");
    expect(received(550, "tv")).toMatchObject({
      kind: "tv",
      status: "watching",
      title: "A Show",
      tmdbRating: 7.1,
    });
    expect(received(550)).toMatchObject({ title: "Fight Club" });
    // A show TMDB no longer has keeps its card and its status, with no title.
    expect(received(1399, "tv")).toMatchObject({
      status: "want_to_watch",
      title: null,
    });
  });

  it("streams a Next episode pill for each show card TMDB still has, and none for movies", async () => {
    getWatchlistPage.mockResolvedValue({
      kind: "ok",
      rows: [
        planned(603),
        { kind: "tv", tmdbId: 1396, status: "watching" },
        { kind: "tv", tmdbId: 1399, status: "want_to_watch" },
      ],
      total: 3,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map([[603, summary(603, "The Matrix")]]),
      shows: new Map([
        [
          1396,
          { id: 1396, name: "Breaking Bad", posterUrl: null, tmdbRating: 8.9 },
        ],
      ]),
    });
    await renderSection("watchlist");
    expect(
      screen.getByRole("list", { name: "Shows on your watchlist, page 1" }),
    ).toHaveAttribute("data-next-episodes", "tv-1396");
  });
});

describe("Completed shows on the watched page (spec 0019)", () => {
  beforeEach(() => {
    getShowRatings.mockResolvedValue({ kind: "ok", ratings: new Map() });
  });

  it("keeps the Postgres order and joins each row with its titles (AC-1, AC-9)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [
        completedShow(1396),
        watchedMovie(550, "2026-09-19T12:00:00+00:00", 9),
      ],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map([[550, summary(550, "Fight Club")]]),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    await renderSection("watched");

    expect(getLibraryTitles).toHaveBeenCalledWith([550], [1396]);
    const grid = screen.getByRole("list", {
      name: "Shows you completed, page 1",
    });
    expect(
      within(grid)
        .getAllByRole("listitem")
        .map((item) => item.dataset.testid),
    ).toEqual(["item-tv-1396", "item-movie-550"]);
    // Completed is the view's filter; a show has no score and no Undo time.
    expect(received(1396, "tv")).toEqual({
      kind: "tv",
      tmdbId: 1396,
      status: "completed",
      title: "Breaking Bad",
      posterUrl: null,
      tmdbRating: 8.9,
      showRating: null,
    });
  });

  it("carries each show's calculated rating unrounded, and none for an unrated show (AC-5)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396), completedShow(1399)],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([
        [1396, showSummary(1396, "Breaking Bad")],
        [1399, showSummary(1399, "Game of Thrones")],
      ]),
    });
    getShowRatings.mockResolvedValue({
      kind: "ok",
      ratings: new Map([
        [1396, 22 / 3],
        [1399, null],
      ]),
    });
    await renderSection("watched", { page: "1" });

    expect(getShowRatings).toHaveBeenCalledWith("user-a", [1396, 1399]);
    expect(received(1396, "tv").showRating).toBeCloseTo(22 / 3, 10);
    expect(received(1399, "tv").showRating).toBeNull();
  });

  it("reads ratings only for shows TMDB found, and none when it found none (AC-8)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396), completedShow(2147480000)],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    await renderSection("watched");
    expect(getShowRatings).toHaveBeenCalledWith("user-a", [1396]);
    expect(received(2147480000, "tv")).toMatchObject({
      title: null,
      showRating: null,
    });

    getShowRatings.mockClear();
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map(),
    });
    await renderSection("watched");
    expect(getShowRatings).not.toHaveBeenCalled();
  });

  it("a failed rating read shows the list failure panel, never unbadged cards (AC-10)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396)],
      total: 21,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    getShowRatings.mockResolvedValue({ kind: "failed" });
    await renderSection("watched", { page: "2" });

    expect(
      screen.getByRole("heading", {
        name: "Couldn't load your watched titles",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/watched?type=tv&page=2",
    );
    expect(screen.queryByTestId("item-tv-1396")).toBeNull();
  });

  it("a TMDB outage shows the TMDB panel before any rating read (AC-10)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396)],
      total: 1,
    });
    getLibraryTitles.mockResolvedValue({ kind: "failed" });
    await renderSection("watched");
    expect(
      screen.getByRole("heading", { name: "Couldn't reach TMDB" }),
    ).toBeInTheDocument();
    expect(getShowRatings).not.toHaveBeenCalled();
  });

  it("builds no Next episode pill on the watched page", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396)],
      total: 1,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    await renderSection("watched");
    expect(
      screen.getByRole("list", { name: "Shows you completed, page 1" }),
    ).toHaveAttribute("data-next-episodes", "");
  });

  it("keeps a movie and a show sharing an id apart: the show's rating never reaches the movie (AC-5)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [
        watchedMovie(1396, "2026-09-21T12:00:00+00:00", 4),
        completedShow(1396),
      ],
      total: 2,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map([[1396, summary(1396, "A movie")]]),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    getShowRatings.mockResolvedValue({
      kind: "ok",
      ratings: new Map([[1396, 9.5]]),
    });
    await renderSection("watched");

    expect(received(1396, "movie")).toMatchObject({
      title: "A movie",
      rating: 4,
    });
    expect(received(1396, "movie")).not.toHaveProperty("showRating");
    expect(received(1396, "tv")).toMatchObject({
      title: "Breaking Bad",
      showRating: 9.5,
    });
    expect(received(1396, "tv")).not.toHaveProperty("rating");
  });

  it("keeps the legend to the single Your score entry with shows on the page (AC-9)", async () => {
    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396)],
      total: 1,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    await renderSection("watched");
    const legend = screen.getByRole("list", { name: "Badge legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Your score"]);
  });

  it("shows 'That page doesn't exist' for a malformed watched page, before any read (AC-3)", async () => {
    await renderSection("watched", { page: "abc" });
    expect(
      screen.getByRole("heading", { name: "That page doesn't exist" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/watched?type=tv");
    expect(getWatchedPage).not.toHaveBeenCalled();
    expect(getShowRatings).not.toHaveBeenCalled();
  });

  it("pages the tab's total and redirects past its end (AC-3; feature 22)", async () => {
    getWatchedPage.mockResolvedValue({ kind: "ok", rows: [], total: 21 });
    await expect(renderSection("watched", { page: "3" })).rejects.toMatchObject(
      { url: "/watched?type=tv&page=2" },
    );

    getWatchedPage.mockResolvedValue({
      kind: "ok",
      rows: [completedShow(1396)],
      total: 21,
    });
    getLibraryTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map(),
      shows: new Map([[1396, showSummary(1396, "Breaking Bad")]]),
    });
    await renderSection("watched", { page: "2" });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
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
