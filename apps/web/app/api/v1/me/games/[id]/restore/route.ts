import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import { GAME_ERROR_TO_V1, gameIdParamSchema } from "@bestats/core/api/v1/game";
import { GAME_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import {
  restoreGameStatusCommand,
  restoreRemovedGameCommand,
} from "@/lib/tracking/commands/game-writes";

/**
 * `POST /api/v1/me/games/{id}/restore` (spec 0035, Undo): takes back a move
 * to Want to play that cleared a score (`game_status`, the command behind
 * `restoreGameStatus`) or a removal (`game_removed`, behind
 * `restoreRemovedGame`). Any other kind, or a state naming another game, is
 * 400 (spec 0033, AC-7). No IGDB read and no release gate: a restore only
 * puts back what the caller already had, and the database refuses it as
 * `undo_expired` (409) once its 10 minute window has passed. RLS keeps it to
 * the caller's own row (AGENTS.md section 11).
 */
export const POST = withV1({
  name: "me.games.restore",
  auth: "bearer",
  input: {
    params: z.object({ id: gameIdParamSchema }),
    body: restoreBodySchema("game_status", "game_removed"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.gameId !== input.params.id) return v1Fail("invalid_input");
    const result =
      cleared.kind === "game_status"
        ? await restoreGameStatusCommand(bearerDeps(user), cleared)
        : await restoreRemovedGameCommand(bearerDeps(user), cleared);
    return trackingAnswer(result, GAME_ERROR_TO_V1, GAME_TRACKING_MESSAGES);
  },
});
