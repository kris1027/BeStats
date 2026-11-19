import {
  GAME_ERROR_TO_V1,
  gameIdParamSchema,
  v1GameBodySchema,
} from "@bestats/core/api/v1/game";
import { GAME_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import {
  removeGameCommand,
  setGameRatingCommand,
  setGameStatusCommand,
} from "@/lib/tracking/commands/game-writes";

const params = z.object({ id: gameIdParamSchema });

/**
 * `PUT /api/v1/me/games/{id}` (spec 0035): sets the caller's status or score
 * for a game, one change per request, through the very command behind the
 * web's `setGameStatus` or `setGameRating` (spec 0033, AC-5).
 *
 * The release gate runs inside the command on IGDB's date read on the
 * server: Playing, Finished or a score before release day (UTC) answers 409
 * `not_released` and writes nothing, while Want to play and clearing a score
 * are never gated (AC-6; AGENTS.md "Games"). A move to Want to play that
 * cleared a score returns the `status` Undo. The user id is the verified
 * token's, never the caller's (AGENTS.md sections 5 and 11).
 */
export const PUT = withV1({
  name: "me.games.put",
  auth: "bearer",
  input: { params, body: v1GameBodySchema },
  handler: async ({ input, user }) => {
    const gameId = input.params.id;
    const body = input.body;
    const result =
      "status" in body
        ? await setGameStatusCommand(bearerDeps(user), {
            gameId,
            status: body.status,
          })
        : await setGameRatingCommand(bearerDeps(user), {
            gameId,
            rating: body.rating,
          });
    return trackingAnswer(result, GAME_ERROR_TO_V1, GAME_TRACKING_MESSAGES);
  },
});

/**
 * `DELETE /api/v1/me/games/{id}` (spec 0035): removes a game from the
 * caller's list through the command behind `removeGame`, from any status and
 * never gated, with no IGDB read (spec 0026, AC-4, AC-9). Its `removed` Undo
 * is what the restore route takes back; a game already removed elsewhere is a
 * quiet success with no Undo.
 */
export const DELETE = withV1({
  name: "me.games.delete",
  auth: "bearer",
  input: { params },
  handler: async ({ input, user }) =>
    trackingAnswer(
      await removeGameCommand(bearerDeps(user), { gameId: input.params.id }),
      GAME_ERROR_TO_V1,
      GAME_TRACKING_MESSAGES,
    ),
});
