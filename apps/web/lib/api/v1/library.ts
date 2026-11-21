import "server-only";

import { nextPageOf, V1_PAGE_SIZE } from "@bestats/core/api/v1/browse";
import type { V1Library, V1LibraryEntry } from "@bestats/core/api/v1/library";
import { pickTitleState, type V1Titles } from "@bestats/core/api/v1/titles";
import type {
  LibraryList,
  LibraryPageKey,
  LibraryPath,
} from "@bestats/core/catalog/library-list";
import {
  gameHref,
  type LibraryType,
  titleHref,
} from "@bestats/core/catalog/media-type";
import { todayUtc } from "@bestats/core/tv/air-status";

import type { GameSummary } from "@/lib/igdb";
import type { BearerUser } from "@/lib/supabase/bearer";
import { readTitles } from "@/lib/tracking/commands/read-titles";
import {
  type GameLibraryRow,
  getGameLibraryPage,
  getLibraryGames,
  getWantToPlayTab,
} from "@/lib/tracking/game-library";
import {
  getLibraryMovieTitles,
  getMovieLibraryTab,
  getShowLibraryTab,
  getWatchedMoviesPage,
  type LibraryClient,
  type LibraryTabQuery,
  libraryLastPage,
  type MovieTabCard,
  type ShowTabCard,
} from "@/lib/tracking/library-lists";

import { bearerDeps } from "./tracking";
import { type V1Outcome, v1Fail, v1Ok } from "./with-v1";

/** One entry before its `user` state is filled in from `readTitles`. */
type Placed = V1LibraryEntry extends infer E
  ? E extends V1LibraryEntry
    ? Omit<E, "path" | "user">
    : never
  : never;

/** A library page's placed entries and its notes, or a refusal. */
type PlacedPage =
  | {
      kind: "ok";
      placed: Placed[];
      total: number;
      failedCount: number;
      capped: boolean;
    }
  | { kind: "failure"; outcome: V1Outcome };

/** A failed Postgres read, already logged by the loader. */
const DB_FAILED: PlacedPage = { kind: "failure", outcome: v1Fail("internal") };

/** A systemic catalog failure on a page that places titles by its dates. */
const CATALOG_FAILED: PlacedPage = {
  kind: "failure",
  outcome: v1Fail("catalog_unavailable"),
};

/**
 * `GET /api/v1/me/library` (spec 0035, `LibraryEntry`): one page of one
 * library page for the bearer's user, from the very loaders the web's
 * library tabs call, with the bearer client in place of the cookie one, so
 * placement and order are the web's (AGENTS.md section 9). Nothing is
 * written (spec 0020, AC-21).
 *
 * Settled for 4d (prompts/mobile-api-v1.md): pages that place titles by
 * catalog dates answer 502 when the catalog is down, as the web shows its
 * error panel; Watched movies, Playing and Finished come from stored rows,
 * so they answer with `card: null` and the history stays visible
 * (AGENTS.md section 12). A title the catalog no longer has is a missing
 * card. Each entry's `user` is exactly what `/me/titles` returns for it.
 *
 * @param pageKey The page `libraryPageAt` found for the request's type and
 * route; the client never names a key.
 */
export async function readLibraryPage(
  user: BearerUser,
  request: { type: LibraryType; path: LibraryPath; page: number },
  pageKey: LibraryPageKey,
): Promise<V1Outcome> {
  const { type, path, page } = request;
  const getClient: LibraryClient = async () => user.client;
  const today = todayUtc(new Date());

  let placed: PlacedPage;
  if (type === "game") {
    placed = await placeGames(user.userId, pageKey, page, today, getClient);
  } else if (pageKey === "coming-soon") {
    // `libraryPageAt` never gives a shows or movies tab this key.
    return v1Fail("not_found");
  } else {
    const query: LibraryTabQuery<LibraryList> = {
      userId: user.userId,
      tab: pageKey,
      page,
      today,
    };
    placed =
      type === "tv"
        ? await placeShows(query, getClient)
        : await placeMovies(query, getClient);
  }
  if (placed.kind === "failure") return placed.outcome;

  const titles = await readTitles(
    bearerDeps(user),
    placed.placed.map(({ type, id }) => ({ type, id })),
  );
  if (titles === null) return v1Fail("internal");

  const entries: V1LibraryEntry[] = [];
  for (const entry of placed.placed) {
    const withState = withUser(entry, titles);
    if (withState === null) return v1Fail("internal");
    entries.push(withState);
  }

  const body: V1Library = {
    type,
    path,
    page,
    pageSize: V1_PAGE_SIZE,
    entries,
    total: placed.total,
    failedCount: placed.failedCount,
    capped: placed.capped,
    nextPage: nextPageOf(page, libraryLastPage(placed.total)),
  };
  return v1Ok(body);
}

/**
 * The entry with its route and its `user` state, the one `/me/titles`
 * returns for its key; null when that state is missing or of another type,
 * which the page answers as an error, never a guess (AGENTS.md section 11).
 */
function withUser(entry: Placed, titles: V1Titles): V1LibraryEntry | null {
  switch (entry.type) {
    case "movie": {
      const user = pickTitleState(titles, "movie", entry.id);
      if (user === null) return null;
      return { ...entry, path: titleHref("movie", entry.id), user };
    }
    case "tv": {
      const user = pickTitleState(titles, "tv", entry.id);
      if (user === null) return null;
      return { ...entry, path: titleHref("tv", entry.id), user };
    }
    case "game": {
      const user = pickTitleState(titles, "game", entry.id);
      if (user === null) return null;
      return { ...entry, path: gameHref(entry.id), user };
    }
  }
}

