import { v1LibrarySchema } from "@bestats/core/api/v1/library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH, ctx, errorOf, req, VERSION } from "../../test-kit";

/**
 * covers: spec 0033, AC-10 (API half); spec 0035, `LibraryEntry`, Caching,
 * Critical test scenarios (Library); the 4d decisions in
 * prompts/mobile-api-v1.md (missing card, outage, 24 per page, notes)
 *
 * The bearer check and the library loaders are the boundaries; the loaders
 * have their own tests, so these assert which loader each type and route
 * pair reaches, that it gets the bearer client, and how its result becomes
 * entries. Every success body parses with the core schema.
 */
const BEARER_CLIENT = { bearer: true };
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const getShowLibraryTab = vi.fn();
const getMovieLibraryTab = vi.fn();
const getWatchedMoviesPage = vi.fn();
const getLibraryMovieTitles = vi.fn();
vi.mock("@/lib/tracking/library-lists", () => ({
  getShowLibraryTab,
  getMovieLibraryTab,
  getWatchedMoviesPage,
  getLibraryMovieTitles,
  libraryLastPage: (total: number) => Math.max(1, Math.ceil(total / 24)),
}));

const getWantToPlayTab = vi.fn();
const getGameLibraryPage = vi.fn();
const getLibraryGames = vi.fn();
vi.mock("@/lib/tracking/game-library", () => ({
  getWantToPlayTab,
  getGameLibraryPage,
  getLibraryGames,
}));

const readTitles = vi.fn();
vi.mock("@/lib/tracking/commands/read-titles", () => ({ readTitles }));

const { GET } = await import("./route");

const TITLE = {
  name: "Dark",
  posterUrl: "https://image.tmdb.org/t/p/w500/d.jpg",
  tmdbRating: 8.4,
};
const SHOW_STATE = {
  tracked: true,
  progress: null,
  seasonRatings: [],
  showRating: null,
};
const MOVIE_STATE = { planned: true, watchedAt: null, rating: null };
const GAME_STATE = { status: "playing", rating: 8 };
const GAME = {
  id: 1942,
  name: "The Witcher 3",
  coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/a.jpg",
  communityRating: 93,
  releaseDate: "2015-05-19",
};

/** `readTitles` answers the empty state of each key it is asked for. */
function titlesFor(refs: { type: string; id: number }[]) {
  const states: Record<string, unknown> = {
    movie: MOVIE_STATE,
    tv: SHOW_STATE,
    game: GAME_STATE,
  };
  return Object.fromEntries(
    refs.map((ref) => [`${ref.type}:${ref.id}`, states[ref.type]]),
  );
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  verifyBearer.mockResolvedValue({ userId: "user-a", client: BEARER_CLIENT });
  readTitles.mockImplementation(async (_deps, refs) => titlesFor(refs));
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

const library = (query: string, headers: Record<string, string> = AUTH) =>
  GET(req(`/api/v1/me/library?${query}`, headers), ctx());

async function bodyOf(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  return v1LibrarySchema.parse(await response.json());
}

describe("auth and the type and route pair", () => {
  it("answers 401 without a token, private and unread", async () => {
    verifyBearer.mockResolvedValue(null);
    const response = await library("type=tv&path=/up-next", VERSION);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getShowLibraryTab).not.toHaveBeenCalled();
  });

  it.each([
    ["tv", "/playing"],
    ["game", "/up-next"],
    ["movie", "/finished"],
    ["tv", "/coming-soon"],
  ])("answers %s at %s, a pair with no page, with 404", async (type, path) => {
    const response = await library(`type=${type}&path=${path}`);
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
    expect(readTitles).not.toHaveBeenCalled();
  });

  it.each([
    "type=tv&path=/search",
    "type=book&path=/watched",
    "type=tv&path=/watched&page=0",
    "path=/watched",
  ])("refuses %s with 400", async (query) => {
    expect((await library(query)).status).toBe(400);
  });
});

describe("shows", () => {
  it("reads the page the route names, for the token's user, with its client", async () => {
    getShowLibraryTab.mockResolvedValue({
      kind: "ok",
      cards: [
        {
          page: "watchlist",
          showId: 70523,
          title: TITLE,
          next: { season: 2, episode: 3 },
        },
        { page: "missing", showId: 9 },
      ],
      total: 30,
      failedCount: 1,
      capped: false,
    });
    const body = await bodyOf(await library("type=tv&path=/up-next&page=1"));

    expect(getShowLibraryTab).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", tab: "watchlist", page: 1 }),
      expect.any(Function),
    );
    const getClient = getShowLibraryTab.mock.calls[0][1];
    expect(await getClient()).toBe(BEARER_CLIENT);

    expect(body).toMatchObject({
      type: "tv",
      path: "/up-next",
      page: 1,
      pageSize: 24,
      total: 30,
      failedCount: 1,
      capped: false,
      nextPage: 2,
    });
    expect(body.entries).toEqual([
      {
        type: "tv",
        id: 70523,
        path: "/shows/70523",
        user: SHOW_STATE,
        card: {
          kind: "title",
          ...TITLE,
          place: { page: "watchlist", next: { season: 2, episode: 3 } },
        },
      },
      {
        type: "tv",
        id: 9,
        path: "/shows/9",
        user: SHOW_STATE,
        card: { kind: "missing" },
      },
    ]);
    expect(readTitles).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a" }),
      [
        { type: "tv", id: 70523 },
        { type: "tv", id: 9 },
      ],
    );
  });

  it("reads /watched as the shows Watched page for type=tv", async () => {
    getShowLibraryTab.mockResolvedValue({
      kind: "ok",
      cards: [{ page: "watched", showId: 1, title: TITLE, label: "finished" }],
      total: 1,
      failedCount: 0,
      capped: false,
    });
    const body = await bodyOf(await library("type=tv&path=/watched"));
    expect(getShowLibraryTab).toHaveBeenCalledWith(
      expect.objectContaining({ tab: "watched" }),
      expect.any(Function),
    );
    expect(getWatchedMoviesPage).not.toHaveBeenCalled();
    expect(body.nextPage).toBeNull();
  });

  it("answers a TMDB outage with 502 and a database failure with 500", async () => {
    getShowLibraryTab.mockResolvedValue({ kind: "tmdb_failed" });
    expect((await library("type=tv&path=/upcoming")).status).toBe(502);
    getShowLibraryTab.mockResolvedValue({ kind: "failed" });
    expect((await library("type=tv&path=/upcoming")).status).toBe(500);
  });
});

