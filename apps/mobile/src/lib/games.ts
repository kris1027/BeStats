import type { ClearedOf } from "@bestats/core/api/v1/cleared";
import { v1GameWriteOkSchema } from "@bestats/core/api/v1/game";
import type { GameStatus } from "@bestats/core/tracking/types";

import { apiRequest } from "./api";
import { postRestore } from "./tracking";

/**
 * The game writes (spec 0035, API surface). Each runs the same command as the
 * web's Server Action, so the release gate on Playing, Finished and a score
 * stays on the server (spec 0033, AC-5, AC-6). A status and a score are
 * separate requests because they do not commute.
 */
function putGame(gameId: number, body: unknown) {
  return apiRequest(`/api/v1/me/games/${gameId}`, v1GameWriteOkSchema, {
    method: "PUT",
    body,
    auth: true,
  });
}

/** `PUT /api/v1/me/games/{id}` with a status. */
export function putGameStatus(gameId: number, status: GameStatus) {
  return putGame(gameId, { status });
}

/** `PUT /api/v1/me/games/{id}` with a score, or null to clear it. */
export function putGameRating(gameId: number, rating: number | null) {
  return putGame(gameId, { rating });
}

/** `DELETE /api/v1/me/games/{id}`: removes the game, with Undo. */
export function removeGame(gameId: number) {
  return apiRequest(`/api/v1/me/games/${gameId}`, v1GameWriteOkSchema, {
    method: "DELETE",
    auth: true,
  });
}

/** `POST …/games/{id}/restore`: the Undo of a removal or a cleared score. */
export function restoreGame(
  cleared: ClearedOf<"game_status"> | ClearedOf<"game_removed">,
) {
  return postRestore(
    `/api/v1/me/games/${cleared.gameId}/restore`,
    cleared,
    v1GameWriteOkSchema,
  );
}
