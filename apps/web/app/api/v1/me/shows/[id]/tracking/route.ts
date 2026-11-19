import { SHOW_ERROR_TO_V1, showIdParamSchema } from "@bestats/core/api/v1/show";
import { SHOW_TRACKING_MESSAGES } from "@bestats/core/tracking/messages";
import { z } from "zod";

import { bearerDeps, trackingAnswer } from "@/lib/api/v1/tracking";
import { withV1 } from "@/lib/api/v1/with-v1";
import {
  trackShowCommand,
  untrackShowCommand,
} from "@/lib/tracking/commands/show-writes";

const params = z.object({ id: showIdParamSchema });

/**
 * `PUT /api/v1/me/shows/{id}/tracking` (spec 0035): tracks a show after
 * confirming it with TMDB, through the command behind `trackShow` (spec 0033,
 * AC-5). Tracking a tracked show changes nothing.
 */
export const PUT = withV1({
  name: "me.shows.tracking.put",
  auth: "bearer",
  input: { params },
  handler: async ({ input, user }) =>
    trackingAnswer(
      await trackShowCommand(bearerDeps(user), { showId: input.params.id }),
      SHOW_ERROR_TO_V1,
      SHOW_TRACKING_MESSAGES,
    ),
});

/**
 * `DELETE /api/v1/me/shows/{id}/tracking` (spec 0035): stops tracking and
 * keeps every mark and rating (AGENTS.md section 7), through the command
 * behind `untrackShow`. Its `undo` is what the tracking restore takes back;
 * a show already stopped elsewhere is a quiet success with no Undo.
 */
export const DELETE = withV1({
  name: "me.shows.tracking.delete",
  auth: "bearer",
  input: { params },
  handler: async ({ input, user }) =>
    trackingAnswer(
      await untrackShowCommand(bearerDeps(user), { showId: input.params.id }),
      SHOW_ERROR_TO_V1,
      SHOW_TRACKING_MESSAGES,
    ),
});
