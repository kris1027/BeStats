import "server-only";

import type { LibraryList } from "@/lib/catalog/library-list";
import { type GameSummary, getGamesByIds, IgdbError } from "@/lib/igdb";
import { createClient } from "@/lib/supabase/server";

import {
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  listReadFailed,
  RANGE_NOT_SATISFIABLE,
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
export async function getGameLibraryPage({
  userId,
  tab,
  page,
}: {
  userId: string;
  tab: LibraryList;
  page: number;
}): Promise<LibraryPage<GameLibraryRow>> {
  const { status, order } = GAME_LIBRARY_TABS[tab];
  try {
    const supabase = await createClient();
    const from = (page - 1) * LIBRARY_PAGE_SIZE;
    const { data, error, count } = await supabase
      .from("user_game_state")
      .select("game_id, rating, added_at, started_at, finished_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .eq("status", status)
      .order(order, { ascending: false })
      .order("game_id", { ascending: true })
      .range(from, from + LIBRARY_PAGE_SIZE - 1);

    if (error?.code === RANGE_NOT_SATISFIABLE) {
      const head = await supabase
        .from("user_game_state")
        .select("game_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", status);
      if (head.error || head.count === null) return listReadFailed();
      return { kind: "ok", rows: [], total: head.count };
    }
    if (error || count === null) return listReadFailed();

    return {
      kind: "ok",
      total: count,
      rows: data.map((row) => ({
        gameId: row.game_id,
        rating: row.rating,
        addedAt: row.added_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
    };
  } catch {
    return listReadFailed();
  }
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
