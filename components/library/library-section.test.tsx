import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryMovieItem } from "./types";

/**
 * covers: spec 0008, AC-3, AC-9, AC-11, AC-13; spec 0019, AC-5, AC-10;
 * spec 0020, AC-9 to AC-18; feature 22
 *
 * `LibrarySection` is an async Server Component, so each test awaits it and
 * renders what it returns. The session, the library reads and the rating
 * read are the boundaries and are replaced; `libraryLastPage` stays real, so
 * the redirect follows the same arithmetic the app uses. The client grid,
 * the streamed Watchlist show card, the held section and the missing show
 * card have their own suites, so here they are stubs that show what they
 * were handed. `redirect()` throws, as it does in Next.
 */
const requireUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ requireUser: () => requireUser() }));

const getShowLibraryTab = vi.fn();
const getMovieLibraryTab = vi.fn();
const getWatchedMoviesPage = vi.fn();
const getLibraryMovieTitles = vi.fn();
const getShowRatings = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({ TmdbError: class extends Error {} }));
vi.mock("@/lib/tracking/library-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking/library-lists")>()),
  getShowLibraryTab: (...args: unknown[]) => getShowLibraryTab(...args),
  getMovieLibraryTab: (...args: unknown[]) => getMovieLibraryTab(...args),
  getWatchedMoviesPage: (...args: unknown[]) => getWatchedMoviesPage(...args),
  getLibraryMovieTitles: (...args: unknown[]) => getLibraryMovieTitles(...args),
}));
vi.mock("@/lib/tracking/show-ratings", () => ({
  getShowRatings: (...args: unknown[]) => getShowRatings(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-07",
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
    items: LibraryMovieItem[];
    label: string;
    returnPath: string;
  }) => (
    <ul aria-label={props.label} data-return-path={props.returnPath}>
      {props.items.map((item) => (
        <li key={item.tmdbId} data-testid={`movie-${item.tmdbId}`}>
          {JSON.stringify(item)}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("./watchlist-show-card", () => ({
  WatchlistShowCard: (props: {
    showId: number;
    next: { season: number; episode: number };
  }) => (
    <span data-testid={`watchlist-show-${props.showId}`}>
      S{props.next.season}E{props.next.episode}
    </span>
  ),
}));
vi.mock("./held-shows", () => ({
  HeldShowsSection: () => <p data-testid="held-shows">held</p>,
}));
vi.mock("./held-show-card", () => ({
  MissingShowCard: (props: { showId: number }) => (
    <span data-testid={`missing-show-${props.showId}`}>missing</span>
  ),
}));

const { LibrarySection } = await import("./library-section");

type List = "watchlist" | "upcoming" | "watched";

async function renderSection(
  list: List,
  params: Record<string, string | string[] | undefined> = {},
) {
  return render(
    await LibrarySection({ list, searchParams: Promise.resolve(params) }),
  );
}

const TITLE = { name: "Severance", posterUrl: null, tmdbRating: 8.4 };

function tab(cards: unknown[], extra: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    cards,
    total: cards.length,
    failedCount: 0,
    capped: false,
    ...extra,
  };
}

function received(id: number): LibraryMovieItem {
  return JSON.parse(screen.getByTestId(`movie-${id}`).textContent ?? "");
}

beforeEach(() => {
  requireUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  getShowLibraryTab.mockResolvedValue(tab([]));
  getMovieLibraryTab.mockResolvedValue(tab([]));
  getWatchedMoviesPage.mockResolvedValue({ kind: "ok", rows: [], total: 0 });
  getLibraryMovieTitles.mockResolvedValue({ kind: "ok", movies: new Map() });
  getShowRatings.mockResolvedValue({ kind: "ok", ratings: new Map() });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the session and the parameters come first", () => {
  it("reads nothing when requireUser refuses the request", async () => {
    requireUser.mockRejectedValue(new RedirectSignal("/sign-in"));
    await expect(renderSection("upcoming")).rejects.toMatchObject({
      url: "/sign-in",
    });
    expect(getShowLibraryTab).not.toHaveBeenCalled();
  });

  it.each(["watchlist", "upcoming", "watched"] as const)(
    "answers a bad type on %s with a panel and no read",
    async (list) => {
      await renderSection(list, { type: "anime" });
      expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
      expect(getShowLibraryTab).not.toHaveBeenCalled();
      expect(getMovieLibraryTab).not.toHaveBeenCalled();
    },
  );

  it("answers a malformed page with a panel that keeps the tab (AC-16)", async () => {
    await renderSection("upcoming", { type: "movie", page: "x" });
    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/upcoming?type=movie");
    expect(getMovieLibraryTab).not.toHaveBeenCalled();
  });
});

describe("the reads each tab makes (AC-15, AC-16)", () => {
  it.each(["watchlist", "upcoming", "watched"] as const)(
    "classifies the %s shows tab for the session user, page and today",
    async (list) => {
      await renderSection(list, { type: "tv", page: "1" });
      expect(getShowLibraryTab).toHaveBeenCalledWith({
        userId: "user-a",
        tab: list,
        page: 1,
        today: "2026-10-07",
      });
    },
  );

  it.each(["watchlist", "upcoming"] as const)(
    "classifies the %s movies tab",
    async (list) => {
      await renderSection(list, { type: "movie" });
      expect(getMovieLibraryTab).toHaveBeenCalledWith({
        userId: "user-a",
        tab: list,
        page: 1,
        today: "2026-10-07",
      });
      expect(getWatchedMoviesPage).not.toHaveBeenCalled();
    },
  );

  it("reads watched movies with no classification", async () => {
    await renderSection("watched", { type: "movie" });
    expect(getWatchedMoviesPage).toHaveBeenCalledWith("user-a", 1);
    expect(getMovieLibraryTab).not.toHaveBeenCalled();
  });

  it("redirects a page past the end to the last page", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab([{ page: "watched", showId: 1, title: TITLE, label: "finished" }], {
        total: 21,
      }),
    );
    await expect(
      renderSection("watched", { type: "tv", page: "3" }),
    ).rejects.toMatchObject({ url: "/watched?type=tv&page=2" });
  });
});

describe("failures never look like an empty list (AC-17)", () => {
  it("shows the list panel with Try again on the same page for a failed read", async () => {
    getShowLibraryTab.mockResolvedValue({ kind: "failed" });
    await renderSection("upcoming", { type: "tv", page: "2" });
    expect(
      screen.getByText("Couldn't load your upcoming titles"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/upcoming?type=tv&page=2",
    );
  });

  it("shows the TMDB panel for a systemic failure", async () => {
    getMovieLibraryTab.mockResolvedValue({ kind: "tmdb_failed" });
    await renderSection("watchlist", { type: "movie" });
    expect(screen.getByText("Couldn't reach TMDB")).toBeInTheDocument();
  });

  it("notes the titles that couldn't load, with Retry, beside the cards", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab(
        [
          {
            page: "upcoming",
            showId: 1,
            title: TITLE,
            airDate: null,
            next: null,
          },
        ],
        { failedCount: 2 },
      ),
    );
    await renderSection("upcoming", { type: "tv" });
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("2 shows couldn't be loaded");
    expect(
      within(note).getByRole("link", { name: "Try again" }),
    ).toHaveAttribute("href", "/upcoming?type=tv");
  });

  it("notes the ceiling on an empty tab too (AC-16)", async () => {
    getMovieLibraryTab.mockResolvedValue(tab([], { capped: true }));
    await renderSection("upcoming", { type: "movie" });
    expect(
      screen.getByText("Checked your 500 most recent movies"),
    ).toBeInTheDocument();
    expect(screen.getByText("No upcoming movies")).toBeInTheDocument();
  });

  it("shows the list panel when the watched show ratings fail (spec 0019, AC-10)", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab([{ page: "watched", showId: 1, title: TITLE, label: "finished" }]),
    );
    getShowRatings.mockResolvedValue({ kind: "failed" });
    await renderSection("watched", { type: "tv" });
    expect(
      screen.getByText("Couldn't load your watched titles"),
    ).toBeInTheDocument();
  });
});

