import "server-only";

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
 * Suspense boundary, so the page shell stays prerendered. It checks
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