const MISSING = { kind: "missing" } as const;

/** Up next, Upcoming or Watched shows, placed by `classifyShow`. */
async function placeShows(
  query: LibraryTabQuery<LibraryList>,
  getClient: LibraryClient,
): Promise<PlacedPage> {
  const tab = await getShowLibraryTab(query, getClient);
  if (tab.kind === "failed") return DB_FAILED;
  if (tab.kind === "tmdb_failed") return CATALOG_FAILED;
  return {
    kind: "ok",
    placed: tab.cards.map((card) => ({
      type: "tv",
      id: card.showId,
      card: showCard(card),
    })),
    total: tab.total,
    failedCount: tab.failedCount,
    capped: tab.capped,
  };
}

function showCard(card: ShowTabCard): Extract<Placed, { type: "tv" }>["card"] {
  if (card.page === "missing") return MISSING;
  const { showId: _id, title, ...place } = card;
  return { kind: "title", ...title, place };
}

/** Movies: Watchlist and Coming soon are placed, Watched is stored rows. */
async function placeMovies(
  query: LibraryTabQuery<LibraryList>,
  getClient: LibraryClient,
): Promise<PlacedPage> {
  if (query.tab === "watched") {
    return placeWatchedMovies(query.userId, query.page, getClient);
  }
  const tab = await getMovieLibraryTab({ ...query, tab: query.tab }, getClient);
  if (tab.kind === "failed") return DB_FAILED;
  if (tab.kind === "tmdb_failed") return CATALOG_FAILED;
  return {
    kind: "ok",
    placed: tab.cards.map((card) => ({
      type: "movie",
      id: card.movieId,
      card: movieCard(card),
    })),
    total: tab.total,
    failedCount: tab.failedCount,
    capped: tab.capped,
  };
}

function movieCard(
  card: MovieTabCard,
): Extract<Placed, { type: "movie" }>["card"] {
  if (card.page === "missing") return MISSING;
  return { kind: "title", ...card.title, releaseDate: card.releaseDate };
}

/**
 * Watched movies: one counted page of stored rows, then their titles. A
 * TMDB outage keeps every row with `card: null`.
 */
async function placeWatchedMovies(
  userId: string,
  page: number,
  getClient: LibraryClient,
): Promise<PlacedPage> {
  const rows = await getWatchedMoviesPage(userId, page, getClient);
  if (rows.kind === "failed") return DB_FAILED;
  const titles = await getLibraryMovieTitles(
    rows.rows.map((row) => row.tmdbId),
  );
  return {
    kind: "ok",
    placed: rows.rows.map((row) => {
      if (titles.kind === "failed") {
        return { type: "movie", id: row.tmdbId, card: null };
      }
      const movie = titles.movies.get(row.tmdbId);
      return {
        type: "movie",
        id: row.tmdbId,
        card:
          movie === undefined
            ? MISSING
            : {
                kind: "title",
                name: movie.title,
                posterUrl: movie.posterUrl,
                tmdbRating: movie.tmdbRating,
                releaseDate: movie.releaseDate,
              },
      };
    }),
    total: rows.total,
    failedCount: 0,
    capped: false,
  };
}

/**
 * Games: Want to play and Coming soon split one placed list by release
 * date; Playing and Finished are counted pages of stored rows.
 */
async function placeGames(
  userId: string,
  pageKey: LibraryPageKey,
  page: number,
  today: string,
  getClient: LibraryClient,
): Promise<PlacedPage> {
  if (pageKey === "watchlist" || pageKey === "coming-soon") {
    const tab = await getWantToPlayTab({
      userId,
      tab: pageKey,
      page,
      today,
      getClient,
    });
    if (tab.kind === "failed") return DB_FAILED;
    if (tab.kind === "igdb_failed") return CATALOG_FAILED;
    return {
      kind: "ok",
      placed: tab.rows.map((row) => gameEntry(row, tab.games)),
      total: tab.total,
      failedCount: 0,
      capped: tab.capped,
    };
  }

  const rows = await getGameLibraryPage({
    userId,
    tab: pageKey,
    page,
    getClient,
  });
  if (rows.kind === "failed") return DB_FAILED;
  const games = await getLibraryGames(rows.rows.map((row) => row.gameId));
  return {
    kind: "ok",
    placed: rows.rows.map((row) =>
      games.kind === "failed"
        ? { type: "game", id: row.gameId, card: null }
        : gameEntry(row, games.games),
    ),
    total: rows.total,
    failedCount: 0,
    capped: false,
  };
}

function gameEntry(
  row: GameLibraryRow,
  games: ReadonlyMap<number, GameSummary>,
): Placed {
  const game = games.get(row.gameId);
  return {
    type: "game",
    id: row.gameId,
    card:
      game === undefined
        ? MISSING
        : {
            kind: "title",
            name: game.name,
            coverUrl: game.coverUrl,
            communityRating: game.communityRating,
            releaseDate: game.releaseDate,
            startedAt: row.startedAt,
            finishedAt: row.finishedAt,
          },
  };
}