describe("empty states (AC-18)", () => {
  it.each([
    ["watchlist", "tv", "Nothing to watch right now", "/shows"],
    ["upcoming", "tv", "Nothing coming up", "/shows"],
    ["watched", "tv", "No watched shows yet", "/shows"],
    ["watchlist", "movie", "No movies to watch", "/movies"],
    ["upcoming", "movie", "No upcoming movies", "/movies"],
    ["watched", "movie", "No watched movies yet", "/movies"],
  ] as const)(
    "%s %s says %s and offers its catalog",
    async (list, type, title, href) => {
      await renderSection(list, { type });
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Browse/ })).toHaveAttribute(
        "href",
        href,
      );
    },
  );

  it("shows the Watchlist empty panel above the Paused & dropped section (AC-10)", async () => {
    await renderSection("watchlist", { type: "tv" });
    const empty = screen.getByText("Nothing to watch right now");
    const held = screen.getByTestId("held-shows");
    expect(
      empty.compareDocumentPosition(held) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("show cards (AC-9 to AC-12)", () => {
  it("renders Watchlist cards with their next episode, a missing show last, and the held section on page 1", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab([
        {
          page: "watchlist",
          showId: 1,
          title: TITLE,
          next: { season: 1, episode: 3 },
        },
        { page: "missing", showId: 2 },
      ]),
    );
    await renderSection("watchlist", { type: "tv" });
    expect(screen.getByTestId("watchlist-show-1")).toHaveTextContent("S1E3");
    expect(screen.getByTestId("missing-show-2")).toBeInTheDocument();
    expect(screen.getByTestId("held-shows")).toBeInTheDocument();
  });

  it("leaves the held section off a later page (AC-10)", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab(
        [
          {
            page: "watchlist",
            showId: 1,
            title: TITLE,
            next: { season: 1, episode: 1 },
          },
        ],
        { total: 21 },
      ),
    );
    await renderSection("watchlist", { type: "tv", page: "2" });
    expect(screen.queryByTestId("held-shows")).not.toBeInTheDocument();
  });

  it("renders Upcoming cards dated or Date TBA, with no button (AC-11)", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab([
        {
          page: "upcoming",
          showId: 1,
          title: TITLE,
          airDate: "2026-10-20",
          next: { season: 2, episode: 1 },
        },
        {
          page: "upcoming",
          showId: 2,
          title: { ...TITLE, name: "Andor" },
          airDate: null,
          next: null,
        },
      ]),
    );
    await renderSection("upcoming", { type: "tv" });
    expect(screen.getByText("S2E1 · Oct 20")).toBeInTheDocument();
    expect(
      screen.getByText("Season 2 episode 1 airs Oct 20, 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Date TBA")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders Watched cards with the calculated rating and their label (AC-12)", async () => {
    getShowLibraryTab.mockResolvedValue(
      tab([
        { page: "watched", showId: 1, title: TITLE, label: "finished" },
        {
          page: "watched",
          showId: 2,
          title: { ...TITLE, name: "Andor" },
          label: "caught_up",
        },
      ]),
    );
    getShowRatings.mockResolvedValue({
      kind: "ok",
      ratings: new Map([
        [1, 8.25],
        [2, null],
      ]),
    });
    await renderSection("watched", { type: "tv" });
    expect(getShowRatings).toHaveBeenCalledWith("user-a", [1, 2]);
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("Caught up")).toBeInTheDocument();
    expect(screen.getByText("8.3")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["watchlist", ["Next episode", "Mark watched"]],
    ["upcoming", ["Air date"]],
    ["watched", ["Your score"]],
  ] as const)(
    "keeps the %s shows legend to its own badges",
    async (list, entries) => {
      getShowLibraryTab.mockResolvedValue(
        tab([
          list === "watchlist"
            ? {
                page: "watchlist",
                showId: 1,
                title: TITLE,
                next: { season: 1, episode: 1 },
              }
            : list === "upcoming"
              ? {
                  page: "upcoming",
                  showId: 1,
                  title: TITLE,
                  airDate: null,
                  next: null,
                }
              : { page: "watched", showId: 1, title: TITLE, label: "finished" },
        ]),
      );
      await renderSection(list, { type: "tv" });
      const legend = screen.getByRole("list", { name: "Badge legend" });
      expect(
        within(legend)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(entries);
    },
  );
});

