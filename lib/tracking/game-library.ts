import "server-only";

import { isGameReleased } from "@/lib/catalog/game-page";
import type { LibraryList, LibraryPageKey } from "@/lib/catalog/library-list";
import { type GameSummary, getGamesByIds, IgdbError } from "@/lib/igdb";
import { createClient } from "@/lib/supabase/server";

import {
  capRows,
  compareDates,
  LIBRARY_CLASSIFY_LIMIT,
  type LibraryPage,
  listReadFailed,
  pageSlice,
  readCountedPage,
} from "./library-lists";
import { logTrackingEvent, TRACKING_EVENT } from "./log";
import type { GameStatus } from "./types";

/**
 * The reads behind the games tabs of `/watchlist`, `/upcoming` and
 * `/watched` (spec 0027, AC-6, AC-7).
 *
 * A game's status is stored, set by hand (`AGENTS.md`, Games), so unlike the
 * show and movie tabs nothing is classified: each tab is one ordered,
 * counted Postgres page, then one IGDB batch for just that page's games.
 * There is no 500 title ceiling and no failed titles note.
 *
 * Neither may ever run inside `use cache`: the rows belong to one person
 * (`AGENTS.md` section 11). The query filters on `user_id` explicitly as well
 * as through row level security, and every order ends in `game_id`, so two
 * games stamped in the same instant never swap places between pages.
 */

/** The date column a tab orders by, which is also its card's date line. */
type GameOrder = "added_at" | "started_at" | "finished_at";

/**
 * Which status each library page lists for games, and in what order (spec
 * 0027, tab mapping). The one place the route to status mapping is written.
 */
export const GAME_LIBRARY_TABS: Record<
  LibraryList,
  { status: GameStatus; order: GameOrder }
> = {
  watchlist: { status: "want_to_play", order: "added_at" },
  upcoming: { status: "playing", order: "started_at" },
  watched: { status: "finished", order: "finished_at" },
};