describe("movies", () => {
  it("reads /coming-soon as the movies Coming soon page", async () => {
    getMovieLibraryTab.mockResolvedValue({
      kind: "ok",
      cards: [
        { page: "upcoming", movieId: 1, title: TITLE, releaseDate: null },
      ],
      total: 1,
      failedCount: 0,
      capped: true,
    });
    const body = await bodyOf(await library("type=movie&path=/coming-soon"));
    expect(getMovieLibraryTab).toHaveBeenCalledWith(
      expect.objectContaining({ tab: "upcoming" }),
      expect.any(Function),
    );
    expect(getWantToPlayTab).not.toHaveBeenCalled();
    expect(body.capped).toBe(true);
    expect(body.entries[0]).toMatchObject({
      path: "/movies/1",
      user: MOVIE_STATE,
      card: { kind: "title", name: "Dark", releaseDate: null },
    });
  });

  it("keeps watched movies with card null when TMDB is down", async () => {
    getWatchedMoviesPage.mockResolvedValue({
      kind: "ok",
      rows: [{ tmdbId: 603, watchedAt: "2026-01-01T00:00:00Z", rating: 9 }],
      total: 1,
    });
    getLibraryMovieTitles.mockResolvedValue({ kind: "failed" });
    const body = await bodyOf(await library("type=movie&path=/watched"));
    expect(getWatchedMoviesPage).toHaveBeenCalledWith(
      "user-a",
      1,
      expect.any(Function),
    );
    expect(body.entries).toEqual([
      {
        type: "movie",
        id: 603,
        path: "/movies/603",
        user: MOVIE_STATE,
        card: null,
      },
    ]);
  });

  it("marks a watched movie TMDB no longer has as missing", async () => {
    getWatchedMoviesPage.mockResolvedValue({
      kind: "ok",
      rows: [{ tmdbId: 5, watchedAt: "2026-01-01T00:00:00Z", rating: null }],
      total: 1,
    });
    getLibraryMovieTitles.mockResolvedValue({ kind: "ok", movies: new Map() });
    const body = await bodyOf(await library("type=movie&path=/watched"));
    expect(body.entries[0].card).toEqual({ kind: "missing" });
  });
});

describe("games", () => {
  it("reads /coming-soon as the games Coming soon split", async () => {
    getWantToPlayTab.mockResolvedValue({
      kind: "ok",
      rows: [{ gameId: 1942 }, { gameId: 7 }],
      games: new Map([[1942, GAME]]),
      total: 2,
      capped: false,
    });
    const body = await bodyOf(await library("type=game&path=/coming-soon"));
    expect(getWantToPlayTab).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", tab: "coming-soon" }),
    );
    expect(body.entries.map((entry) => entry.card)).toEqual([
      {
        kind: "title",
        name: GAME.name,
        coverUrl: GAME.coverUrl,
        communityRating: 93,
        releaseDate: "2015-05-19",
      },
      { kind: "missing" },
    ]);
    expect(body.entries[0].path).toBe("/games/1942");
  });

  it("reads /playing as the games Playing page, keeping rows when IGDB is down", async () => {
    getGameLibraryPage.mockResolvedValue({
      kind: "ok",
      rows: [{ gameId: 1942 }],
      total: 25,
    });
    getLibraryGames.mockResolvedValue({ kind: "failed" });
    const body = await bodyOf(await library("type=game&path=/playing"));
    expect(getGameLibraryPage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", tab: "upcoming", page: 1 }),
    );
    expect(body.entries[0]).toMatchObject({ user: GAME_STATE, card: null });
    expect(body.nextPage).toBe(2);
  });

  it("answers an IGDB outage on Want to play with 502", async () => {
    getWantToPlayTab.mockResolvedValue({ kind: "igdb_failed" });
    const response = await library("type=game&path=/want-to-play");
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

it("answers 500 when the user state read fails", async () => {
  getGameLibraryPage.mockResolvedValue({
    kind: "ok",
    rows: [{ gameId: 1 }],
    total: 1,
  });
  getLibraryGames.mockResolvedValue({ kind: "ok", games: new Map() });
  readTitles.mockResolvedValue(null);
  expect((await library("type=game&path=/finished")).status).toBe(500);
});