describe("movie cards (AC-13)", () => {
  it("hands Upcoming movies to the grid with their release formatted, Date TBA as null", async () => {
    getMovieLibraryTab.mockResolvedValue(
      tab([
        {
          page: "upcoming",
          movieId: 1,
          title: { name: "Dune", posterUrl: null, tmdbRating: 8 },
          releaseDate: "2027-02-03",
        },
        {
          page: "upcoming",
          movieId: 2,
          title: { name: "Untitled", posterUrl: null, tmdbRating: null },
          releaseDate: null,
        },
      ]),
    );
    await renderSection("upcoming", { type: "movie" });
    expect(received(1)).toMatchObject({
      title: "Dune",
      release: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
    });
    expect(received(2).release).toBeNull();
    expect(
      screen.getByRole("list", { name: "Movies coming up, page 1" }),
    ).toHaveAttribute("data-return-path", "/upcoming?type=movie");
  });

  it("hands a missing Watchlist movie to the grid with no title (AC-17)", async () => {
    getMovieLibraryTab.mockResolvedValue(
      tab([{ page: "missing", movieId: 9 }]),
    );
    await renderSection("watchlist", { type: "movie" });
    expect(received(9)).toMatchObject({ title: null, tmdbRating: null });
  });

  it("joins watched movies with their titles, keeping score and watched time", async () => {
    getWatchedMoviesPage.mockResolvedValue({
      kind: "ok",
      rows: [
        { tmdbId: 603, watchedAt: "2026-09-01T10:00:00+00:00", rating: 9 },
      ],
      total: 1,
    });
    getLibraryMovieTitles.mockResolvedValue({
      kind: "ok",
      movies: new Map([
        [
          603,
          { id: 603, title: "The Matrix", posterUrl: null, tmdbRating: 8.2 },
        ],
      ]),
    });
    await renderSection("watched", { type: "movie" });
    expect(received(603)).toMatchObject({
      title: "The Matrix",
      rating: 9,
      watchedAt: "2026-09-01T10:00:00+00:00",
    });
  });
});
