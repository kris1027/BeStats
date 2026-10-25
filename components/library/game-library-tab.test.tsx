import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryGameItem } from "./types";

/**
 * covers: spec 0027, AC-5 to AC-11, AC-14
 *
 * The games tabs through `LibrarySection`, as the page renders them. The
 * session, the flag, the Postgres page and the IGDB batch are the
 * boundaries and are replaced; `libraryLastPage`, the item mapping and the
 * date formatting stay real. The client grid has its own suite, so here it
 * is a stub that shows what it was handed. `redirect()` throws, as in Next.
 */
const requireUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ requireUser: () => requireUser() }));

const getGameLibraryPage = vi.fn();
const getLibraryGames = vi.fn();
const getShowLibraryTab = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tmdb", () => ({ TmdbError: class extends Error {} }));
vi.mock("@/lib/igdb", () => ({ IgdbError: class extends Error {} }));
vi.mock("@/lib/tracking/game-library", () => ({
  getGameLibraryPage: (...args: unknown[]) => getGameLibraryPage(...args),
  getLibraryGames: (...args: unknown[]) => getLibraryGames(...args),
}));
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

type List = "watchlist" | "upcoming" | "watched";

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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "on");
  requireUser.mockResolvedValue({ id: "user-a", email: "a@example.test" });
  getGameLibraryPage.mockResolvedValue(page([]));
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
  vi.unstubAllEnvs();
});

describe("the flag and the parameters (AC-5)", () => {
  it("answers ?type=game with the doesn't exist panel while the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "off");
    await renderSection("watchlist", { type: "game" });

    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Watchlist" }),
    ).toHaveAttribute("href", "/watchlist?type=tv");
    expect(getGameLibraryPage).not.toHaveBeenCalled();
  });

  it("throws on an invalid flag, so the error boundary shows", async () => {
    vi.stubEnv("NEXT_PUBLIC_GAMES_LIBRARY", "maybe");
    await expect(renderSection("watchlist", { type: "game" })).rejects.toThrow(
      "NEXT_PUBLIC_GAMES_LIBRARY",
    );
  });

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

  it("leaves the shows tab as it was", async () => {
    await renderSection("watchlist", {});
    expect(getShowLibraryTab).toHaveBeenCalled();
    expect(getGameLibraryPage).not.toHaveBeenCalled();
  });
});

describe("the reads and the panels (AC-6, AC-7, AC-14)", () => {
  it.each(["watchlist", "upcoming", "watched"] as const)(
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
    ["upcoming", "Nothing in progress"],
    ["watched", "No finished games yet"],
  ] as const)("shows the %s empty state as text only", async (list, title) => {
    await renderSection(list, { type: "game" });

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(getLibraryGames).not.toHaveBeenCalled();
  });

  it("shows the list's failed panel when Postgres fails", async () => {
    getGameLibraryPage.mockResolvedValue({ kind: "failed" });
    await renderSection("watchlist", { type: "game" });

    expect(
      screen.getByText("Couldn't load your watchlist"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/watchlist?type=game",
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

  it("marks an unreleased Want to play game with its date, or Date TBA", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1), row(2), row(3)]));
    withGames(
      game(1),
      game(2, { releaseDate: "2027-02-03" }),
      game(3, { releaseDate: null }),
    );
    await renderSection("watchlist", { type: "game" });

    expect(received(1).release).toEqual({ state: "released" });
    expect(received(2).release).toEqual({
      state: "unreleased",
      date: { shortDate: "Feb 3, 2027", fullDate: "Feb 3, 2027" },
    });
    expect(received(3).release).toEqual({ state: "unreleased", date: null });
    expect(received(1).dateLine).toBeNull();
  });

  it("counts the release day itself as released", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    withGames(game(1, { releaseDate: "2026-10-24" }));
    await renderSection("watchlist", { type: "game" });

    expect(received(1).release).toEqual({ state: "released" });
  });

  it("gives an unreleased game no release pill off Want to play", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    withGames(game(1, { releaseDate: null }));
    await renderSection("upcoming", { type: "game" });

    expect(received(1).release).toEqual({ state: "released" });
  });

  it("gives Playing a Started line and Finished a Finished line", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1, { rating: 8 })]));
    withGames(game(1));
    const playing = await renderSection("upcoming", { type: "game" });
    expect(received(1)).toMatchObject({
      dateLine: "Started Feb 2026",
      rating: 8,
    });
    playing.unmount();

    getGameLibraryPage.mockResolvedValue(page([row(1)]));
    await renderSection("watched", { type: "game" });
    expect(received(1).dateLine).toBe("Finished Mar 2026");
  });

  it("ignores a score on a Want to play row", async () => {
    getGameLibraryPage.mockResolvedValue(page([row(1, { rating: 7 })]));
    withGames(game(1));
    await renderSection("watchlist", { type: "game" });

    expect(received(1).rating).toBeNull();
  });

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
      coverUrl: null,
      communityRating: null,
      rating: null,
      hidden: false,
      release: { state: "released" },
      dateLine: null,
    });
    expect(received(2).hidden).toBe(true);
    expect(
      screen.getAllByRole("listitem").map((item) => item.dataset.testid),
    ).toEqual(["game-1", "game-2"]);
  });
});
