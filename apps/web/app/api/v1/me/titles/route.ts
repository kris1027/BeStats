import { titleIdsParamSchema } from "@bestats/core/api/v1/titles";
import { z } from "zod";

import { v1Fail, v1Ok, withV1 } from "@/lib/api/v1/with-v1";
import { readMovieTitles } from "@/lib/tracking/commands/read-movie-titles";

/**
 * `GET /api/v1/me/titles?ids=movie:603,movie:550` (spec 0033, child 0035):
 * the caller's own state for up to 40 titles at once.
 *
 * The tracer ships movie keys only (prompts/mobile-tracer.md, decision 6), so
 * the movie screen can show whether a movie is already watched; show and game
 * keys answer 400 until step 4 adds them. `private, no-store`, as every `me`
 * route (AGENTS.md section 11).
 */
export const GET = withV1({
  name: "me.titles.get",
  auth: "bearer",
  input: { query: z.object({ ids: titleIdsParamSchema }) },
  handler: async ({ input, user }) => {
    const titles = await readMovieTitles(
      { userId: user.userId, getClient: async () => user.client },
      input.query.ids,
    );
    return titles ? v1Ok(titles) : v1Fail("internal");
  },
});
