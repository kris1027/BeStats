import "server-only";

import { cache } from "react";

import { getOptionalUser } from "@/lib/auth/user";
import { publicEnvProblems } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { logTrackingEvent, TRACKING_EVENT } from "./log";
import {
  EMPTY_GAME_TRACKING,
  type GameTrackingState,
  type TrackingRead,
} from "./types";

/**
 * The signed in user's status and score for one game, or `signed_out`, or
 * `failed` (spec 0026, AC-1, AC-12).
 *
 * Read per request and never inside `use cache`: the row belongs to one
 * person, and a shared entry would hand it to the next visitor (`AGENTS.md`
 * section 11). Only the game page's tracking slot calls it, inside its own
 * Suspense boundary, so the page shell stays prerendered. A grid of cards
 * reads through `getGameGridStates` instead. It checks
 * `publicEnvProblems()` first, as `getMovieTracking` does, so a clone with no
 * Supabase configuration still serves the page with no control.
 *
 * @param gameId An id the page has already parsed and IGDB has confirmed.
 */
export async function getGameTracking(
  gameId: number,
): Promise<TrackingRead<GameTrackingState>> {
  if (publicEnvProblems()) return { kind: "signed_out" };

  const user = await getOptionalUser();
  if (!user) return { kind: "signed_out" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_game_state")
    .select("status, rating")
    .eq("user_id", user.id)
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) {
    logTrackingEvent(TRACKING_EVENT.gameRead, "db_error");
    return { kind: "failed" };
  }
  if (!data) return { kind: "ok", state: EMPTY_GAME_TRACKING };

  return { kind: "ok", state: { status: data.status, rating: data.rating } };
}

/**
 * The signed in user's status and score for every game on a grid, in one
 * query for the whole grid (spec 0030, AC-1): a landing section, a list page
 * or a results page. A game with no row is absent from the map.
 *
 * The movie grid read's shape (`getMovieGridStates`): the argument is a
 * sorted id string, because React `cache()` compares arguments by identity
 * and only a primitive lets every badge and control on the grid share one
 * read per request. Per request and never inside `use cache`, for the reason
 * `getGameTracking` gives (`AGENTS.md` section 11). A failure is logged once
 * here, so the cards can quietly fall back to the catalog card (AC-9).
 *
 * @param idsKey The grid's game ids, from `gameIdsKey`.
 */
export const getGameGridStates = cache(
  async (
    idsKey: string,
  ): Promise<TrackingRead<Map<number, GameTrackingState>>> => {
    if (publicEnvProblems()) return { kind: "signed_out" };

    const user = await getOptionalUser();
    if (!user) return { kind: "signed_out" };

    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    if (ids.length === 0) return { kind: "ok", state: new Map() };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_game_state")
      .select("game_id, status, rating")
      .eq("user_id", user.id)
      .in("game_id", ids);

    if (error) {
      logTrackingEvent(TRACKING_EVENT.gameRead, "db_error");
      return { kind: "failed" };
    }

    return {
      kind: "ok",
      state: new Map(
        data.map((row) => [
          row.game_id,
          { status: row.status, rating: row.rating },
        ]),
      ),
    };
  },
);

/**
 * The cache key `getGameGridStates` expects: the same ids in any order give
 * the same key, so every card on a grid shares one read.
 *
 * @param ids The game ids on the grid.
 */
export function gameIdsKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}
