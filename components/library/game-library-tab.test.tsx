import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryGameItem, LibraryList } from "./types";

/**
 * covers: spec 0027, AC-5 to AC-11, AC-14; spec 0030, AC-11;
 * prompts/game-coming-soon.md, R1, R2, R5
 *
 * The games tabs through `LibrarySection`, as the page renders them. The
 * session, the Postgres page and the IGDB batch are the boundaries and are
 * replaced; `libraryLastPage`, the item mapping and the
 * date formatting stay real. The client grid has its own suite, so here it
 * is a stub that shows what it was handed. `redirect()` throws, as in Next.
 */
const requireUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ requireUser: () => requireUser() }));

const getGameLibraryPage = vi.fn();
const getWantToPlayTab = vi.fn();
const getLibraryGames = vi.fn();
const getShowLibraryTab = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({ TmdbError: class extends Error {} }));
vi.mock("@/lib/igdb", () => ({ IgdbError: class extends Error {} }));
vi.mock("@/lib/tracking/game-library", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/tracking/game-library")>();
  return {
    ...actual,
    // The real query filters on the tab's status, so a fixture row with no
    // status of its own is given that one.
    getGameLibraryPage: async (args: { tab: LibraryList }) => {
      const result = await getGameLibraryPage(args);
      if (result?.kind !== "ok") return result;
      const status = actual.GAME_LIBRARY_TABS[args.tab].status;
      return {
        ...result,
        rows: result.rows.map((row: object) => ({ status, ...row })),
      };
    },
    getLibraryGames: (...args: unknown[]) => getLibraryGames(...args),
    // Want to play and Coming soon read only Want to play rows.
    getWantToPlayTab: async (args: unknown) => {
      const result = await getWantToPlayTab(args);
      if (result?.kind !== "ok") return result;
      return {
        ...result,
        rows: result.rows.map((row: object) => ({
          status: "want_to_play",
          ...row,
        })),
      };
    },
  };
});
vi.mock("@/lib/tracking/library-lists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tracking/library-lists")>()),
  getShowLibraryTab: (...args: unknown[]) => getShowLibraryTab(...args),
}));
vi.mock("@/lib/tracking/episode-state", () => ({
  requestTodayUtc: () => "2026-10-24",
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

vi.mock("./game-library-grid", () => ({
  GameLibraryGrid: (props: {
    items: LibraryGameItem[];
    label: string;
    returnPath: string;
  }) => (
    <ul aria-label={props.label} data-return-path={props.returnPath}>
      {props.items.map((item) => (
        <li key={item.gameId} data-testid={`game-${item.gameId}`}>
          {JSON.stringify(item)}
        </li>
      ))}
    </ul>
  ),
}));

const { LibrarySection } = await import("./library-section");

type List = "watchlist" | "upcoming" | "watched" | "coming-soon";

async function renderSection(
  list: List,
  params: Record<string, string | string[] | undefined> = {},
) {
  return render(
    await LibrarySection({ list, searchParams: Promise.resolve(params) }),
  );
}

function received(id: number): LibraryGameItem {
  return JSON.parse(screen.getByTestId(`game-${id}`).textContent ?? "");
}

function row(gameId: number, extra: Record<string, unknown> = {}) {
  return {
    gameId,
    rating: null,
    addedAt: "2026-01-05T10:00:00+00:00",
    startedAt: "2026-02-05T10:00:00+00:00",
    finishedAt: "2026-03-05T10:00:00+00:00",
    ...extra,
  };
}

function game(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Game ${id}`,
    coverUrl: null,
    artUrl: null,
    releaseDate: "2020-05-01",
    releaseYear: 2020,
    communityRating: 8.1,
    communityRatingCount: 100,
    genreIds: [],
    platformIds: [],
    hidden: false,
    ...extra,
  };
}

function page(rows: unknown[], total = rows.length) {
  return { kind: "ok", rows, total };
}

/** A Want to play or Coming soon read: its page of rows and their games. */
function split(
  rows: { gameId: number }[],
  games: ReturnType<typeof game>[] = [],
  extra: { total?: number; capped?: boolean } = {},
) {
  return {
    kind: "ok",
    rows,
    games: new Map(games.map((g) => [g.id, g])),
    total: extra.total ?? rows.length,
    capped: extra.capped ?? false,
  };
}

beforeEach(() => {
  requireUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  getGameLibraryPage.mockResolvedValue(page([]));
  getWantToPlayTab.mockResolvedValue(split([]));
  getLibraryGames.mockResolvedValue({
    kind: "ok",
    games: new Map(),
    missingIds: [],
  });
  getShowLibraryTab.mockResolvedValue({
    kind: "ok",
    cards: [],
    total: 0,
    failedCount: 0,
    capped: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the parameters (AC-5)", () => {
  it("keeps type=game in a malformed page's Back to page 1 link", async () => {
    await renderSection("watched", { type: "game", page: "x" });

    expect(
      screen.getByRole("link", { name: "Back to page 1" }),
    ).toHaveAttribute("href", "/watched?type=game");
    expect(getGameLibraryPage).not.toHaveBeenCalled();
  });

  it("reads nothing when requireUser refuses the request", async () => {
    requireUser.mockRejectedValue(new RedirectSignal("/sign-in"));
    await expect(
      renderSection("upcoming", { type: "game" }),
    ).rejects.toMatchObject({ url: "/sign-in" });
    expect(getGameLibraryPage).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ type: "tv" }], [{ type: "movie" }], [{ type: "book" }]])(
    "has no Coming soon page for %j",
    async (params) => {
      await renderSection("coming-soon", params);

      expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Back to Coming soon" }),
      ).toHaveAttribute("href", "/coming-soon?type=game");
      expect(getWantToPlayTab).not.toHaveBeenCalled();
      expect(getShowLibraryTab).not.toHaveBeenCalled();
    },
  );

  it("leaves the shows tab as it was", async () => {
    await renderSection("watchlist", {});
    expect(getShowLibraryTab).toHaveBeenCalled();
    expect(getGameLibraryPage).not.toHaveBeenCalled();
  });
});

describe("the reads and the panels (AC-6, AC-7, AC-14)", () => {
  it.each(["upcoming", "watched"] as const)(
    "reads the %s games page for the session user and that page's games",
    async (list) => {
      getGameLibraryPage.mockResolvedValue(page([row(1), row(2)], 30));
      await renderSection(list, { type: "game", page: "1" });

      expect(getGameLibraryPage).toHaveBeenCalledWith({
        userId: "user-a",
        tab: list,
        page: 1,
      });
      expect(getLibraryGames).toHaveBeenCalledWith([1, 2]);
      expect(
        screen.getByRole("navigation", { name: "Pagination" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["watchlist", "coming-soon"] as const)(
    "reads %s from the Want to play split for the session user, with today",
    async (list) => {
      getWantToPlayTab.mockResolvedValue(
        split([row(1), row(2)], [game(1), game(2)], { total: 30 }),
      );
      await renderSection(list, { type: "game", page: "1" });

      expect(getWantToPlayTab).toHaveBeenCalledWith({
        userId: "user-a",
        tab: list,
        page: 1,
        today: "2026-10-24",
      });
      expect(getGameLibraryPage).not.toHaveBeenCalled();
      expect(getLibraryGames).not.toHaveBeenCalled();
      expect(
        screen.getByRole("navigation", { name: "Pagination" }),
      ).toBeInTheDocument();
    },
  );

  it("labels Coming soon's grid and keeps type=game in its return path", async () => {
    getWantToPlayTab.mockResolvedValue(split([row(1)], [game(1)]));
    await renderSection("coming-soon", { type: "game" });

    expect(
      screen.getByRole("list", {
        name: "Unreleased games you want to play, page 1",
      }),
    ).toHaveAttribute("data-return-path", "/coming-soon?type=game");
  });

  it("redirects Coming soon past the end to its last page", async () => {
    getWantToPlayTab.mockResolvedValue(split([], [], { total: 30 }));
    await expect(
      renderSection("coming-soon", { type: "game", page: "5" }),
    ).rejects.toMatchObject({ url: "/coming-soon?type=game&page=2" });
  });

  it.each(["watchlist", "coming-soon"] as const)(
    "says on %s when the ceiling left older games unchecked",
    async (list) => {
      getWantToPlayTab.mockResolvedValue(
        split([row(1)], [game(1)], { capped: true }),
      );
      await renderSection(list, { type: "game" });

      expect(
        screen.getByText("Checked your 500 most recent games"),
      ).toBeInTheDocument();
    },
  );

  it.each(["watchlist", "coming-soon"] as const)(
    "shows %s's failed panels",
    async (list) => {
      getWantToPlayTab.mockResolvedValue({ kind: "failed" });
      const failed = await renderSection(list, { type: "game" });
      expect(screen.getByText("Couldn't load your list")).toBeInTheDocument();
      failed.unmount();

      getWantToPlayTab.mockResolvedValue({ kind: "igdb_failed" });
      await renderSection(list, { type: "game" });
      expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
        "href",
        `/${list}?type=game`,
      );
    },
  );

  it("labels each grid and keeps type=game in its return path", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    await renderSection("upcoming", { type: "game" });

    expect(
      screen.getByRole("list", { name: "Games you're playing, page 1" }),
    ).toHaveAttribute("data-return-path", "/upcoming?type=game");
  });

  it("redirects a page past the end to the last page", async () => {
    getGameLibraryPage.mockResolvedValue(page([], 30));
    await expect(
      renderSection("watched", { type: "game", page: "5" }),
    ).rejects.toMatchObject({ url: "/watched?type=game&page=2" });
  });

  it("redirects an empty tab past page 1 to page 1", async () => {
    getGameLibraryPage.mockResolvedValue(page([], 0));
    await expect(
      renderSection("watched", { type: "game", page: "3" }),
    ).rejects.toMatchObject({ url: "/watched?type=game" });
  });

  it.each([
    ["watchlist", "No games to play yet"],
    ["coming-soon", "No unreleased games on your list"],
    ["upcoming", "Nothing in progress"],
    ["watched", "No finished games yet"],
  ] as const)(
    "shows the %s empty state with Browse games (spec 0028, AC-17)",
    async (list, title) => {
      await renderSection(list, { type: "game" });

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Browse games" }),
      ).toHaveAttribute("href", "/games");
      expect(getLibraryGames).not.toHaveBeenCalled();
    },
  );

  it("shows the list's failed panel when Postgres fails", async () => {
    getGameLibraryPage.mockResolvedValue({ kind: "failed" });
    await renderSection("upcoming", { type: "game" });

    expect(screen.getByText("Couldn't load your list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/upcoming?type=game",
    );
  });

  it("shows Couldn't reach IGDB, never the empty state, when IGDB fails", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1)], 1));
    getLibraryGames.mockResolvedValue({ kind: "failed" });
    await renderSection("watched", { type: "game", page: "1" });

    expect(screen.getByText("Couldn't reach IGDB")).toBeInTheDocument();
    expect(
      screen.getByText(
        "IGDB didn't respond, so the games couldn't load. Try again in a moment.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("No finished games yet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/watched?type=game",
    );
  });
});

describe("the cards (AC-8 to AC-11)", () => {
  function withGames(...games: ReturnType<typeof game>[]) {
    getLibraryGames.mockResolvedValue({
      kind: "ok",
      games: new Map(games.map((g) => [g.id, g])),
      missingIds: [],
    });
  }

  it("marks a Coming soon game with its date, or Date TBA", async () => {
    getWantToPlayTab.mockResolvedValue(
      split(
        [row(2), row(3)],
        [
          game(2, { releaseDate: "2027-02-03" }),
          game(3, { releaseDate: null }),
        ],
      ),
    );
    await renderSection("coming-soon", { type: "game" });

    expect(received(2).unreleased).toEqual({
      date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
    });
    expect(received(3).unreleased).toEqual({ date: null });
    expect(received(2).dateLine).toBeNull();
    expect(received(2).status).toBe("want_to_play");
  });

  it("gives a released Want to play game no release pill", async () => {
    getWantToPlayTab.mockResolvedValue(
      split([row(1)], [game(1, { releaseDate: "2026-10-24" })]),
    );
    await renderSection("watchlist", { type: "game" });

    expect(received(1).unreleased).toBeNull();
  });

  it("gives an unreleased game no release pill off Want to play", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    withGames(game(1, { releaseDate: null }));
    await renderSection("upcoming", { type: "game" });

    expect(received(1).unreleased).toBeNull();
  });

  it("gives Playing a Started line and Finished a Finished line", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1, { rating: 8 })]));
    withGames(game(1));
    const playing = await renderSection("upcoming", { type: "game" });
    expect(received(1)).toMatchObject({
      status: "playing",
      dateLine: "Started Feb 2026",
      rating: 8,
    });
    playing.unmount();

    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    await renderSection("watched", { type: "game" });
    expect(received(1).dateLine).toBe("Finished Mar 2026");
  });

  it("takes the card's status from the stored row, not the tab (AC-8)", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1, { status: "playing" })]));
    withGames(game(1));
    await renderSection("watched", { type: "game" });

    expect(received(1).status).toBe("playing");
  });

  it.each(["watchlist", "coming-soon"] as const)(
    "ignores a score on a %s row",
    async (list) => {
      getWantToPlayTab.mockResolvedValue(
        split([row(1, { rating: 7 })], [game(1, { releaseDate: null })]),
      );
      await renderSection(list, { type: "game" });

      expect(received(1).rating).toBeNull();
      expect(received(1).status).toBe("want_to_play");
    },
  );

  it("passes hidden through, and invents nothing for a missing game", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1), row(2)]));
    getLibraryGames.mockResolvedValue({
      kind: "ok",
      games: new Map([[2, game(2, { hidden: true })]]),
      missingIds: [1],
    });
    await renderSection("watched", { type: "game" });

    expect(received(1)).toEqual({
      gameId: 1,
      name: null,
      status: "finished",
      coverUrl: null,
      communityRating: null,
      rating: null,
      hidden: false,
      unreleased: null,
      dateLine: null,
    });
    expect(received(2).hidden).toBe(true);
    expect(received(2).status).toBe("finished");
    expect(
      screen.getAllByRole("listitem").map((item) => item.dataset.testid),
    ).toEqual(["game-1", "game-2"]);
  });
});
