import { restoreBodySchema } from "@bestats/core/api/v1/cleared";
import { SHOW_ERROR_TO_V1, showIdParamSchema } from "@bestats/core/api/v1/show";
import { SHOW_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { v1Fail, withV1 } from "@/lib/api/v1/with-v1";
import { restoreShowTrackingCommand } from "@/lib/tracking/commands/show-writes";

/**
 * `POST /api/v1/me/shows/{id}/tracking/restore` (spec 0035, Undo): puts a
 * stopped show back at its old place with the `trackedAt` the stop returned,
 * through the command behind `restoreShowTracking`. Only a `show_tracking`
 * cleared state for this path's show is accepted (spec 0033, AC-7).
 */
export const POST = withV1({
  name: "me.shows.tracking.restore",
  auth: "bearer",
  input: {
    params: z.object({ id: showIdParamSchema }),
    body: restoreBodySchema("show_tracking"),
  },
  handler: async ({ input, user }) => {
    const { cleared } = input.body;
    if (cleared.showId !== input.params.id) return v1Fail("invalid_input");
    return trackingAnswer(
      await restoreShowTrackingCommand(bearerDeps(user), cleared),
      SHOW_ERROR_TO_V1,
      SHOW_TRACKING_MESSAGES,
    );
  },
});