/** One game row on a tab, before IGDB fills in the card. */
export type GameLibraryRow = {
  gameId: number;
  /** The stored status, which the card shows (spec 0030, AC-8, AC-11). */
  status: GameStatus;
  /** The personal score; only Playing and Finished can hold one. */
  rating: number | null;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/**
 * One page of a games tab, newest first by the tab's date, with an exact
 * count (AC-6). A page past the end comes back empty with the real total, so
 * the page can redirect to the last page.
 *
 * @param query.userId The verified session's user, never a client value.
 * @param query.page A page already parsed by `parsePageParam`.
 */
export function getGameLibraryPage({
  userId,
  tab,
  page,
}: {
  userId: string;
  tab: LibraryList;
  page: number;
}): Promise<LibraryPage<GameLibraryRow>> {
  const { status, order } = GAME_LIBRARY_TABS[tab];
  return readCountedPage({
    page,
    read: (supabase, from, to) =>
      supabase
        .from("user_game_state")
        .select(GAME_ROW_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .eq("status", status)
        .order(order, { ascending: false })
        .order("game_id", { ascending: true })
        .range(from, to),
    count: (supabase) =>
      supabase
        .from("user_game_state")
        .select("game_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", status),
    map: (rows) => rows.map(toGameRow),
  });
}

/** The columns every games tab reads. */
const GAME_ROW_COLUMNS =
  "game_id, status, rating, added_at, started_at, finished_at";

/** A `user_game_state` row as PostgREST returns `GAME_ROW_COLUMNS`. */
type GameRowRaw = {
  game_id: number;
  status: GameStatus;
  rating: number | null;
  added_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function toGameRow(row: GameRowRaw): GameLibraryRow {
  return {
    gameId: row.game_id,
    status: row.status,
    rating: row.rating,
    addedAt: row.added_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * The two pages Want to play games split across: released ones on Want to
 * play (`/watchlist`), the rest on Coming soon (prompts/game-coming-soon.md).
 */
export type WantToPlayPage = Extract<
  LibraryPageKey,
  "watchlist" | "coming-soon"
>;

/**
 * One page of Want to play or Coming soon, or why there is none: a failed
 * Postgres read, or a systemic IGDB failure, each with its own panel and
 * never an empty list. `total` counts the page's games across pages;
 * `capped` says the ceiling left older games unchecked.
 */
export type WantToPlayTab =
  | {
      kind: "ok";
      rows: GameLibraryRow[];
      games: Map<number, GameSummary>;
      total: number;
      capped: boolean;
    }
  | { kind: "failed" }
  | { kind: "igdb_failed" };

/**
 * One page of Want to play or Coming soon (prompts/game-coming-soon.md).
 *
 * Which of the two a Want to play game is on is worked out per request, as
 * the movie Watchlist and Coming soon are, never stored: the status is set
 * by hand (`AGENTS.md`, Games), the page follows IGDB's release date and the
 * release gate's own rule, `isGameReleased`. So a status read can't be
 * counted in SQL here: up to `LIBRARY_CLASSIFY_LIMIT` rows, newest added
 * first, then one IGDB batch for all of them, then the split and the page.
 * Both pages read the same rows, so every game is on exactly one.
 *
 * Want to play keeps the added order, with any game IGDB no longer has at
 * the end, never hidden; Coming soon goes soonest release first, TBA last,
 * then the added order.
 *
 * @param query.userId The verified session's user, never a client value.
 * @param query.page A page already parsed by `parsePageParam`.
 * @param query.today `requestTodayUtc()`, read once per request.
 */
export async function getWantToPlayTab({
  userId,
  tab,
  page,
  today,
}: {
  userId: string;
  tab: WantToPlayPage;
  page: number;
  today: string;
}): Promise<WantToPlayTab> {
  let rows: GameLibraryRow[];
  let capped: boolean;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_game_state")
      .select(GAME_ROW_COLUMNS)
      .eq("user_id", userId)
      .eq("status", "want_to_play")
      .order("added_at", { ascending: false })
      .order("game_id", { ascending: true })
      .limit(LIBRARY_CLASSIFY_LIMIT + 1);
    if (error) return listReadFailed();
    ({ rows, capped } = capRows(data.map(toGameRow)));
  } catch {
    return listReadFailed();
  }

  const read = await getLibraryGames(rows.map((row) => row.gameId));
  if (read.kind === "failed") return { kind: "igdb_failed" };
  const { games } = read;

  const placed = rows.filter(
    (row) => wantToPlayPage(games.get(row.gameId), today) === tab,
  );
  // A stable sort, so the added order holds within a date and among the
  // missing games.
  const ordered =
    tab === "coming-soon"
      ? placed.toSorted((a, b) =>
          compareDates(
            games.get(a.gameId)?.releaseDate ?? null,
            games.get(b.gameId)?.releaseDate ?? null,
          ),
        )
      : placed.toSorted(
          (a, b) => Number(!games.has(a.gameId)) - Number(!games.has(b.gameId)),
        );

  return {
    kind: "ok",
    rows: pageSlice(ordered, page),
    games,
    total: ordered.length,
    capped,
  };
}

/**
 * The page a Want to play game is on. A game IGDB no longer has stays on
 * Want to play, where its missing card can be removed; nothing about its
 * date is known.
 */
function wantToPlayPage(
  game: GameSummary | undefined,
  today: string,
): WantToPlayPage {
  if (game === undefined) return "watchlist";
  return isGameReleased(game.releaseDate, today) ? "watchlist" : "coming-soon";
}

/** A page's games, keyed by IGDB id, or a systemic IGDB failure. */
export type LibraryGames =
  | { kind: "ok"; games: Map<number, GameSummary>; missingIds: number[] }
  | { kind: "failed" };

/**
 * The IGDB games for one page of a games tab, in one cached batch read
 * (AC-7). A game IGDB no longer has is in `missingIds`, so the page shows its
 * "No longer on IGDB" card. A systemic failure is `failed` rather than an
 * empty map, which would render every game as missing and invite the user to
 * remove rows that are fine.
 *
 * Only an `IgdbError` is a failure. An `IgdbValidationError` cannot happen
 * with ids from the database, so it still throws, as a bug.
 *
 * @param gameIds At most `LIBRARY_PAGE_SIZE` ids.
 */
export async function getLibraryGames(
  gameIds: readonly number[],
): Promise<LibraryGames> {
  try {
    const batch = await getGamesByIds(gameIds);
    return {
      kind: "ok",
      games: new Map(batch.found.map((game) => [game.id, game])),
      missingIds: batch.missingIds,
    };
  } catch (error) {
    if (!(error instanceof IgdbError)) throw error;
    logTrackingEvent(TRACKING_EVENT.listRead, "igdb_unavailable");
    return { kind: "failed" };
  }
}
